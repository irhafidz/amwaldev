import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import {
  getWaStatus,
  initBaileys,
  isInitializing,
  logoutWhatsApp,
  sendMessage,
} from './baileys';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SURROUNDING_QUOTES = /^(["'])(.*)\1$/;

/**
 * Whitespace and a leftover pair of quotes (`INTERNAL_SECRET="abc"` written
 * by hand, or copied through a tool that does not strip them) must not make
 * two identical secrets compare unequal.
 */
function cleanSecret(raw: string): string {
  return raw.trim().replace(SURROUNDING_QUOTES, '$2').trim();
}

const CONFIGURED_SECRET = cleanSecret(
  process.env.INTERNAL_SECRET || process.env.WA_BOT_SECRET || ''
);

// [Sprint 11.1 — remediasi keamanan] Tidak ada lagi secret hardcoded yang
// selalu diterima (AMW-02 / S10-N-01). Di produksi, boot menolak sama
// sekali tanpa secret dikonfigurasi — fail-fast, bukan fallback diam-diam.
if (IS_PRODUCTION && CONFIGURED_SECRET.length === 0) {
  throw new Error(
    'wa-bot: INTERNAL_SECRET (atau WA_BOT_SECRET) wajib diset saat NODE_ENV=production — menolak boot tanpa secret.'
  );
}

const BEARER_REGEX = /^Bearer\s+/i;
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);
const IPV4_MAPPED_PREFIX = '::ffff:';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * [Sprint 11.1 — remediasi keamanan] Mengganti dua celah dari versi lama:
 *
 * 1. Bypass berbasis header `Host` — header itu dikirim klien sendiri dan
 *    bisa dipalsukan bebas, termasuk saat `NODE_ENV=production`.
 * 2. Tiga string secret yang selalu diterima tanpa syarat, dua di antaranya
 *    hardcoded langsung di berkas ini.
 *
 * Aturan baru:
 * - `CONFIGURED_SECRET` terisi (produksi maupun dev/test dengan `.env`):
 *   HANYA secret itu yang valid, dibandingkan `timingSafeEqual` seperti
 *   token webhook Mayar. Tidak ada string cadangan.
 * - `CONFIGURED_SECRET` kosong (mesin agent lokal tanpa `.env`): produksi
 *   sudah ditolak saat boot (lihat guard di atas); di dev/test, hanya
 *   klien yang alamat socket-nya BENAR-BENAR loopback diizinkan — dibaca
 *   dari `request.socket.remoteAddress` (alamat koneksi TCP sungguhan),
 *   bukan dari header apa pun yang bisa dipalsukan.
 */
function isAuthorized(request: Request, remoteAddress: string): boolean {
  const incomingSecret =
    (
      request.headers.get('x-internal-secret') ??
      request.headers.get('authorization')?.replace(BEARER_REGEX, '') ??
      null
    )?.trim() ?? null;

  if (CONFIGURED_SECRET) {
    return (
      incomingSecret !== null &&
      timingSafeEqualString(incomingSecret, CONFIGURED_SECRET)
    );
  }

  if (remoteAddress.length === 0) {
    return false;
  }
  const normalized = remoteAddress.startsWith(IPV4_MAPPED_PREFIX)
    ? remoteAddress.slice(IPV4_MAPPED_PREFIX.length)
    : remoteAddress;
  return LOOPBACK_ADDRESSES.has(normalized);
}

function handleStatus(): Response {
  const currentStatus = getWaStatus();
  if (currentStatus.status === 'DISCONNECTED' && !isInitializing()) {
    initBaileys().catch(() => {
      // Reconnect/initialization error handled inside initBaileys
    });
  }
  return json(currentStatus);
}

async function handleLogout(): Promise<Response> {
  try {
    return json(await logoutWhatsApp());
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Logout failed',
      },
      500
    );
  }
}

async function handleSend(request: Request): Promise<Response> {
  let body: { message?: unknown; phone?: unknown; to?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Body bukan JSON yang valid' }, 400);
  }

  const to = typeof body.to === 'string' ? body.to : body.phone;
  const message = body.message;
  if (
    typeof to !== 'string' ||
    to.trim().length === 0 ||
    typeof message !== 'string' ||
    message.trim().length === 0
  ) {
    return json(
      { error: 'Bad Request: Missing "to"/"phone" or "message"' },
      400
    );
  }

  try {
    await sendMessage(to, message);
    return json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Send failed',
      },
      500
    );
  }
}

async function handleRequest(
  request: Request,
  remoteAddress: string
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (!isAuthorized(request, remoteAddress)) {
    return json(
      { error: 'Unauthorized: Invalid or missing internal secret header' },
      401
    );
  }

  const path = url.pathname;
  if (
    request.method === 'GET' &&
    (path === '/api/wa/status' || path === '/status')
  ) {
    return handleStatus();
  }
  if (
    request.method === 'POST' &&
    (path === '/api/wa/logout' || path === '/logout')
  ) {
    return await handleLogout();
  }
  if (
    request.method === 'POST' &&
    (path === '/api/wa/send' || path === '/send-message' || path === '/send')
  ) {
    return await handleSend(request);
  }

  return json({ error: 'Endpoint Not Found' }, 404);
}

/**
 * Jembatan Node ↔ Web. Runtime image ini adalah Node 20 murni (lihat
 * apps/wa-bot/Dockerfile — Baileys butuh runtime Node untuk kripto native),
 * dan Node tidak punya `Bun.serve`. Seluruh handler di atas sudah ditulis
 * terhadap `Request`/`Response` standar Web, jadi cukup dua fungsi penerjemah
 * di sini alih-alih menulis ulang setiap handler.
 */
async function readBody(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Uint8Array);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // ArrayBuffer, bukan Buffer: `Buffer` tidak memenuhi `BodyInit` pada
  // definisi tipe Web standar yang dipakai @types/node versi ini.
  return merged.buffer;
}

function buildHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const url = new URL(
    request.url ?? '/',
    // `request.url` selalu origin-relative di server Node; host dipakai apa
    // adanya karena hanya `url.pathname` yang dibaca handler.
    `http://${request.headers.host ?? `localhost:${process.env.PORT ?? 3005}`}`
  );

  const init: RequestInit = {
    method,
    headers: buildHeaders(request),
  };
  if (hasBody) {
    // Buffer, bukan stream: `Request` dengan body stream diwajibkan menyetel
    // `duplex: 'half'`, dan handler kita toh memakai `request.json()` yang
    // membaca body sampai habis.
    init.body = await readBody(request);
  }

  return new Request(url, init);
}

async function writeWebResponse(
  response: Response,
  target: ServerResponse
): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => {
    target.setHeader(key, value);
  });
  target.end(Buffer.from(await response.arrayBuffer()));
}

const port = Number(process.env.PORT) || 3005;

const server = createServer((request, response) => {
  const remoteAddress = request.socket.remoteAddress ?? '';

  toWebRequest(request)
    .then((webRequest) => handleRequest(webRequest, remoteAddress))
    .then((webResponse) => writeWebResponse(webResponse, response))
    .catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
      }
      response.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
});

server.listen(port, () => {
  console.log(`wa-bot listening on http://localhost:${port}`);
});

initBaileys().catch(() => {
  // Reconnect and session recovery are handled inside initBaileys.
});

process.on('uncaughtException', () => {
  // Keep the long-lived daemon alive; Baileys reports connection errors itself.
});

process.on('unhandledRejection', () => {
  // HTTP errors are handled per request; background rejections are non-fatal.
});

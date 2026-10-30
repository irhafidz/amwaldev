import fs from 'node:fs';
import path from 'node:path';
import type { Boom } from '@hapi/boom';
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

export type WaStatus = 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTED';

export interface WaStatusPayload {
  phone?: string;
  qrCodeDataUrl?: string;
  status: WaStatus;
}

let sock: ReturnType<typeof makeWASocket> | null = null;
let currentQrDataUrl: string | null = null;
let linkedPhone: string | null = null;
let status: WaStatus = 'DISCONNECTED';
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let initializing = false;

const DEFAULT_SESSION_DIR = path.resolve(
  process.cwd().endsWith('wa-bot')
    ? './auth_info_baileys'
    : './apps/wa-bot/auth_info_baileys'
);
const SESSION_DIR = process.env.BAILEYS_SESSION_DIR || DEFAULT_SESSION_DIR;
const MAX_RECONNECT_DELAY_MS = 30_000;

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function resetReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) {
    return;
  }

  const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initBaileys().catch(() => {
      scheduleReconnect();
    });
  }, delay);
}

function phoneFromJid(jid: string | undefined): string | null {
  if (!jid) {
    return null;
  }

  return jid.split(':')[0]?.split('@')[0] ?? null;
}

function clearSession(): void {
  currentQrDataUrl = null;
  linkedPhone = null;
  status = 'DISCONNECTED';

  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

export function isInitializing(): boolean {
  return initializing || sock !== null;
}

export async function initBaileys(): Promise<void> {
  if (initializing) {
    return;
  }
  if (sock) {
    return;
  }

  initializing = true;
  resetReconnectTimer();

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    let version: [number, number, number] | undefined;
    try {
      const versionRes = await fetchLatestBaileysVersion();
      version = versionRes.version;
    } catch {
      // Offline fallback
    }

    const socket = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: pino({ level: 'silent' }) as never,
      printQRInTerminal: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      emitOwnEvents: true,
    });

    sock = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('[WA-BOT] connection.update:', {
        connection,
        hasQr: Boolean(qr),
      });

      if (qr) {
        QRCode.toDataURL(qr)
          .then((dataUrl) => {
            currentQrDataUrl = dataUrl;
            status = 'SCAN_QR';
            console.log(
              '[WA-BOT] QR Code generated successfully, status: SCAN_QR'
            );
          })
          .catch((err) => {
            console.error(
              '[WA-BOT] Failed to convert QR code to data URL:',
              err
            );
            currentQrDataUrl = null;
            status = 'DISCONNECTED';
          });
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        linkedPhone = phoneFromJid(socket.user?.id);
        currentQrDataUrl = null;
        status = 'CONNECTED';
        console.log(
          '[WA-BOT] WhatsApp connected! Phone:',
          linkedPhone ? `***${linkedPhone.slice(-4)}` : 'unknown'
        );
        return;
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(
          '[WA-BOT] Connection closed. StatusCode:',
          statusCode,
          'LoggedOut:',
          loggedOut
        );

        currentQrDataUrl = null;
        linkedPhone = null;
        status = 'DISCONNECTED';
        sock = null;

        if (loggedOut) {
          clearSession();
        }

        scheduleReconnect();
      }
    });
  } catch (err) {
    console.error('[WA-BOT] Error initializing Baileys:', err);
    sock = null;
    status = 'DISCONNECTED';
    scheduleReconnect();
  } finally {
    initializing = false;
  }
}

export function getWaStatus(): WaStatusPayload {
  return {
    status,
    ...(currentQrDataUrl ? { qrCodeDataUrl: currentQrDataUrl } : {}),
    ...(linkedPhone ? { phone: linkedPhone } : {}),
  };
}

export function getQrDataUrl(): string | null {
  return currentQrDataUrl;
}

export async function logoutWhatsApp(): Promise<WaStatusPayload> {
  resetReconnectTimer();

  const socket = sock;
  sock = null;

  if (socket) {
    try {
      await socket.logout();
    } catch {
      // Sesi lokal tetap dihapus di bawah; logout remote best-effort.
    }
    try {
      socket.end(undefined);
    } catch {
      // Socket sudah tertutup.
    }
  }

  clearSession();
  await initBaileys();

  return getWaStatus();
}

export async function sendMessage(to: string, message: string): Promise<void> {
  if (!(sock && status === 'CONNECTED')) {
    throw new Error('WhatsApp is not connected to a device.');
  }

  let formatted = to.replace(/\D/g, '');
  if (formatted.startsWith('0')) {
    formatted = `62${formatted.slice(1)}`;
  }

  const jid = formatted.includes('@s.whatsapp.net')
    ? formatted
    : `${formatted}@s.whatsapp.net`;

  await sock.sendMessage(jid, { text: message });
}

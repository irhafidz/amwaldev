import { env } from '@/env/server';

/**
 * The one place `apps/web` calls the wa-bot service from server code.
 *
 * Auth is a single `X-Internal-Secret` header. It used to be sent twice, as
 * `X-Internal-Secret` *and* `x-internal-secret`; HTTP header names are
 * case-insensitive, so `Headers` merged them into `"secret, secret"`, which
 * never equals the bot's secret. The bot answered 401 even though both `.env`
 * files held identical values.
 */

const TRAILING_SLASH = /\/+$/;
const SURROUNDING_QUOTES = /^(["'])(.*)\1$/;
const TIMEOUT_MS = 5000;

/** `"secret"` (quotes left over from a hand-edited .env) must equal `secret`. */
export function cleanSecret(raw: string): string {
  return raw.trim().replace(SURROUNDING_QUOTES, '$2').trim();
}

export type WaBotResult =
  | { body: unknown; ok: true }
  | { ok: false; reason: string; status: number | null };

export async function callWaBot(
  path: string,
  init?: RequestInit
): Promise<WaBotResult> {
  const baseUrl =
    process.env.BAILEYS_SERVICE_URL ||
    process.env.WA_BOT_URL ||
    env.BAILEYS_SERVICE_URL;

  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Internal-Secret', cleanSecret(env.INTERNAL_SECRET));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl.replace(TRAILING_SLASH, '')}${path}`,
      { ...init, headers, signal: controller.signal }
    );

    if (!response.ok) {
      return {
        ok: false,
        reason: `http-${response.status}`,
        status: response.status,
      };
    }
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, reason: 'unreachable', status: null };
  } finally {
    clearTimeout(timeout);
  }
}

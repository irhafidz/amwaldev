import { ACCESS_COOKIE } from '@amwal/core/auth/cookie-names';
import { readToken, resolveSessionUser } from '@amwal/core/auth/guard';
import { getCookie } from '@orpc/server/helpers';
import { env } from '@/env/server';
import type { SessionUser } from './types';

/**
 * Verifies an access token using the exact same decision logic
 * `apps/server`'s guard and `apps/web`'s oRPC guard both call — no more
 * loose `process.env.JWT_SECRET || 'dev_secret_only_never_use_in_prod'`
 * fallback (Putaran 17, Batch 2); `env/server.ts` guarantees the real secret
 * or fails loudly at boot.
 *
 * This module is intentionally read-only for REST/SSR callers
 * (`lib/auth/index.ts` → `fetchSessionUser`). Token issuance, refresh
 * rotation and revocation are owned by `@amwal/core/auth/tokens`, wired to
 * this app's own `db` in `lib/orpc/router/auth.ts`.
 */
const secret = new TextEncoder().encode(env.JWT_SECRET);

export function verifyAccessToken(token: string): Promise<SessionUser | null> {
  return resolveSessionUser(token, secret);
}

/**
 * The session behind a request, or `null`. The one place that decides where a
 * token may come from (`Authorization: Bearer`, then the `amwal_token`
 * cookie); oRPC guards, plain HTTP routes and public procedures all call it.
 */
export function resolveRequestUser(
  request: Request
): Promise<SessionUser | null> {
  const token = readToken(
    request.headers.get('authorization'),
    getCookie(request.headers, ACCESS_COOKIE) ?? null
  );
  return resolveSessionUser(token, secret);
}

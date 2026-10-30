import { jwtVerify } from 'jose';
import type { Role, SessionUser } from './types';

/**
 * Session guard primitives (Putaran 17, Batch 2) — the exact decision logic
 * `apps/server/src/middleware/require-role.ts` (Hono) and
 * `apps/web/src/lib/orpc/procedures.ts` (oRPC) both now call, instead of each
 * keeping its own hand-copied JWT-reading implementation. Framework-agnostic
 * on purpose: no `Context`, no cookies library — callers extract the two
 * candidate strings however their transport represents them and pass the
 * result in.
 */

const ROLES = new Set<Role>([
  'WAKIF',
  'NADZIR',
  'ADMIN',
  'PETUGAS_LAPANGAN',
  'BENDAHARA',
]);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.has(value as Role);
}

/** Prefers a `Bearer` Authorization header, falling back to a cookie value. */
export function readToken(
  authorization: string | null | undefined,
  cookieToken: string | null | undefined
): string | null {
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  return cookieToken ?? null;
}

/**
 * Verifies an access token and returns the `SessionUser` it encodes, or
 * `null` when the token is missing, expired, tampered with, or carries an
 * unrecognised role. Never throws.
 */
export async function resolveSessionUser(
  token: string | null,
  secret: Uint8Array
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const { userId, role } = payload;

    if (typeof userId !== 'string' || !isRole(role)) {
      return null;
    }

    return { userId, role };
  } catch {
    return null;
  }
}

export function hasRole(user: SessionUser, allowed: readonly Role[]): boolean {
  return allowed.includes(user.role);
}

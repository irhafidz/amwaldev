import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { ulid } from 'ulidx';
import { refreshTokens, users } from '../db/schema';
import type { Database } from '../db/types';
import { resolveSessionUser } from './guard';
import type { SessionUser } from './types';

/**
 * Session token issuance & rotation (Putaran 17, Batch 2) — ported from
 * `apps/server/src/lib/auth/tokens.ts`. The only behavioural change from the
 * original: `secret` and `database` are explicit required parameters instead
 * of a module-level `env.JWT_SECRET` / `defaultDb` — a shared kernel package
 * cannot assume any one app's environment. Every app's own
 * `lib/auth/tokens.ts` (or oRPC equivalent) is a thin composition wrapper
 * that supplies its own secret and `db` singleton; the rotation/revoke logic
 * itself, and the fiqh-adjacent "reuse = theft, revoke everything" rule, are
 * untouched.
 */

/**
 * 3 jam (QA Test#1, Awan: 20 menit terasa terlalu cepat habis). Cookie
 * `amwal_token` memakai nilai yang sama.
 *
 * ponytail: akun yang dinonaktifkan atau diturunkan perannya baru berlaku saat
 * token ini habis (paling lama 3 jam); refresh token langsung dicabut. Dan
 * pemeriksaan sesi SSR tidak me-refresh sendiri: merotasi refresh token dari
 * dua permintaan SSR paralel memicu aturan "pakai ulang = pencurian" dan
 * mencabut semua sesi. Penggantinya hanya aman bila dibuat single-flight.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 3 * 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function signAccessToken(
  user: SessionUser,
  secret: Uint8Array
): Promise<string> {
  return new SignJWT({ userId: user.userId, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/** Alias — verifying an access token is exactly resolving a session user. */
export const verifyAccessToken = resolveSessionUser;

/**
 * Refresh tokens are high-entropy random strings, so SHA-256 is the correct
 * digest here — bcrypt exists to slow down guessing of low-entropy passwords
 * and would cost ~100ms per verification for no security gain.
 *
 * The wire format is `{rowId}.{secret}`. Storing the row id alongside the
 * secret means rotation looks up exactly one row instead of hashing every
 * historical token for that user until one matches.
 */
function hashSecret(rawSecret: string): string {
  return createHash('sha256').update(rawSecret, 'utf8').digest('hex');
}

function secretMatches(rawSecret: string, storedHash: string): boolean {
  const computed = Buffer.from(hashSecret(rawSecret));
  const stored = Buffer.from(storedHash);
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

function parseRefreshToken(
  token: string
): { rowId: string; rawSecret: string } | null {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }
  return {
    rowId: token.slice(0, separator),
    rawSecret: token.slice(separator + 1),
  };
}

function expiryIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function issueRefreshToken(
  userId: string,
  database: Database
): Promise<string> {
  const rowId = `RT-${ulid()}`;
  const rawSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(
    /-/g,
    ''
  );

  await database.insert(refreshTokens).values({
    id: rowId,
    userId,
    tokenHash: hashSecret(rawSecret),
    expiresAt: expiryIso(REFRESH_TOKEN_TTL_SECONDS),
  });

  return `${rowId}.${rawSecret}`;
}

export async function revokeAllRefreshTokens(
  userId: string,
  database: Database
): Promise<void> {
  await database
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
    );
}

export async function revokeRefreshToken(
  token: string,
  database: Database
): Promise<void> {
  const parsed = parseRefreshToken(token);
  if (!parsed) {
    return;
  }

  await database
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.id, parsed.rowId));
}

/**
 * Rotates a refresh token and returns a fresh pair.
 *
 * The role is re-read from `users` on every rotation, never assumed — an ADMIN
 * who refreshes after 20 minutes must stay an ADMIN (audit finding D2-N2).
 *
 * Reusing a token whose `revoked_at` is already set is treated as theft:
 * every session for that user is revoked (SECURITY.md §2).
 */
export async function rotateRefreshToken(
  token: string,
  database: Database,
  secret: Uint8Array
): Promise<IssuedSession | null> {
  const parsed = parseRefreshToken(token);
  if (!parsed) {
    return null;
  }

  const [stored] = await database
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, parsed.rowId))
    .limit(1);

  if (!(stored && secretMatches(parsed.rawSecret, stored.tokenHash))) {
    return null;
  }

  if (stored.revokedAt !== null) {
    await revokeAllRefreshTokens(stored.userId, database);
    return null;
  }

  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    await revokeRefreshToken(token, database);
    return null;
  }

  const [account] = await database
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  // A deactivated account must not obtain a fresh session (admin.users.toggleStatus).
  if (!account?.isActive) {
    await revokeAllRefreshTokens(stored.userId, database);
    return null;
  }

  await database
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.id, stored.id));

  const user: SessionUser = { userId: account.id, role: account.role };

  return {
    accessToken: await signAccessToken(user, secret),
    refreshToken: await issueRefreshToken(account.id, database),
    user,
  };
}

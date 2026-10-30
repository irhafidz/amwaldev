import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { ulid } from 'ulidx';
import type { Role } from '../../src/lib/auth/types';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * oRPC-side port of `apps/server/tests/auth/auth-route.test.ts` (Putaran 17,
 * Batch 2) — same scenarios, same assertions, called through
 * `router.auth.*` via `@orpc/server`'s `call()` instead of `app.request()`.
 * Adds `auth.me` (401 → 200) and a 403 role-mismatch case against
 * `admin.overview.kpi`, rounding out the 401/403/200 gate this batch asks
 * for.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createContext } = await import('../../src/lib/orpc/context');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
const now = () => new Date().toISOString();

function createToken(role: Role, userId: string): Promise<string> {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret);
}

function contextFor(options: {
  token?: string;
  cookie?: string;
  resHeaders?: Headers;
}) {
  const headers = new Headers();
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
  }
  if (options.cookie) {
    headers.set('cookie', options.cookie);
  }
  const request = new Request('http://localhost/rpc/auth', { headers });
  return createContext({
    request,
    database,
    resHeaders: options.resHeaders ?? new Headers(),
  });
}

/** Reads one cookie value out of a Headers object's Set-Cookie entries. */
function readSetCookie(headers: Headers, name: string): string | null {
  const setCookies = headers.getSetCookie?.() ?? [];
  for (const header of setCookies) {
    const [pair] = header.split(';');
    const [key, ...rest] = pair.split('=');
    if (key.trim() === name) {
      return rest.join('=');
    }
  }
  return null;
}

// Shared helper — only ever awaited from inside a test() body below.
async function expectORPCStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error(`expected call to reject with status ${status}`);
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect(error).toBeInstanceOf(ORPCError);
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect((error as ORPCError<string, unknown>).status).toBe(status);
  }
}

async function cleanupUser(userId: string) {
  // Sprint 11 [I-10b]: registration awards +1000, so the ledger row must go
  // before the user — `gamification_point_ledgers.user_id` is ON DELETE
  // RESTRICT, and a leftover row is exactly what that constraint is for.
  await database
    .delete(schema.gamificationPointLedgers)
    .where(eq(schema.gamificationPointLedgers.userId, userId));
  await database
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.userId, userId));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

describe('oRPC auth: register + login', () => {
  test('registers, then logs in by email and by phone', async () => {
    const runId = ulid().toLowerCase();
    const email = `orpc-auth-${runId}@amwal.test`;
    const phone = `0812${Date.now().toString().slice(-8)}`;
    let userId = '';

    try {
      const registerHeaders = new Headers();
      const registered = (await call(
        router.auth.register,
        { name: 'Muzakki Uji oRPC', email, phone, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: registerHeaders }) }
      )) as { user: { userId: string; role: string; email?: string } };

      userId = registered.user.userId;
      expect(registered.user.role).toBe('WAKIF');
      expect(registered.user.email).toBe(email);
      expect(readSetCookie(registerHeaders, 'amwal_token')).toBeTruthy();
      expect(readSetCookie(registerHeaders, 'amwal_refresh')).toBeTruthy();

      // I-10b: the welcome bonus is written in the same transaction as the
      // account, keyed `register:{userId}`, so it exists exactly once.
      const welcomeBonus = await database
        .select({
          idempotencyKey: schema.gamificationPointLedgers.idempotencyKey,
          points: schema.gamificationPointLedgers.pointsEarned,
        })
        .from(schema.gamificationPointLedgers)
        .where(eq(schema.gamificationPointLedgers.userId, userId));
      expect(welcomeBonus).toHaveLength(1);
      expect(welcomeBonus.at(0)?.points).toBe(1000);
      expect(welcomeBonus.at(0)?.idempotencyKey).toBe(`register:${userId}`);

      const byEmailHeaders = new Headers();
      const byEmail = await call(
        router.auth.login,
        { identifier: email, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: byEmailHeaders }) }
      );
      expect(byEmail.message).toBe('Berhasil masuk');
      expect(readSetCookie(byEmailHeaders, 'amwal_token')).toBeTruthy();
      expect(readSetCookie(byEmailHeaders, 'amwal_refresh')).toBeTruthy();

      const byPhone = await call(
        router.auth.login,
        { identifier: phone, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: new Headers() }) }
      );
      expect(byPhone.message).toBe('Berhasil masuk');
    } finally {
      if (userId) {
        await cleanupUser(userId);
      }
    }
  });

  test('rejects a wrong password (401) and a duplicate email (409)', async () => {
    const runId = ulid().toLowerCase();
    const email = `orpc-auth-dup-${runId}@amwal.test`;
    let userId = '';

    try {
      const registered = await call(
        router.auth.register,
        { name: 'Muzakki Duplikat', email, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: new Headers() }) }
      );
      userId = registered.user.userId;

      await expectORPCStatus(
        call(
          router.auth.login,
          { identifier: email, password: 'kataSandiSalah' },
          { context: contextFor({ resHeaders: new Headers() }) }
        ),
        401
      );

      await expectORPCStatus(
        call(
          router.auth.register,
          { name: 'Muzakki Duplikat 2', email, password: 'kataSandi123' },
          { context: contextFor({ resHeaders: new Headers() }) }
        ),
        409
      );
    } finally {
      if (userId) {
        await cleanupUser(userId);
      }
    }
  });

  test('a concurrent duplicate-email race resolves to 409, never an uncaught 500', async () => {
    // The register handler pre-checks for a conflicting email, then inserts
    // in a separate step — racy by construction. Firing two identical
    // registrations at once forces both past the pre-check, so only the
    // `users_email_key` unique-violation catch in the insert path stands
    // between this and an uncaught 500.
    const runId = ulid().toLowerCase();
    const email = `orpc-auth-race-${runId}@amwal.test`;
    let userId = '';

    try {
      const results = await Promise.allSettled([
        call(
          router.auth.register,
          { name: 'Muzakki Race A', email, password: 'kataSandi123' },
          { context: contextFor({ resHeaders: new Headers() }) }
        ),
        call(
          router.auth.register,
          { name: 'Muzakki Race B', email, password: 'kataSandi123' },
          { context: contextFor({ resHeaders: new Headers() }) }
        ),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled'
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejection = rejected.at(0);
      if (rejection?.status === 'rejected') {
        expect(rejection.reason).toBeInstanceOf(ORPCError);
        expect((rejection.reason as ORPCError<string, unknown>).status).toBe(
          409
        );
      }

      const winner = fulfilled.at(0);
      if (winner?.status === 'fulfilled') {
        userId = (winner.value as { user: { userId: string } }).user.userId;
      }
    } finally {
      if (userId) {
        await cleanupUser(userId);
      }
    }
  });

  test('an account with no password hash cannot log in (401, guest / OAuth-only)', async () => {
    const runId = ulid().toLowerCase();
    const userId = `orpc-auth-guest-${runId}`;
    const email = `orpc-auth-guest-${runId}@amwal.internal`;

    await database.insert(schema.users).values({
      id: userId,
      email,
      name: 'Hamba Allah',
      updatedAt: now(),
    });

    try {
      await expectORPCStatus(
        call(
          router.auth.login,
          { identifier: email, password: 'apapun' },
          { context: contextFor({ resHeaders: new Headers() }) }
        ),
        401
      );
    } finally {
      await cleanupUser(userId);
    }
  });
});

describe('oRPC auth: refresh rotation', () => {
  test('rotation preserves the ADMIN role instead of downgrading it', async () => {
    const runId = ulid().toLowerCase();
    const userId = `orpc-auth-admin-${runId}`;
    const email = `orpc-auth-admin-${runId}@amwal.test`;

    await database.insert(schema.users).values({
      id: userId,
      email,
      name: 'Admin Uji oRPC',
      role: 'ADMIN',
      passwordHash: await Bun.password.hash('kataSandi123', {
        algorithm: 'bcrypt',
        cost: 10,
      }),
      updatedAt: now(),
    });

    try {
      const loginHeaders = new Headers();
      const login = await call(
        router.auth.login,
        { identifier: email, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: loginHeaders }) }
      );
      expect(login.user.role).toBe('ADMIN');

      const refreshCookie = readSetCookie(loginHeaders, 'amwal_refresh');
      expect(refreshCookie).toBeTruthy();

      const refreshHeaders = new Headers();
      const refreshed = await call(
        router.auth.refresh,
        {},
        {
          context: contextFor({
            cookie: `amwal_refresh=${refreshCookie}`,
            resHeaders: refreshHeaders,
          }),
        }
      );
      expect(refreshed.user.role).toBe('ADMIN');
    } finally {
      await cleanupUser(userId);
    }
  });

  test('reusing a rotated refresh token revokes every session', async () => {
    const runId = ulid().toLowerCase();
    const userId = `orpc-auth-reuse-${runId}`;
    const email = `orpc-auth-reuse-${runId}@amwal.test`;

    await database.insert(schema.users).values({
      id: userId,
      email,
      name: 'Muzakki Reuse oRPC',
      passwordHash: await Bun.password.hash('kataSandi123', {
        algorithm: 'bcrypt',
        cost: 10,
      }),
      updatedAt: now(),
    });

    try {
      const loginHeaders = new Headers();
      await call(
        router.auth.login,
        { identifier: email, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: loginHeaders }) }
      );
      const firstToken = readSetCookie(loginHeaders, 'amwal_refresh');

      const firstRefreshHeaders = new Headers();
      await call(
        router.auth.refresh,
        {},
        {
          context: contextFor({
            cookie: `amwal_refresh=${firstToken}`,
            resHeaders: firstRefreshHeaders,
          }),
        }
      );
      const secondToken = readSetCookie(firstRefreshHeaders, 'amwal_refresh');

      // Replaying the already-rotated token is treated as theft.
      await expectORPCStatus(
        call(
          router.auth.refresh,
          {},
          {
            context: contextFor({
              cookie: `amwal_refresh=${firstToken}`,
              resHeaders: new Headers(),
            }),
          }
        ),
        401
      );

      // ...and the legitimate successor is revoked along with it.
      await expectORPCStatus(
        call(
          router.auth.refresh,
          {},
          {
            context: contextFor({
              cookie: `amwal_refresh=${secondToken}`,
              resHeaders: new Headers(),
            }),
          }
        ),
        401
      );
    } finally {
      await cleanupUser(userId);
    }
  });

  test('logout revokes the refresh token', async () => {
    const runId = ulid().toLowerCase();
    const userId = `orpc-auth-logout-${runId}`;
    const email = `orpc-auth-logout-${runId}@amwal.test`;

    await database.insert(schema.users).values({
      id: userId,
      email,
      name: 'Muzakki Logout oRPC',
      passwordHash: await Bun.password.hash('kataSandi123', {
        algorithm: 'bcrypt',
        cost: 10,
      }),
      updatedAt: now(),
    });

    try {
      const loginHeaders = new Headers();
      await call(
        router.auth.login,
        { identifier: email, password: 'kataSandi123' },
        { context: contextFor({ resHeaders: loginHeaders }) }
      );
      const token = readSetCookie(loginHeaders, 'amwal_refresh');

      const loggedOut = await call(
        router.auth.logout,
        {},
        {
          context: contextFor({
            cookie: `amwal_refresh=${token}`,
            resHeaders: new Headers(),
          }),
        }
      );
      expect(loggedOut.message).toBe('Berhasil keluar');

      await expectORPCStatus(
        call(
          router.auth.refresh,
          {},
          {
            context: contextFor({
              cookie: `amwal_refresh=${token}`,
              resHeaders: new Headers(),
            }),
          }
        ),
        401
      );
    } finally {
      await cleanupUser(userId);
    }
  });
});

describe('oRPC auth: session guard (401 / 403 / 200)', () => {
  test('auth.me rejects an unauthenticated call with 401', async () => {
    await expectORPCStatus(
      call(router.auth.me, {}, { context: contextFor({}) }),
      401
    );
  });

  test('auth.me returns the profile for a valid session (200)', async () => {
    const runId = ulid().toLowerCase();
    const userId = `orpc-auth-me-${runId}`;
    const email = `orpc-auth-me-${runId}@amwal.test`;

    await database.insert(schema.users).values({
      id: userId,
      email,
      name: 'Muzakki Me oRPC',
      updatedAt: now(),
    });

    try {
      const token = await createToken('WAKIF', userId);
      const result = await call(
        router.auth.me,
        {},
        { context: contextFor({ token }) }
      );
      expect(result.user.userId).toBe(userId);
      expect(result.user.role).toBe('WAKIF');
      expect(result.user.email).toBe(email);
    } finally {
      await cleanupUser(userId);
    }
  });

  test('a non-ADMIN role is rejected with 403 on an ADMIN-only procedure', async () => {
    const token = await createToken('WAKIF', 'orpc-auth-wakif-403');
    await expectORPCStatus(
      call(router.admin.overview.kpi, {}, { context: contextFor({ token }) }),
      403
    );
  });
});

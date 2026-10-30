import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Audit C5 (login throttle + constant-work miss path), C6 (password change
 * revokes sessions) and C7 (avatar upload restrictions).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { issueRefreshToken } = await import('@amwal/core/auth/tokens');
const { resetLoginThrottle, isLoginBlocked, recordLoginFailure } = await import(
  '../../src/lib/auth/login-throttle'
);
const { createTestCaller } = await import('./test-utils');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const PASSWORD = 'kataSandiBenar123';
const userIds: string[] = [];

async function createAccount(label: string) {
  const id = `c56-${runId}-${label}`;
  const email = `${id}@example.com`;
  userIds.push(id);
  await database.insert(schema.users).values({
    id,
    email,
    name: `Akun ${label}`,
    passwordHash: await Bun.password.hash(PASSWORD, {
      algorithm: 'bcrypt',
      cost: 4,
    }),
    updatedAt: new Date().toISOString(),
  });
  return { id, email };
}

async function status(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.status : -1;
  }
  return null;
}

afterAll(async () => {
  for (const id of userIds) {
    await database
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, id));
    await database.delete(schema.users).where(eq(schema.users.id, id));
  }
});

describe('login throttle (audit C5)', () => {
  beforeEach(() => resetLoginThrottle());

  test('limiter blocks after repeated failures and ignores other identifiers', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      recordLoginFailure('Korban@Example.com', '10.0.0.1');
    }

    expect(isLoginBlocked('korban@example.com', '10.9.9.9')).toBe(true);
    expect(isLoginBlocked('lain@example.com', '10.9.9.9')).toBe(false);
  });

  test('limiter forgets failures after the window', () => {
    const longAgo = Date.now() - 16 * 60 * 1000;
    for (let attempt = 0; attempt < 5; attempt++) {
      recordLoginFailure('lama@example.com', '10.0.0.2', longAgo);
    }

    expect(isLoginBlocked('lama@example.com', '10.0.0.2')).toBe(false);
  });

  test('the 6th attempt is refused even with the right password', async () => {
    const account = await createAccount('throttle');
    const context = await createTestCaller({ database, user: null });

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await status(
        call(
          router.auth.login,
          { identifier: account.email, password: 'salah-terus' },
          { context }
        )
      );
      expect(result).toBe(401);
    }

    const blocked = await status(
      call(
        router.auth.login,
        { identifier: account.email, password: PASSWORD },
        { context }
      )
    );
    expect(blocked).toBe(429);
  });

  test('a successful login clears earlier failures', async () => {
    const account = await createAccount('clears');
    const context = await createTestCaller({ database, user: null });

    for (let attempt = 0; attempt < 3; attempt++) {
      await status(
        call(
          router.auth.login,
          { identifier: account.email, password: 'salah' },
          { context }
        )
      );
    }
    const ok = await call(
      router.auth.login,
      { identifier: account.email, password: PASSWORD },
      { context }
    );

    expect(ok.user.userId).toBe(account.id);
    expect(isLoginBlocked(account.email, 'unknown-ip')).toBe(false);
  });

  test('an unknown identifier still pays the bcrypt cost', async () => {
    const context = await createTestCaller({ database, user: null });
    // Warm the lazily created dummy hash so only the verify is measured.
    await status(
      call(
        router.auth.login,
        { identifier: `warm-${runId}@example.com`, password: 'x' },
        { context }
      )
    );

    const startedAt = performance.now();
    const result = await status(
      call(
        router.auth.login,
        { identifier: `tidak-ada-${runId}@example.com`, password: 'apapun12' },
        { context }
      )
    );

    expect(result).toBe(401);
    // cost-10 bcrypt takes tens of ms; a bare DB miss takes ~1ms.
    expect(performance.now() - startedAt).toBeGreaterThan(15);
  });
});

describe('changePassword session revocation (audit C6)', () => {
  test('every old refresh token is revoked and this device gets a new one', async () => {
    const account = await createAccount('revoke');
    const deviceA = await issueRefreshToken(account.id, database);
    const deviceB = await issueRefreshToken(account.id, database);
    const resHeaders = new Headers();
    const context = await createTestCaller({
      database,
      user: { userId: account.id, role: 'WAKIF' },
      resHeaders,
    });

    await call(
      router.user.changePassword,
      { currentPassword: PASSWORD, newPassword: 'passwordBaru456' },
      { context }
    );

    const rows = await database
      .select({
        id: schema.refreshTokens.id,
        revokedAt: schema.refreshTokens.revokedAt,
      })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, account.id));
    const revoked = (token: string) =>
      rows.find((row) => row.id === token.split('.')[0])?.revokedAt;

    expect(revoked(deviceA)).not.toBeNull();
    expect(revoked(deviceB)).not.toBeNull();
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(resHeaders.getSetCookie().join(';')).toContain('amwal_refresh=');
  });
});

describe('avatar upload restrictions (audit C7)', () => {
  const valid = {
    fileName: 'foto.png',
    contentType: 'image/png' as const,
    size: 1024,
  };

  async function avatarStatus(input: Record<string, unknown>) {
    const account = await createAccount(`avatar-${ulid().toLowerCase()}`);
    const context = await createTestCaller({
      database,
      user: { userId: account.id, role: 'WAKIF' },
    });
    return await status(
      call(router.user.getAvatarUploadUrl, input as typeof valid, { context })
    );
  }

  test.each([
    ['an .html file name', { ...valid, fileName: 'x.html' }],
    ['an .svg file name', { ...valid, fileName: 'x.svg' }],
    [
      'a double extension ending in .html',
      { ...valid, fileName: 'a.png.html' },
    ],
    ['a path trick hiding .html', { ...valid, fileName: 'a.png/../b.html' }],
    ['no extension', { ...valid, fileName: 'foto' }],
    ['an SVG content type', { ...valid, contentType: 'image/svg+xml' }],
    ['a GIF content type', { ...valid, contentType: 'image/gif' }],
    ['a file over 2MB', { ...valid, size: 2 * 1024 * 1024 + 1 }],
    ['an empty file', { ...valid, size: 0 }],
  ])('rejects %s', async (_label, input) => {
    expect(await avatarStatus(input)).toBe(400);
  });

  test('a valid image gets a signed, short-lived upload URL on local storage', async () => {
    const account = await createAccount(`avatar-${ulid().toLowerCase()}`);
    const context = await createTestCaller({
      database,
      user: { userId: account.id, role: 'WAKIF' },
    });
    const result = await call(router.user.getAvatarUploadUrl, valid, {
      context,
    });

    expect(result.uploadUrl).toStartWith('/api/media/user-avatars/');
    expect(result.uploadUrl).toContain('?exp=');
    expect(result.uploadUrl).toContain('&sig=');
    expect(result.publicUrl).toBe(
      `/api/media/user-avatars/${result.objectPath}`
    );
    expect(result.objectPath).toEndWith('.png');
    expect(result.objectPath).not.toContain('/');
  });
});

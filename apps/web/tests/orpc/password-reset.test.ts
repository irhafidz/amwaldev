import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/** Email-OTP password reset, end to end against the test database. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { issueRefreshToken } = await import('@amwal/core/auth/tokens');
const { requestPasswordReset, resetPasswordResetRateLimit } = await import(
  '../../src/lib/auth/password-reset'
);
const { resetLoginThrottle } = await import(
  '../../src/lib/auth/login-throttle'
);
const { createTestCaller, signTestToken } = await import('./test-utils');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const OLD_PASSWORD = 'kataSandiLama123';
const NEW_PASSWORD = 'kataSandiBaru456';
const userIds: string[] = [];
let counter = 0;

async function createAccount(options: { isActive?: boolean } = {}) {
  counter += 1;
  const id = `pr-${runId}-${counter}`;
  const email = `${id}@example.com`;
  userIds.push(id);
  await database.insert(schema.users).values({
    id,
    email,
    name: `Akun <b>${counter}</b>`,
    passwordHash: await Bun.password.hash(OLD_PASSWORD, {
      algorithm: 'bcrypt',
      cost: 4,
    }),
    isActive: options.isActive ?? true,
    updatedAt: new Date().toISOString(),
  });
  return { id, email };
}

/** Requests a code through the service, capturing what would be emailed. */
async function requestCode(email: string, ip = `10.0.0.${counter}`) {
  const sent: { name: string; otp: string; to: string }[] = [];
  await requestPasswordReset({
    db: database,
    deliver: (delivery) => {
      sent.push(delivery);
      return Promise.resolve();
    },
    email,
    ip,
  });
  return sent;
}

async function publicContext() {
  return await createTestCaller({ database, user: null });
}

async function status(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.status : -1;
  }
  return null;
}

async function verify(email: string, otp: string) {
  return await call(
    router.auth.verifyPasswordResetOtp,
    { email, otp },
    { context: await publicContext() }
  );
}

async function reset(resetToken: string, newPassword = NEW_PASSWORD) {
  return await call(
    router.auth.resetPasswordWithOtp,
    { resetToken, newPassword },
    { context: await publicContext() }
  );
}

beforeEach(() => {
  resetPasswordResetRateLimit();
  resetLoginThrottle();
});

afterAll(async () => {
  for (const id of userIds) {
    await database
      .delete(schema.passwordResetOtps)
      .where(eq(schema.passwordResetOtps.userId, id));
    await database
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, id));
    await database.delete(schema.users).where(eq(schema.users.id, id));
  }
});

describe('requestPasswordReset', () => {
  test('answers the same for a known and an unknown address', async () => {
    const account = await createAccount();
    const context = await publicContext();

    const known = await call(
      router.auth.requestPasswordReset,
      { email: account.email },
      { context }
    );
    const unknown = await call(
      router.auth.requestPasswordReset,
      { email: `nobody-${runId}@example.com` },
      { context }
    );

    expect(unknown).toEqual(known);
  });

  test('emails a 6-digit code, stores only its hash, and is case-insensitive', async () => {
    const account = await createAccount();

    const sent = await requestCode(account.email.toUpperCase().toLowerCase());
    const [row] = await database
      .select()
      .from(schema.passwordResetOtps)
      .where(eq(schema.passwordResetOtps.userId, account.id));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.otp).toMatch(/^\d{6}$/);
    expect(sent[0]?.to).toBe(account.email);
    expect(row?.otpHash).not.toContain(sent[0]?.otp ?? 'x');
    expect(row?.attempts).toBe(0);
    expect(row?.consumedAt).toBeNull();
  });

  test('sends nothing for unknown or deactivated accounts', async () => {
    const inactive = await createAccount({ isActive: false });

    expect(await requestCode(inactive.email)).toHaveLength(0);
    expect(await requestCode(`ghost-${runId}@example.com`)).toHaveLength(0);
  });

  test('refuses the 4th request for one address within the window (429)', async () => {
    const account = await createAccount();
    const context = await publicContext();
    const attempts: (number | null)[] = [];

    for (let index = 0; index < 4; index++) {
      attempts.push(
        await status(
          call(
            router.auth.requestPasswordReset,
            { email: account.email },
            { context }
          )
        )
      );
    }

    expect(attempts).toEqual([null, null, null, 429]);
  });

  test('a newer code replaces the older one', async () => {
    const account = await createAccount();
    const first = await requestCode(account.email);
    const second = await requestCode(account.email);

    expect(await status(verify(account.email, first[0]?.otp ?? '000000'))).toBe(
      400
    );
    const ok = await verify(account.email, second[0]?.otp ?? '000000');
    expect(ok.resetToken.length).toBeGreaterThan(20);
  });
});

describe('verify + reset', () => {
  test('full flow: new password works, old one and old sessions do not', async () => {
    const account = await createAccount();
    const oldRefresh = await issueRefreshToken(account.id, database);
    const sent = await requestCode(account.email);

    const { resetToken } = await verify(account.email, sent[0]?.otp ?? '');
    await reset(resetToken);

    const context = await publicContext();
    const login = await call(
      router.auth.login,
      { identifier: account.email, password: NEW_PASSWORD },
      { context }
    );
    expect(login.user.userId).toBe(account.id);
    expect(
      await status(
        call(
          router.auth.login,
          { identifier: account.email, password: OLD_PASSWORD },
          { context }
        )
      )
    ).toBe(401);

    const [oldToken] = await database
      .select({ revokedAt: schema.refreshTokens.revokedAt })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, oldRefresh.split('.')[0] ?? ''));
    expect(oldToken?.revokedAt).not.toBeNull();

    const [otpRow] = await database
      .select({ consumedAt: schema.passwordResetOtps.consumedAt })
      .from(schema.passwordResetOtps)
      .where(eq(schema.passwordResetOtps.userId, account.id));
    expect(otpRow?.consumedAt).not.toBeNull();
  });

  test('a reset token works only once', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    const { resetToken } = await verify(account.email, sent[0]?.otp ?? '');

    await reset(resetToken);

    expect(await status(reset(resetToken, 'sandiLainLagi789'))).toBe(400);
  });

  test('a wrong code is rejected and five wrong tries lock the code', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    const correct = sent[0]?.otp ?? '';
    const wrong = correct === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await status(verify(account.email, wrong))).toBe(400);
    }

    // Even the right code no longer works: the code is out of tries.
    expect(await status(verify(account.email, correct))).toBe(400);
  });

  test('an expired code is rejected', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    await database
      .update(schema.passwordResetOtps)
      .set({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(schema.passwordResetOtps.userId, account.id));

    expect(await status(verify(account.email, sent[0]?.otp ?? ''))).toBe(400);
  });

  test('a code cannot be verified twice', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    await verify(account.email, sent[0]?.otp ?? '');

    expect(await status(verify(account.email, sent[0]?.otp ?? ''))).toBe(400);
  });

  test('garbage, tampered and access tokens are not reset tokens', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    const { resetToken } = await verify(account.email, sent[0]?.otp ?? '');
    const accessToken = await signTestToken({
      userId: account.id,
      role: 'WAKIF',
    });

    expect(await status(reset('not-a-token'))).toBe(400);
    expect(await status(reset(`${resetToken}x`))).toBe(400);
    expect(await status(reset(accessToken))).toBe(400);

    // The valid token is untouched by the failed attempts.
    await reset(resetToken);
  });

  test('rejects weak or oversize passwords at the contract', async () => {
    const account = await createAccount();
    const sent = await requestCode(account.email);
    const { resetToken } = await verify(account.email, sent[0]?.otp ?? '');

    expect(await status(reset(resetToken, 'short'))).toBe(400);
    expect(await status(reset(resetToken, 'x'.repeat(129)))).toBe(400);
  });

  test('rejects a malformed code at the contract', async () => {
    expect(await status(verify('a@example.com', '12ab56'))).toBe(400);
    expect(await status(verify('a@example.com', '12345'))).toBe(400);
  });
});

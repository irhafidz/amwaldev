import { ACCESS_COOKIE, REFRESH_COOKIE } from '@amwal/core/auth/cookie-names';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '@amwal/core/auth/tokens';
import type { Role, SessionUser } from '@amwal/core/auth/types';
import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordWithOtpSchema,
  verifyPasswordResetOtpSchema,
} from '@amwal/core/contracts/auth';
import { award } from '@amwal/core/gamification/ledger';
import { ACTIVITY_POINTS, registerKey } from '@amwal/core/gamification/points';
import { ORPCError } from '@orpc/server';
import { deleteCookie, getCookie, setCookie } from '@orpc/server/helpers';
import { eq, or } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { env } from '@/env/server';
import {
  clearLoginFailures,
  clientIp,
  isLoginBlocked,
  recordLoginFailure,
} from '@/lib/auth/login-throttle';
import {
  verifyPasswordResetOtp as checkPasswordResetOtp,
  resetPasswordWithOtp as finishPasswordReset,
  requestPasswordReset as startPasswordReset,
} from '@/lib/auth/password-reset';
import type { Database } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { protectedProcedure, publicProcedure } from '../procedures';

/**
 * oRPC auth router (Putaran 17, Batch 2) — a 1:1 port of
 * `apps/server/src/routes/auth.ts`. Same queries, same messages, same
 * status-equivalent errors (`ORPCError` codes map onto the identical HTTP
 * status the REST route returns — UNAUTHORIZED→401, CONFLICT→409). Adds
 * `auth.me`, which the REST surface never had.
 */

const secret = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Legacy rows in `users.password_hash` were written by bcryptjs in the frozen
 * Next.js app, which still reads this same Supabase table. `Bun.password`
 * detects bcrypt from the hash prefix on verify, and new hashes are written
 * with bcrypt too so both applications stay able to authenticate the same
 * account during the transition.
 */
const BCRYPT_OPTIONS = { algorithm: 'bcrypt', cost: 10 } as const;

/** Identical message for unknown account and wrong password — no enumeration. */
const INVALID_CREDENTIALS = 'Email, nomor HP, atau kata sandi salah';

/**
 * Hash verified when the identifier matches no usable account, so a missing
 * account costs the same bcrypt work as a wrong password (audit C5: response
 * time must not reveal which identifiers exist). Created once, lazily awaited.
 */
const DUMMY_PASSWORD_HASH = Bun.password.hash(
  crypto.randomUUID(),
  BCRYPT_OPTIONS
);

type PublicUser = {
  userId: string;
  role: Role;
  name: string;
  email?: string;
};

function toPublicUser(row: {
  id: string;
  role: Role;
  name: string;
  email: string | null;
}): PublicUser {
  return {
    userId: row.id,
    role: row.role,
    name: row.name,
    ...(row.email ? { email: row.email } : {}),
  };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

function setSessionCookies(
  resHeaders: Headers | undefined,
  tokens: { accessToken: string; refreshToken: string }
): void {
  setCookie(
    resHeaders,
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(ACCESS_TOKEN_TTL_SECONDS)
  );
  setCookie(
    resHeaders,
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(REFRESH_TOKEN_TTL_SECONDS)
  );
}

/** Re-issues only the refresh cookie (the access token is still valid). */
export function setRefreshCookie(
  resHeaders: Headers | undefined,
  refreshToken: string
): void {
  setCookie(
    resHeaders,
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(REFRESH_TOKEN_TTL_SECONDS)
  );
}

function clearSessionCookies(resHeaders: Headers | undefined): void {
  deleteCookie(resHeaders, ACCESS_COOKIE, { path: '/' });
  deleteCookie(resHeaders, REFRESH_COOKIE, { path: '/' });
}

/**
 * `users.email` and `users.phone` each carry a unique index in the shared
 * Supabase schema, so a duplicate must be reported as CONFLICT rather than
 * left to surface as a constraint violation.
 */
async function findConflictingAccount(
  database: Database,
  email: string | undefined,
  phone: string | undefined
): Promise<{ email: string | null; phone: string | null } | undefined> {
  const filters = [
    ...(email ? [eq(users.email, email)] : []),
    ...(phone ? [eq(users.phone, phone)] : []),
  ];

  const [existing] = await database
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(or(...filters))
    .limit(1);

  return existing;
}

/**
 * `postgres` (porsager) raises `23505` with the violated constraint's name —
 * but Drizzle wraps it in a `DrizzleQueryError`, so the real error is
 * `error.cause`, not `error` itself.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause =
    error instanceof Error && error.cause !== undefined ? error.cause : error;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint_name' in cause &&
    cause.constraint_name === constraint
  );
}

const login = publicProcedure
  .input(loginSchema)
  .handler(async ({ input, context }) => {
    const { identifier, password } = input;
    const ip = clientIp(context.request);

    if (isLoginBlocked(identifier, ip)) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.',
      });
    }

    const [account] = await context.db
      .select({
        id: users.id,
        role: users.role,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.phone, identifier)))
      .limit(1);

    // A null password_hash means a guest row or an OAuth-only account. Both
    // must fail password login rather than fall through (Putaran 8 #3).
    if (!account?.passwordHash) {
      await Bun.password.verify(password, await DUMMY_PASSWORD_HASH);
      recordLoginFailure(identifier, ip);
      throw new ORPCError('UNAUTHORIZED', { message: INVALID_CREDENTIALS });
    }

    const passwordValid = await Bun.password.verify(
      password,
      account.passwordHash
    );

    if (!passwordValid) {
      recordLoginFailure(identifier, ip);
      throw new ORPCError('UNAUTHORIZED', { message: INVALID_CREDENTIALS });
    }

    clearLoginFailures(identifier);

    // Checked only after the password matched, so it cannot be used to probe
    // which identifiers belong to (deactivated) accounts.
    if (!account.isActive) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Akun dinonaktifkan. Hubungi administrator Amwal.',
      });
    }

    const user: SessionUser = { userId: account.id, role: account.role };
    const accessToken = await signAccessToken(user, secret);
    const refreshToken = await issueRefreshToken(account.id, context.db);

    setSessionCookies(context.resHeaders, { accessToken, refreshToken });

    return {
      message: 'Berhasil masuk',
      user: toPublicUser(account),
    };
  });

const register = publicProcedure
  .input(registerSchema)
  .handler(async ({ input, context }) => {
    const { name, email, phone, password } = input;

    const existing = await findConflictingAccount(context.db, email, phone);

    if (existing) {
      const takenField =
        email && existing.email === email ? 'Email' : 'Nomor HP';
      throw new ORPCError('CONFLICT', {
        message: `${takenField} sudah terdaftar`,
      });
    }

    const id = `USR-${ulid()}`;
    const passwordHash = await Bun.password.hash(password, BCRYPT_OPTIONS);
    const now = new Date().toISOString();

    // Sprint 11 (`I-10b`): the welcome bonus is awarded in the same
    // transaction as the account row, so "registered" and "+1000" can never
    // disagree — either both exist or neither does. The key `register:{id}`
    // makes a retried registration pay once.
    //
    // The pre-check above is TOCTOU-racy (two concurrent requests for the
    // same email both pass it), so a duplicate can still reach this insert.
    // Postgres then raises `23505` on `users_email_key`/`users_phone_key`,
    // which must map to the same clean 409 the pre-check gives — not an
    // uncaught 500.
    try {
      await context.db.transaction(async (tx) => {
        await tx.insert(users).values({
          id,
          name,
          email: email ?? null,
          phone: phone ?? null,
          passwordHash,
          updatedAt: now,
        });
        await award(tx, {
          activityType: 'REGISTER',
          idempotencyKey: registerKey(id),
          points: ACTIVITY_POINTS.REGISTER,
          userId: id,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_phone_key')) {
        throw new ORPCError('CONFLICT', {
          message: 'Nomor HP sudah terdaftar',
        });
      }
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new ORPCError('CONFLICT', { message: 'Email sudah terdaftar' });
      }
      throw error;
    }

    const user: SessionUser = { userId: id, role: 'WAKIF' };
    const accessToken = await signAccessToken(user, secret);
    const refreshToken = await issueRefreshToken(id, context.db);

    setSessionCookies(context.resHeaders, { accessToken, refreshToken });

    return {
      message: 'Pendaftaran berhasil',
      user: toPublicUser({ id, role: 'WAKIF', name, email: email ?? null }),
    };
  });

const refresh = publicProcedure.handler(async ({ context }) => {
  const token = getCookie(context.request.headers, REFRESH_COOKIE);

  if (!token) {
    clearSessionCookies(context.resHeaders);
    throw new ORPCError('UNAUTHORIZED', { message: 'Sesi tidak ditemukan' });
  }

  const rotated = await rotateRefreshToken(token, context.db, secret);

  if (!rotated) {
    clearSessionCookies(context.resHeaders);
    throw new ORPCError('UNAUTHORIZED', {
      message: 'Sesi Anda telah berakhir',
    });
  }

  setSessionCookies(context.resHeaders, rotated);

  const [account] = await context.db
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, rotated.user.userId))
    .limit(1);

  return {
    message: 'Sesi diperbarui',
    user: account ? toPublicUser(account) : rotated.user,
  };
});

/**
 * "Who am I" — reads the same access-token cookie every guarded procedure
 * does (`protectedProcedure` throws UNAUTHORIZED first), then enriches it
 * with the current profile row. Did not exist as a REST endpoint; added here
 * because oRPC's own guard chain needs a plain, guard-only procedure to
 * prove 401 the same way `admin.overview.kpi` proves 401→403→200 for roles.
 */
const me = protectedProcedure.handler(async ({ context }) => {
  const sessionUser = context.user;
  if (!sessionUser) {
    // protectedProcedure guarantees this is unreachable — narrows the type.
    throw new ORPCError('UNAUTHORIZED');
  }

  const [account] = await context.db
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, sessionUser.userId))
    .limit(1);

  if (!account) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'Akun tidak ditemukan',
    });
  }

  // Wakaf's authenticated-donor form pre-fills name/email and only asks for
  // WhatsApp when the account has none on file — `phone` sits outside
  // `toPublicUser` because that shape is shared with login/register/refresh,
  // which never needed it.
  return { user: toPublicUser(account), phone: account.phone };
});

const logout = publicProcedure.handler(async ({ context }) => {
  const token = getCookie(context.request.headers, REFRESH_COOKIE);

  if (token) {
    await revokeRefreshToken(token, context.db);
  }

  clearSessionCookies(context.resHeaders);
  return { message: 'Berhasil keluar' };
});

/**
 * Step 1 of the email-OTP reset. The reply is the same for any address (known
 * or not) so it cannot be used to discover who has an account.
 */
const requestPasswordReset = publicProcedure
  .input(requestPasswordResetSchema)
  .handler(async ({ input, context }) => {
    await startPasswordReset({
      db: context.db,
      email: input.email,
      ip: clientIp(context.request),
    });
    return {
      message: 'Jika email terdaftar, kode OTP telah dikirim ke kotak masuk.',
    };
  });

/** Step 2: exchange a correct code for a short-lived, single-use reset token. */
const verifyPasswordResetOtp = publicProcedure
  .input(verifyPasswordResetOtpSchema)
  .handler(({ input, context }) =>
    checkPasswordResetOtp({
      db: context.db,
      email: input.email,
      otp: input.otp,
    })
  );

/** Step 3: set the new password and sign every other session out. */
const resetPasswordWithOtp = publicProcedure
  .input(resetPasswordWithOtpSchema)
  .handler(async ({ input, context }) => {
    await finishPasswordReset({
      db: context.db,
      newPassword: input.newPassword,
      resetToken: input.resetToken,
    });
    return { message: 'Kata sandi berhasil diperbarui. Silakan masuk.' };
  });

export const auth = {
  login,
  register,
  refresh,
  me,
  logout,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
};

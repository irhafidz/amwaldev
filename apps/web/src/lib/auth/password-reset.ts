import { revokeAllRefreshTokens } from '@amwal/core/auth/tokens';
import { SYSTEM_ANONYMOUS_USER_ID } from '@amwal/core/identity/guest';
import { parseInstant } from '@amwal/core/time/wib';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { env } from '@/env/server';
import type { Database } from '@/lib/db';
import { passwordResetOtps, users } from '@/lib/db/schema';
import { isSmtpConfigured, sendMail } from '@/lib/email/mailer';
import { renderPasswordResetEmail } from '@/lib/email/password-reset-template';
import { clearLoginFailures } from './login-throttle';
import {
  generateOtp,
  hashOtp,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  otpMatches,
  signResetToken,
  verifyResetToken,
} from './password-reset-otp';
import { createRateLimiter } from './rate-limit';

/**
 * Email-OTP password reset.
 *
 *   requestPasswordReset  -> stores an HMAC of a fresh 6-digit code, emails it
 *   verifyPasswordResetOtp -> checks the code (5 tries per code), returns a
 *                             short-lived signed reset token
 *   resetPasswordWithOtp  -> consumes the code once, sets the password, logs
 *                             every other session out
 *
 * `requestPasswordReset` answers identically whether or not the address has an
 * account, and never waits on SMTP, so neither the response nor its timing
 * reveals which emails are registered.
 */

const BCRYPT_OPTIONS = { algorithm: 'bcrypt', cost: 10 } as const;
const MINUTE_MS = 60_000;
const RATE_WINDOW_MS = 15 * MINUTE_MS;
const MAX_REQUESTS_PER_WINDOW = 3;

const INVALID_OTP_MESSAGE = 'Kode OTP salah atau sudah kedaluwarsa';
const INVALID_TOKEN_MESSAGE =
  'Sesi reset kata sandi tidak valid atau sudah berakhir. Mulai ulang dari awal.';

const requestLimiter = createRateLimiter({
  max: MAX_REQUESTS_PER_WINDOW,
  windowMs: RATE_WINDOW_MS,
});

/** Test hook. */
export function resetPasswordResetRateLimit(): void {
  requestLimiter.reset();
}

export interface ResetEmailDelivery {
  name: string;
  otp: string;
  to: string;
}

/** Sends the OTP email; without SMTP it only logs (the code, outside production). */
export async function deliverResetEmail(
  delivery: ResetEmailDelivery
): Promise<void> {
  if (!isSmtpConfigured()) {
    if (env.NODE_ENV === 'production') {
      // biome-ignore lint/suspicious/noConsole: operational log; there is no logger and this must reach the server log
      console.error(
        '[password-reset] SMTP belum dikonfigurasi; email tidak terkirim'
      );
    } else {
      // biome-ignore lint/suspicious/noConsole: operational log; there is no logger and this must reach the server log
      console.warn(
        `[password-reset] SMTP belum dikonfigurasi. OTP untuk ${delivery.to}: ${delivery.otp}`
      );
    }
    return;
  }
  await sendMail({
    to: delivery.to,
    ...renderPasswordResetEmail({ name: delivery.name, otp: delivery.otp }),
  });
}

interface Deps {
  db: Database;
  secret?: string;
}

const secretOf = (deps: Deps) => deps.secret ?? env.JWT_SECRET;

export async function requestPasswordReset(
  deps: Deps & {
    deliver?: (delivery: ResetEmailDelivery) => Promise<void>;
    email: string;
    ip: string;
  }
): Promise<void> {
  const { db, email } = deps;
  const deliver = deps.deliver ?? deliverResetEmail;

  if (
    !(
      requestLimiter.allow(`email:${email}`) &&
      requestLimiter.allow(`ip:${deps.ip}`)
    )
  ) {
    throw new ORPCError('TOO_MANY_REQUESTS', {
      message: 'Terlalu banyak permintaan kode. Coba lagi dalam 15 menit.',
    });
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!user?.isActive || user.id === SYSTEM_ANONYMOUS_USER_ID) {
    return;
  }

  // Only the newest code may work.
  await db
    .update(passwordResetOtps)
    .set({ consumedAt: new Date().toISOString() })
    .where(
      and(
        eq(passwordResetOtps.userId, user.id),
        isNull(passwordResetOtps.consumedAt)
      )
    );

  const otp = generateOtp();
  const id = `PRO-${ulid()}`;
  await db.insert(passwordResetOtps).values({
    id,
    userId: user.id,
    email,
    otpHash: hashOtp(secretOf(deps), id, otp),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * MINUTE_MS).toISOString(),
  });

  // Deliberately not awaited: SMTP latency must not tell a registered address
  // from an unknown one.
  deliver({ to: email, name: user.name, otp }).catch((error: unknown) => {
    // biome-ignore lint/suspicious/noConsole: operational log; there is no logger and this must reach the server log
    console.error('[password-reset] gagal mengirim email OTP', error);
  });
}

export async function verifyPasswordResetOtp(
  deps: Deps & { email: string; otp: string }
): Promise<{ resetToken: string }> {
  const { db, email, otp } = deps;
  const invalid = () =>
    new ORPCError('BAD_REQUEST', { message: INVALID_OTP_MESSAGE });

  const [row] = await db
    .select()
    .from(passwordResetOtps)
    .where(
      and(
        eq(passwordResetOtps.email, email),
        isNull(passwordResetOtps.consumedAt)
      )
    )
    .orderBy(desc(passwordResetOtps.createdAt))
    .limit(1);

  if (!row || parseInstant(row.expiresAt).getTime() <= Date.now()) {
    throw invalid();
  }

  // Count the try first, atomically; a code out of tries is dead.
  const [counted] = await db
    .update(passwordResetOtps)
    .set({ attempts: sql`${passwordResetOtps.attempts} + 1` })
    .where(
      and(
        eq(passwordResetOtps.id, row.id),
        isNull(passwordResetOtps.consumedAt),
        lt(passwordResetOtps.attempts, OTP_MAX_ATTEMPTS)
      )
    )
    .returning({ id: passwordResetOtps.id });

  if (!(counted && otpMatches(secretOf(deps), row.id, otp, row.otpHash))) {
    throw invalid();
  }

  // Correct code: it cannot be verified again; the token is the only way on.
  await db
    .update(passwordResetOtps)
    .set({ attempts: OTP_MAX_ATTEMPTS })
    .where(eq(passwordResetOtps.id, row.id));

  return {
    resetToken: await signResetToken(secretOf(deps), {
      userId: row.userId,
      otpId: row.id,
    }),
  };
}

export async function resetPasswordWithOtp(
  deps: Deps & { newPassword: string; resetToken: string }
): Promise<void> {
  const { db } = deps;
  const claims = await verifyResetToken(secretOf(deps), deps.resetToken);
  if (!claims) {
    throw new ORPCError('BAD_REQUEST', { message: INVALID_TOKEN_MESSAGE });
  }

  // Single use: whoever flips `consumed_at` first wins.
  const [claimed] = await db
    .update(passwordResetOtps)
    .set({ consumedAt: new Date().toISOString() })
    .where(
      and(
        eq(passwordResetOtps.id, claims.otpId),
        eq(passwordResetOtps.userId, claims.userId),
        isNull(passwordResetOtps.consumedAt)
      )
    )
    .returning({ email: passwordResetOtps.email });

  if (!claimed) {
    throw new ORPCError('BAD_REQUEST', { message: INVALID_TOKEN_MESSAGE });
  }

  const passwordHash = await Bun.password.hash(
    deps.newPassword,
    BCRYPT_OPTIONS
  );
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, claims.userId));

  await revokeAllRefreshTokens(claims.userId, db);
  clearLoginFailures(claimed.email);
}

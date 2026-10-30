import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

/**
 * Pure building blocks of the email-OTP password reset (no database, no
 * network), kept separate so they can be tested directly.
 *
 * - The code is 6 digits from a CSPRNG. Only an HMAC of it is stored: a bare
 *   hash of a 10^6 space is trivially reversible, the server secret is not.
 * - After the code is verified, the caller gets a short-lived signed token that
 *   is bound to that OTP row; the reset consumes the row, so the token works
 *   once.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_SECONDS = 10 * 60;

const OTP_DIGITS = 6;
const RESET_TOKEN_PURPOSE = 'pwd-reset';

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');
}

export function hashOtp(secret: string, otpId: string, otp: string): string {
  return createHmac('sha256', secret).update(`${otpId}:${otp}`).digest('hex');
}

export function otpMatches(
  secret: string,
  otpId: string,
  otp: string,
  storedHash: string
): boolean {
  const expected = Buffer.from(hashOtp(secret, otpId, otp));
  const stored = Buffer.from(storedHash);
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

/** A key of its own, so a reset token can never double as an access token. */
function tokenKey(secret: string): Uint8Array {
  return createHmac('sha256', secret).update(RESET_TOKEN_PURPOSE).digest();
}

export function signResetToken(
  secret: string,
  claims: { userId: string; otpId: string }
): Promise<string> {
  return new SignJWT({ purpose: RESET_TOKEN_PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setJti(claims.otpId)
    .setIssuedAt()
    .setExpirationTime(`${RESET_TOKEN_TTL_SECONDS}s`)
    .sign(tokenKey(secret));
}

/** `null` for anything wrong: bad signature, expired, wrong purpose. */
export async function verifyResetToken(
  secret: string,
  token: string
): Promise<{ userId: string; otpId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, tokenKey(secret), {
      algorithms: ['HS256'],
    });
    if (
      payload.purpose !== RESET_TOKEN_PURPOSE ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return null;
    }
    return { userId: payload.sub, otpId: payload.jti };
  } catch {
    return null;
  }
}

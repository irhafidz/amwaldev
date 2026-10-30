import { randomBytes } from 'node:crypto';

/**
 * Opaque referral code generation (Sprint 11, I-4). `?ref=` must never carry a
 * raw `USER_ID`; it carries this random token, mapped back to a user via the
 * `affiliate_attributions` / referral-code store.
 */

const REFERRAL_CODE_BYTES = 12;

/** Random, URL-safe, opaque referral code. */
export function generateReferralCode(): string {
  return randomBytes(REFERRAL_CODE_BYTES).toString('base64url');
}

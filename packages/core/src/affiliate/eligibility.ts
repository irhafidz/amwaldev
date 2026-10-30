/**
 * Pure affiliate anti-abuse eligibility (Sprint 11, I-4 — Zone 1).
 *
 * Static checks only. The two dynamic checks — "≤ 10 rewarded conversions per
 * referrer per WIB day" and "≤ 1 per referrer–donor pair per 24h" — need the
 * `affiliate_attributions` table and are applied by the DB-touching settle
 * hook, not here.
 */

export type AffiliateModule =
  | 'WAKAF'
  | 'ZAKAT'
  | 'INFAQ'
  | 'SEDEKAH'
  | 'QURBAN';

const MIN_DONATION_RUPIAH = 10_000;

/** Zakat & qurban are excluded until there is a fiqh review (PLAN §8). */
const REWARDABLE_MODULES = new Set<AffiliateModule>([
  'WAKAF',
  'INFAQ',
  'SEDEKAH',
]);

export interface AffiliateEligibilityInput {
  referrerUserId: string;
  donorUserId: string;
  isAnonymous: boolean;
  module: AffiliateModule;
  amountRupiah: number;
  referrerEmail?: string | null;
  donorEmail?: string | null;
  referrerPhone?: string | null;
  donorPhone?: string | null;
}

export type AffiliateEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

export function isEligibleForAffiliateReward(
  input: AffiliateEligibilityInput
): AffiliateEligibility {
  if (input.referrerUserId === input.donorUserId) {
    return { eligible: false, reason: 'self-referral' };
  }
  if (input.isAnonymous) {
    return { eligible: false, reason: 'anonymous-donor' };
  }
  if (!REWARDABLE_MODULES.has(input.module)) {
    return { eligible: false, reason: 'fiqh-excluded-module' };
  }
  if (input.amountRupiah < MIN_DONATION_RUPIAH) {
    return { eligible: false, reason: 'below-minimum' };
  }
  if (
    input.referrerEmail &&
    input.donorEmail &&
    input.referrerEmail === input.donorEmail
  ) {
    return { eligible: false, reason: 'same-email' };
  }
  if (
    input.referrerPhone &&
    input.donorPhone &&
    input.referrerPhone === input.donorPhone
  ) {
    return { eligible: false, reason: 'same-phone' };
  }
  return { eligible: true };
}

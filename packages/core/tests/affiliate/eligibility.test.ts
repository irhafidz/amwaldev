import { describe, expect, test } from 'bun:test';
import { generateReferralCode } from '../../src/affiliate/code';
import { isEligibleForAffiliateReward } from '../../src/affiliate/eligibility';

const base = {
  referrerUserId: 'referrer-1',
  donorUserId: 'donor-1',
  isAnonymous: false,
  module: 'WAKAF' as const,
  amountRupiah: 50_000,
};

describe('affiliate eligibility (I-4)', () => {
  test('a valid WAKAF donation is eligible', () => {
    expect(isEligibleForAffiliateReward(base)).toEqual({ eligible: true });
  });

  test('rejects self-referral', () => {
    expect(
      isEligibleForAffiliateReward({ ...base, donorUserId: 'referrer-1' })
    ).toEqual({ eligible: false, reason: 'self-referral' });
  });

  test('rejects anonymous donors', () => {
    expect(
      isEligibleForAffiliateReward({ ...base, isAnonymous: true })
    ).toEqual({
      eligible: false,
      reason: 'anonymous-donor',
    });
  });

  test('rejects zakat and qurban (fiqh-excluded)', () => {
    expect(isEligibleForAffiliateReward({ ...base, module: 'ZAKAT' })).toEqual({
      eligible: false,
      reason: 'fiqh-excluded-module',
    });
    expect(isEligibleForAffiliateReward({ ...base, module: 'QURBAN' })).toEqual(
      { eligible: false, reason: 'fiqh-excluded-module' }
    );
  });

  test('rejects below-minimum donation', () => {
    expect(
      isEligibleForAffiliateReward({ ...base, amountRupiah: 9999 })
    ).toEqual({ eligible: false, reason: 'below-minimum' });
  });

  test('rejects same email or phone', () => {
    expect(
      isEligibleForAffiliateReward({
        ...base,
        referrerEmail: 'a@x.com',
        donorEmail: 'a@x.com',
      })
    ).toEqual({ eligible: false, reason: 'same-email' });
    expect(
      isEligibleForAffiliateReward({
        ...base,
        referrerPhone: '0812',
        donorPhone: '0812',
      })
    ).toEqual({ eligible: false, reason: 'same-phone' });
  });
});

describe('referral code (I-4)', () => {
  test('generates an opaque, URL-safe code', () => {
    const a = generateReferralCode();
    const b = generateReferralCode();
    expect(a.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
    expect(a).not.toContain('/');
    expect(a).not.toContain('+');
  });
});

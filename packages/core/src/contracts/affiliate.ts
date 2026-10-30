import { z } from 'zod';

/**
 * Affiliate oRPC contracts (Sprint 11, I-4 — Zone 1). Frozen Monday 13:00 WIB;
 * changes only through `docs/sprint-11/CONTRACT-CHANGES.md`.
 *
 * `?ref=` never carries a raw `USER_ID`: it carries the opaque, URL-safe code
 * from `generateReferralCode()` (`@amwal/core/affiliate/code` — 12 bytes
 * base64url, exactly 16 characters). The share route stores it in the httpOnly
 * cookie below for 30 days, *first-touch*: a later `?ref=` never overwrites an
 * attribution that is already in place.
 *
 * Reward is only ever settled from a LUNAS donation in `onSettled`, under the
 * idempotency key `affiliate:{transactionId}`
 * (`min(100 + ⌊nominal/10.000⌋, 500)` — `@amwal/core/gamification/points`).
 * Klik dan impresi dicatat dengan 0 poin; hadiah tidak dibayar dari dana
 * ZISWAF.
 */

/** Cookie atribusi first-touch; nama tunggal, dipakai route `/r/$kode`. */
export const AFFILIATE_REF_COOKIE = 'amwal_ref';

/** 30 hari — `Max-Age` cookie `amwal_ref`. */
export const AFFILIATE_REF_COOKIE_MAX_AGE_SECONDS = 2_592_000;

/**
 * Modul yang boleh menghasilkan reward. Zakat & qurban dikecualikan sampai
 * ada kajian fiqih (PLAN §8), jadi keduanya ditolak di kontrak — bukan
 * diam-diam diabaikan.
 */
export const AFFILIATE_REWARDABLE_MODULES = [
  'WAKAF',
  'INFAQ',
  'SEDEKAH',
] as const;

/** 12 byte base64url dari `generateReferralCode()` → tepat 16 karakter. */
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;

/** `affiliate.capture` — kode opak dari `?ref=` / rute `/r/$kode`. */
export const referralCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(REFERRAL_CODE_PATTERN, 'Kode referral tidak valid'),
});

/**
 * Input gerbang eligibilitas reward. Refinement di bawah menolak lebih awal
 * dengan pesan Bahasa Indonesia; `isEligibleForAffiliateReward()`
 * (`@amwal/core/affiliate/eligibility`) tetap menjadi otoritas untuk jalur
 * settle-hook yang membaca nilainya dari database, dengan alasan yang sama
 * (`self-referral`, `anonymous-donor`, `fiqh-excluded-module`, `below-minimum`,
 * `same-email`, `same-phone`). Dua syarat dinamis — maks 10 konversi berpoin
 * per perujuk per hari WIB, dan maks 1 per pasangan perujuk–donatur per 24 jam
 * — butuh tabel `affiliate_attributions` dan diperiksa settle-hook.
 */
export const affiliateEligibilitySchema = z
  .object({
    referrerUserId: z.string().trim().min(1, 'ID perujuk wajib diisi'),
    donorUserId: z.string().trim().min(1, 'ID donatur wajib diisi'),
    isAnonymous: z.boolean().default(false),
    module: z.enum(AFFILIATE_REWARDABLE_MODULES, {
      error: 'Zakat & qurban dikecualikan dari reward afiliasi',
    }),
    amountRupiah: z
      .number()
      .int('Nominal harus bilangan bulat rupiah')
      .min(10_000, 'Nominal donasi minimal Rp 10.000'),
    referrerEmail: z.string().trim().nullish(),
    donorEmail: z.string().trim().nullish(),
    referrerPhone: z.string().trim().nullish(),
    donorPhone: z.string().trim().nullish(),
  })
  .refine((v) => v.referrerUserId !== v.donorUserId, {
    message: 'Reward afiliasi tidak berlaku untuk referral diri sendiri',
    path: ['donorUserId'],
  })
  .refine((v) => !v.isAnonymous, {
    message: 'Donatur anonim tidak dapat diatribusikan ke kode referral',
    path: ['isAnonymous'],
  })
  .refine(
    (v) =>
      !(v.referrerEmail && v.donorEmail && v.referrerEmail === v.donorEmail),
    {
      message: 'Email perujuk dan donatur tidak boleh sama',
      path: ['donorEmail'],
    }
  )
  .refine(
    (v) =>
      !(v.referrerPhone && v.donorPhone && v.referrerPhone === v.donorPhone),
    {
      message: 'Nomor HP perujuk dan donatur tidak boleh sama',
      path: ['donorPhone'],
    }
  );

/** `affiliate.code` — kode referral opak milik pengguna sesi. */
export const affiliateCodeSchema = z.object({});

/** `affiliate.dashboard` — ringkasan referral milik pengguna sesi. */
export const affiliateDashboardSchema = z.object({});

/** `affiliate.claims` — konversi berpoin milik pengguna sesi. */
export const affiliateClaimsSchema = z.object({
  limit: z
    .number()
    .int('Limit harus bilangan bulat')
    .min(1, 'Limit minimal 1')
    .max(100, 'Limit maksimal 100')
    .default(20),
  cursor: z.string().min(1).optional(),
});

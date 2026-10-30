import { getOrCreateAffiliateCode } from '@amwal/core/affiliate/get-or-create-code';
import {
  affiliateClaimsSchema,
  affiliateCodeSchema,
  affiliateDashboardSchema,
  referralCodeSchema,
} from '@amwal/core/contracts/affiliate';
import { ORPCError } from '@orpc/server';
import { count, eq } from 'drizzle-orm';
import { affiliateAttributions, affiliateClicks } from '@/lib/db/schema';
import { protectedProcedure, publicProcedure } from '../procedures';

/**
 * `capture` sengaja `publicProcedure`: tautan `?ref=` diklik pengunjung yang
 * belum tentu sudah masuk, dan atribusi first-touch harus tercatat di cookie
 * sebelum ada sesi. Selebihnya `protectedProcedure` — data referral milik
 * pengguna sesi.
 *
 * Kode referral bersifat opak (16 karakter base64url) dan **tidak pernah**
 * berisi `USER_ID`. Reward hanya diselesaikan dari donasi LUNAS di
 * `onSettled`, di bawah kunci `affiliate:{transactionId}` — bukan dari klik,
 * dan tidak pernah dibayar dari dana ZISWAF.
 *
 * Status implementasi (Sprint 11, I-4):
 * - `myCode`, `dashboard`: DIISI di sini. `dashboard` adalah prosedur yang
 *   diminta ticket sebagai "affiliate.stats" — nama tetap `dashboard` karena
 *   itulah yang dibekukan `contracts/affiliate.ts` Senin 13:00 WIB; lihat
 *   `docs/sprint-11/CONTRACT-CHANGES.md`.
 * - `capture`: rute HTTP murni `/r/$kode` (redirect 302 + Set-Cookie) sudah
 *   menutup jalur utama penangkapan `?ref=`. Prosedur oRPC ini tetap STUB —
 *   dicadangkan untuk penangkapan sisi-klien tanpa navigasi penuh (mis. SPA
 *   yang mendarat lewat query string, bukan `/r/$kode`) dan belum ada UI yang
 *   memanggilnya.
 * - `claims`: masih STUB — daftar konversi berpoin bergantung pada ledger
 *   gamifikasi (I-10, kini di tangan Awan) yang belum menuliskan baris
 *   ber-`idempotencyKey` `affiliate:{transactionId}`.
 */

const NOT_IMPLEMENTED = { message: 'Belum diimplementasikan', data: {} };

/** Merekam kode dari `?ref=` ke cookie atribusi; first-touch menang. */
const capture = publicProcedure.input(referralCodeSchema).handler(() => {
  throw new ORPCError('NOT_IMPLEMENTED', NOT_IMPLEMENTED);
});

/** Kode referral opak milik pengguna sesi; dibuat bila belum ada. */
const myCode = protectedProcedure
  .input(affiliateCodeSchema)
  .handler(async ({ context }) => {
    const sessionUser = context.user;
    if (!sessionUser) {
      // protectedProcedure guarantees this is unreachable — narrows the type.
      throw new ORPCError('UNAUTHORIZED');
    }

    const code = await getOrCreateAffiliateCode(context.db, sessionUser.userId);
    return { data: { code } };
  });

/** Ringkasan klik dan donasi teratribusi milik pengguna sesi. */
const dashboard = protectedProcedure
  .input(affiliateDashboardSchema)
  .handler(async ({ context }) => {
    const sessionUser = context.user;
    if (!sessionUser) {
      // protectedProcedure guarantees this is unreachable — narrows the type.
      throw new ORPCError('UNAUTHORIZED');
    }

    const code = await getOrCreateAffiliateCode(context.db, sessionUser.userId);

    const [clickRow] = await context.db
      .select({ total: count() })
      .from(affiliateClicks)
      .where(eq(affiliateClicks.referralCode, code));

    const [attributionRow] = await context.db
      .select({ total: count() })
      .from(affiliateAttributions)
      .where(eq(affiliateAttributions.referrerUserId, sessionUser.userId));

    return {
      data: {
        code,
        totalClicks: clickRow?.total ?? 0,
        totalAttributedDonations: attributionRow?.total ?? 0,
      },
    };
  });

/** Daftar konversi berpoin milik pengguna sesi. */
const claims = protectedProcedure.input(affiliateClaimsSchema).handler(() => {
  throw new ORPCError('NOT_IMPLEMENTED', NOT_IMPLEMENTED);
});

export const affiliate = { capture, myCode, dashboard, claims };

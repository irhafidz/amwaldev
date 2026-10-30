import {
  AFFILIATE_REF_COOKIE,
  AFFILIATE_REF_COOKIE_MAX_AGE_SECONDS,
} from '@amwal/core/contracts/affiliate';
import { getCookie, setCookie } from '@orpc/server/helpers';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { env } from '@/env/server';
import { recordAffiliateClick } from '@/lib/affiliate/click-tracking';
import { resolveReferralRedirectTarget } from '@/lib/affiliate/referral-redirect';
import { db } from '@/lib/db';
import { affiliateCodes } from '@/lib/db/schema';

/**
 * Redirect referral [I-4] — pure HTTP, deliberately NOT an oRPC procedure:
 * a 302 with `Set-Cookie` is not a JSON-RPC response.
 *
 * First-touch: kalau `amwal_ref` sudah ada, TIDAK PERNAH ditimpa, apa pun
 * hasil validasi `kode` kali ini — atribusi milik klik pertama, bukan klik
 * terakhir. Kode yang tidak dikenal tidak menghasilkan galat: pengunjung
 * tetap diarahkan ke tujuan seperti biasa, hanya tanpa cookie atribusi.
 * Membedakan responsnya untuk kode salah akan jadi *oracle* untuk menebak
 * kode orang lain.
 *
 * Click tracking: kode yang dikenal mencatat satu baris `affiliate_clicks`
 * (di-deduplikasi per IP+User-Agent per hari WIB), terlepas dari cookie
 * first-touch. Atribusi tetap milik klik pertama, sementara kunjungan
 * berulang dari perangkat yang sama dalam 24 jam tidak dihitung spam.
 * Kegagalan pencatatan bersifat non-fatal: redirect tetap berjalan.
 *
 * Target redirect divalidasi `resolveReferralRedirectTarget()` — hanya path
 * relatif satu-origin yang diterima, mencegah open redirect lewat `?to=`.
 */

async function isKnownReferralCode(code: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: affiliateCodes.userId })
    .from(affiliateCodes)
    .where(eq(affiliateCodes.code, code))
    .limit(1);
  return Boolean(row);
}

export async function handle({
  request,
  params,
}: {
  request: Request;
  params: { kode: string };
}): Promise<Response> {
  const url = new URL(request.url);
  const target = resolveReferralRedirectTarget(url.searchParams.get('to'));
  const headers = new Headers({
    Location: new URL(target, url.origin).toString(),
  });

  const code = params.kode.trim();
  const hasExistingCookie = Boolean(
    getCookie(request.headers, AFFILIATE_REF_COOKIE)
  );

  if (code && (await isKnownReferralCode(code))) {
    await recordAffiliateClick(code, request).catch(() => {
      /* click tracking is best-effort: never break the redirect */
    });

    if (!hasExistingCookie) {
      setCookie(headers, AFFILIATE_REF_COOKIE, code, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: AFFILIATE_REF_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  return new Response(null, { status: 302, headers });
}

export const ServerRoute = createServerFileRoute('/r/$kode').methods({
  GET: handle,
});

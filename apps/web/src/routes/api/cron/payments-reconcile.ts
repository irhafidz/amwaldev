import { timingSafeEqual } from 'node:crypto';
import { reconcilePendingTransactions } from '@amwal/core/payment/reconciliation';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { env } from '@/env/server';
import { db } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payment';
import { createSettlementHook } from '@/lib/payment/settlement';

/**
 * Job rekonsiliasi pembayaran Mayar [I-11] — pure HTTP: dipanggil scheduler
 * eksternal (cron), bukan pengguna lewat browser, jadi tidak ada alasan ini
 * jadi prosedur oRPC. Logikanya sendiri (kueri PENDING > 15 menit, re-fetch,
 * `applyProviderEvent`) ada di `@amwal/core/payment/reconciliation` — rute
 * ini cuma otentikasi + pemetaan HTTP, sama seperti webhook pembayaran.
 *
 * Proteksi: `Authorization: Bearer <CRON_SECRET>`, dibandingkan
 * `timingSafeEqual` seperti token callback Mayar — token yang salah tidak
 * boleh dibedakan lewat waktu respons.
 */

const BEARER_PREFIX = 'Bearer ';

function isValidCronSecret(header: string | null): boolean {
  if (!(header?.startsWith(BEARER_PREFIX) && env.CRON_SECRET)) {
    return false;
  }
  const token = header.slice(BEARER_PREFIX.length);
  const actual = Buffer.from(token);
  const expected = Buffer.from(env.CRON_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handle({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!isValidCronSecret(request.headers.get('authorization'))) {
    return Response.json(
      { error: 'Unauthorized: token cron tidak valid' },
      { status: 401 }
    );
  }

  const summary = await reconcilePendingTransactions({
    database: db,
    paymentProvider: getPaymentProvider(),
    onSettled: createSettlementHook(db),
  });

  return Response.json({ ok: true, ...summary });
}

export const ServerRoute = createServerFileRoute(
  '/api/cron/payments-reconcile'
).methods({
  POST: handle,
});

import { handlePaymentWebhook } from '@amwal/core/payment/webhook';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { db } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payment';
import { createSettlementHook } from '@/lib/payment/settlement';

/**
 * Webhook Mayar (`/api/webhooks/mayar`) — HTTP murni, bukan prosedur oRPC:
 * Mayar memanggil URL ini sendiri dan mengharapkan respons HTTP biasa.
 *
 * Keasliannya dijamin header `x-callback-token`, dibandingkan constant-time
 * dengan `MAYAR_WEBHOOK_SECRET` di `MayarPaymentProvider.resolveWebhook`
 * sebelum payload disentuh. Payload bukan sumber kebenaran: status akhir dan
 * nominal selalu diambil ulang dari API Mayar, lalu diterapkan lewat
 * `applyProviderEvent` — satu `UPDATE ... WHERE status != 'LUNAS'` yang
 * membuat webhook ulang (atau yang bersamaan dengan cek status / cron) tidak
 * pernah menghitung ganda.
 *
 * Efek samping (WhatsApp, notifikasi, sertifikat, poin, afiliasi) ada di
 * `createSettlementHook`, dipakai bersama semua jalur penyelesaian.
 */
export function handle({ request }: { request: Request }): Promise<Response> {
  return handlePaymentWebhook(request, {
    database: db,
    paymentProvider: getPaymentProvider(),
    onSettled: createSettlementHook(db),
  });
}

export const ServerRoute = createServerFileRoute('/api/webhooks/mayar').methods(
  {
    POST: handle,
  }
);

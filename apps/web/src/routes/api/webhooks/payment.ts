import { handlePaymentWebhook } from '@amwal/core/payment/webhook';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { db } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payment';
import { createSettlementHook } from '@/lib/payment/settlement';

/**
 * Payment webhook (Putaran 17, Batch 3; `onSettled` wired in Batch 6) —
 * pure HTTP, deliberately NOT an oRPC procedure: Midtrans posts a raw,
 * unauthenticated payload here and expects a plain HTTP response, so the
 * SHA-512 signature check inside `@amwal/core/payment/webhook` is the only
 * gate.
 *
 * Idempotency is enforced inside `handlePaymentWebhook` itself (the atomic
 * `UPDATE ... WHERE status != 'LUNAS' RETURNING *` guard) — a replayed
 * settlement can never increment the ledger, qurban slot count, or the
 * WhatsApp thank-you message twice: `onSettled` only fires once, from
 * inside that same guarded branch.
 *
 * Sprint 11 (`I-10b`): the same slot now also awards the D2 points
 * (`+200` and `+⌊nominal/1.000⌋`). The slot itself is best-effort — a points
 * failure must never fail a payment acknowledgment — and each ledger row is
 * keyed by the transaction, so a duplicate slot call pays nothing twice.
 *
 * Sprint 11 (`I-4`): awards affiliate referral reward points to the referrer
 * under `affiliate:{transactionId}` for attributed donations. Best-effort.
 */
export function handle({ request }: { request: Request }): Promise<Response> {
  return handlePaymentWebhook(request, {
    database: db,
    paymentProvider: getPaymentProvider(),
    onSettled: createSettlementHook(db),
  });
}

export const ServerRoute = createServerFileRoute(
  '/api/webhooks/payment'
).methods({
  POST: handle,
});

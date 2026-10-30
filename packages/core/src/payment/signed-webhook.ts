import type {
  ProviderEventOutcome,
  ProviderWebhookResult,
} from './provider-event';
import type { WebhookPayload } from './types';

/**
 * Resolusi webhook bergaya Midtrans — payload menggemakan `order_id`, status
 * ada di payload, dan keasliannya dijamin tanda tangan SHA-512 [I-11].
 *
 * Dipakai tiga pemanggil: `MockPaymentProvider.resolveWebhook`,
 * `MidtransPaymentProvider.resolveWebhook`, dan jalur cadangan
 * `handlePaymentWebhook` untuk provider yang belum v2. Sebelum berkas ini,
 * logika yang sama hidup langsung di handler webhook, sehingga provider lokal
 * tidak bisa diuji lewat antarmuka v2 yang dipakai Mayar dan dua jalur itu
 * berisiko menyimpang diam-diam.
 *
 * Fungsi ini murni: tidak menyentuh database dan tidak melakukan panggilan
 * jaringan, sehingga simulasi transaksi lokal tidak pernah bergantung pada
 * sandbox eksternal. Pesan dan kode status dipertahankan persis sama dengan
 * handler lama karena `apps/web/tests/orpc/webhook.test.ts` menegaskannya.
 */

export type VerifySignature = (
  payload: WebhookPayload,
  signature: string
) => boolean;

export function signedPayloadOutcome(
  payload: WebhookPayload
): ProviderEventOutcome {
  const status = payload.transaction_status?.toLowerCase();
  const fraud = payload.fraud_status?.toLowerCase();

  if (
    (status === 'settlement' || status === 'capture') &&
    (!fraud || fraud === 'accept')
  ) {
    return 'LUNAS';
  }

  if (
    status === 'deny' ||
    status === 'cancel' ||
    status === 'expire' ||
    status === 'failure' ||
    status === 'gagal' ||
    fraud === 'deny'
  ) {
    return 'GAGAL';
  }

  // `pending`, `challenge` (tinjauan fraud), dan status tak dikenal tetap
  // PENDING — status yang tidak dimengerti tidak pernah boleh menjadi GAGAL.
  return 'PENDING';
}

function parsePayload(rawBody: string): WebhookPayload | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    // `JSON.parse('null')` dan `JSON.parse('7')` sah secara sintaks, tetapi
    // bukan payload; handler lama akan melempar TypeError di sini.
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as WebhookPayload)
      : null;
  } catch {
    return null;
  }
}

export function resolveSignedWebhook(
  request: Request,
  rawBody: string,
  verifySignature: VerifySignature
): ProviderWebhookResult {
  const payload = parsePayload(rawBody);
  if (!payload) {
    return { type: 'rejected', status: 400, message: 'Invalid JSON body' };
  }

  const signature =
    request.headers.get('x-signature-key') ??
    request.headers.get('x-signature') ??
    (typeof payload.signature_key === 'string' ? payload.signature_key : null);

  if (!(signature && payload.order_id && verifySignature(payload, signature))) {
    return {
      type: 'rejected',
      status: 403,
      message: 'Invalid webhook signature',
    };
  }

  const orderId = String(payload.order_id).trim();
  if (!orderId) {
    return { type: 'rejected', status: 400, message: 'order_id is required' };
  }

  return {
    type: 'event',
    event: { orderId, outcome: signedPayloadOutcome(payload) },
  };
}

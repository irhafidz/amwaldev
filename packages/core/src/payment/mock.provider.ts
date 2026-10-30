import { instructionsFromPaymentDetail } from './mayar-instructions';
import type { ProviderWebhookResult } from './provider-event';
import { createMidtransSignatureKey, verifySha512Signature } from './signature';
import { resolveSignedWebhook } from './signed-webhook';
import type {
  CreatePaymentPayload,
  CreatePaymentResponse,
  PaymentProviderV2,
  WebhookPayload,
} from './types';

const NON_DIGITS = /\D/g;
const SIMULATED_EXPIRY_MS = 15 * 60 * 1000;

/** `paymentDetail` tiruan berbentuk respons Mayar v2 untuk metode terpilih. */
function simulatedPaymentDetail(
  payload: CreatePaymentPayload,
  simulatorUrl: string
): Record<string, unknown> | undefined {
  const method = String(payload.paymentType);
  const expiresAt = new Date(Date.now() + SIMULATED_EXPIRY_MS).toISOString();

  if (method === 'qris') {
    return {
      qr_code: {
        channel_properties: {
          qr_string: `AMWAL-SIMULASI-QRIS|${payload.orderId}|${String(payload.grossAmount)}`,
          expires_at: expiresAt,
        },
      },
    };
  }
  if (method.startsWith('va/')) {
    const digits = payload.orderId
      .replace(NON_DIGITS, '')
      .slice(-10)
      .padStart(10, '0');
    return {
      virtual_account: {
        channel_code: method.slice('va/'.length).toUpperCase(),
        channel_properties: {
          virtual_account_number: `880800${digits}`,
          expires_at: expiresAt,
        },
      },
    };
  }
  if (method.startsWith('ewallet/')) {
    return {
      ewallet: { channel_code: method.slice('ewallet/'.length).toUpperCase() },
      actions: [{ action: 'AUTH', url: simulatorUrl, url_type: 'WEB' }],
    };
  }
  return;
}

/**
 * Provider lokal untuk pengembangan dan tes — tanpa jaringan sama sekali.
 *
 * Mengimplementasikan kontrak v2 yang sama dengan Mayar, sehingga alur
 * `resolveWebhook` → `applyProviderEvent` bisa diuji dan disimulasikan
 * end-to-end tanpa sandbox eksternal. Webhook-nya tetap bergaya Midtrans
 * (tanda tangan SHA-512 dengan `PAYMENT_SERVER_KEY`). Tidak ada halaman
 * simulator lagi: tes mengirim webhook bertanda tangan langsung, dan
 * `redirectUrl` hanya menunjuk riwayat transaksi.
 *
 * Instruksi bayar (QRIS/VA/e-wallet) dibangun lewat pembaca `paymentDetail`
 * Mayar yang sama, jadi layar bayar di localhost identik dengan produksi.
 * Isinya ditandai SIMULASI dan tidak bisa dibayar sungguhan.
 */
export class MockPaymentProvider implements PaymentProviderV2 {
  readonly name = 'MOCK' as const;
  private readonly serverKey: string;

  constructor(serverKey = 'mock-server-key-not-a-real-secret') {
    this.serverKey = serverKey;
  }

  async createTransaction(
    payload: CreatePaymentPayload
  ): Promise<CreatePaymentResponse> {
    const query = new URLSearchParams({
      ref: payload.orderId,
      amount: String(payload.grossAmount),
      method: payload.paymentType,
    });
    const simulatorUrl = `/riwayat?${query.toString()}`;

    return {
      instructions: await instructionsFromPaymentDetail(
        simulatedPaymentDetail(payload, simulatorUrl)
      ),
      providerRef: payload.orderId,
      redirectUrl: simulatorUrl,
      paymentType: payload.paymentType,
      qrCodeUrl:
        payload.paymentType === 'qris'
          ? `${simulatorUrl}&status=qr-success`
          : undefined,
      virtualAccountUrl: payload.paymentType.startsWith('va/')
        ? `${simulatorUrl}&status=va-success`
        : undefined,
    };
  }

  verifyWebhookSignature(payload: WebhookPayload, signature: string): boolean {
    if (!this.serverKey) {
      return false;
    }

    const expected = createMidtransSignatureKey(payload, this.serverKey);
    return verifySha512Signature(expected, signature);
  }

  resolveWebhook(
    request: Request,
    rawBody: string
  ): Promise<ProviderWebhookResult> {
    return Promise.resolve(
      resolveSignedWebhook(request, rawBody, (payload, signature) =>
        this.verifyWebhookSignature(payload, signature)
      )
    );
  }
}

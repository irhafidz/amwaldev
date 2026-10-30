import type { ProviderWebhookResult } from './provider-event';
import { createMidtransSignatureKey, verifySha512Signature } from './signature';
import { resolveSignedWebhook } from './signed-webhook';
import type {
  CreatePaymentResponse,
  PaymentProviderV2,
  WebhookPayload,
} from './types';

/**
 * Provider Midtrans, dibungkus ke kontrak v2 — tidak dihapus [I-11].
 *
 * `createTransaction` tetap menolak sampai akun Midtrans tersedia. Resolusi
 * webhook-nya memakai jalur yang sama dengan `MockPaymentProvider`, sehingga
 * begitu akun aktif, perilaku tanda tangan dan idempotensinya sudah teruji.
 */
export class MidtransPaymentProvider implements PaymentProviderV2 {
  readonly name = 'MIDTRANS' as const;
  private readonly serverKey: string;

  constructor(serverKey = 'midtrans-server-key-legacy') {
    this.serverKey = serverKey;
  }

  createTransaction(): Promise<CreatePaymentResponse> {
    return Promise.reject(
      new Error(
        'MidtransPaymentProvider.createTransaction requires a configured Midtrans account; use MOCK_SANDBOX until it is available'
      )
    );
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

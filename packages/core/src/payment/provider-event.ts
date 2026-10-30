export type ProviderEventOutcome = 'LUNAS' | 'PENDING' | 'GAGAL';

/**
 * Event provider yang sudah dinormalisasi. `orderId` boleh kosong untuk
 * provider yang tidak menggemakan order ID internal kita (Mayar); dalam hal
 * itu `providerRef` dipakai untuk mencocokkan `transactions.payment_gateway_ref`.
 */
export interface ProviderEvent {
  orderId?: string | null;
  providerRef?: string | null;
  outcome: ProviderEventOutcome;
  /**
   * Nominal otoritatif hasil re-fetch provider. Bila diisi, nilai ini
   * dibandingkan numerik dengan nominal anchor sebelum ledger disentuh.
   */
  expectedAmount?: string;
}

export type ProviderWebhookResult =
  | { type: 'event'; event: ProviderEvent }
  | { type: 'ignored' }
  | {
      type: 'rejected';
      status: 400 | 401 | 403 | 404 | 409;
      message: string;
    }
  | {
      type: 'retry';
      status: 500 | 502 | 503 | 504;
      message: string;
    };

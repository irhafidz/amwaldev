import type { PaymentMethodCode } from './methods';
import type { ProviderWebhookResult } from './provider-event';

export type {
  ProviderEvent,
  ProviderEventOutcome,
  ProviderWebhookResult,
} from './provider-event';

/**
 * Kode metode Mayar (`qris`, `va/bni`, `ewallet/gopay`, ...) ditambah nilai
 * lama yang masih ada di riwayat transaksi.
 */
export type PaymentType =
  | PaymentMethodCode
  | 'qris'
  | 'virtual_account'
  | 'bank_transfer'
  | 'credit_card'
  | 'echannel'
  | 'cstore'
  | 'gopay';

export type GrossAmount = number | `${number}`;
export type PaymentProviderName = 'MOCK' | 'MIDTRANS' | 'MAYAR';

declare const disbursementDestinationBrand: unique symbol;

export type DisbursementDestination = string & {
  readonly [disbursementDestinationBrand]: 'DisbursementDestination';
};

export function toDisbursementDestination(
  value: string
): DisbursementDestination {
  const destination = value.trim();
  if (destination.length === 0) {
    throw new Error('disbursementDestination must not be empty');
  }
  return destination as DisbursementDestination;
}

export interface CreatePaymentPayload {
  customerEmail?: string;
  customerMobile?: string;
  customerName?: string;
  orderId: string;
  grossAmount: GrossAmount;
  paymentType: PaymentType;
  disbursementDestination: DisbursementDestination;
  description?: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cara bayar yang bisa ditampilkan langsung di Amwal, diambil dari respons
 * pembuatan pembayaran provider (lihat `mayar-instructions.ts`).
 */
export type PaymentInstructions =
  | {
      type: 'qris';
      /** Isi QRIS mentah (EMV). */
      qrString: string;
      /** Gambar QR siap tampil (data URL PNG), dibuat dari `qrString`. */
      qrImage?: string;
      expiresAt?: string;
    }
  | {
      type: 'virtual_account';
      /** Kode bank dari Mayar, mis. `BNI`. */
      bank: string;
      accountNumber: string;
      expiresAt?: string;
    }
  | {
      type: 'ewallet';
      /** Kode dompet dari Mayar, mis. `GOPAY`. */
      wallet: string;
      /** Tautan membuka aplikasi dompet (deeplink) atau halaman bayarnya (web). */
      actionUrl: string;
      actionType: 'DEEPLINK' | 'WEB';
    };

export interface CreatePaymentResponse {
  /** Instruksi bayar siap tampil; kosong bila provider tidak mengirimnya. */
  instructions?: PaymentInstructions;
  providerRef: string;
  redirectUrl: string;
  paymentType: PaymentType;
  qrCodeUrl?: string;
  virtualAccountUrl?: string;
  /** Set by `createPayment()` from `paymentProvider.name`. */
  provider?: PaymentProviderName;
  /** ISO expiry of the payment link, when the provider reports one. */
  expiredAt?: string;
}

export interface WebhookPayload {
  order_id: string;
  status_code: string;
  gross_amount: GrossAmount;
  payment_type?: string;
  transaction_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  signature_key?: string;
}

export interface PaymentProvider {
  createTransaction(
    payload: CreatePaymentPayload
  ): Promise<CreatePaymentResponse>;
  verifyWebhookSignature(payload: WebhookPayload, signature: string): boolean;
  readonly name?: PaymentProviderName;
  /**
   * Adapter v2. Provider lama boleh tidak mengimplementasikannya; webhook
   * handler akan memakai jalur `verifyWebhookSignature` yang lama.
   */
  resolveWebhook?(
    request: Request,
    rawBody: string
  ): Promise<ProviderWebhookResult>;
  /**
   * [I-11] Re-fetch server-side by provider reference, untuk job
   * rekonsiliasi (bukan webhook). Opsional di level dasar (seperti
   * `resolveWebhook`) supaya `reconcilePendingTransactions()` bisa menerima
   * `PaymentProvider` mana pun: provider berbasis webhook murni tanpa API
   * polling (Mock, Midtrans) tidak mengimplementasikannya, dan job itu
   * melaporkan `supported: false` alih-alih memperlakukannya sebagai galat.
   */
  reconcileTransaction?(providerRef: string): Promise<ProviderWebhookResult>;
}

/**
 * Kontrak v2 untuk provider yang tidak lagi memercayai payload webhook
 * mentah dan melakukan re-fetch server-side.
 */
export interface PaymentProviderV2 extends PaymentProvider {
  readonly name: PaymentProviderName;
  resolveWebhook(
    request: Request,
    rawBody: string
  ): Promise<ProviderWebhookResult>;
}

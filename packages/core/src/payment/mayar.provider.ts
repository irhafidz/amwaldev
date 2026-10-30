import { timingSafeEqual } from 'node:crypto';
import { instructionsFromPaymentDetail } from './mayar-instructions';
import { isPaymentMethodCode } from './methods';
import type {
  CreatePaymentPayload,
  CreatePaymentResponse,
  PaymentProviderV2,
  ProviderWebhookResult,
  WebhookPayload,
} from './types';

/**
 * Produksi `api.mayar.id`, sandbox `api.mayar.io`. Pembuatan pembayaran dan
 * pembacaan transaksi sama-sama memakai API v2: hanya v2 punya
 * `paymentMethod` untuk membatasi channel ke QRIS, dan v1 tidak.
 */
const DEFAULT_ROOT = 'https://api.mayar.id';
const VERSION_SUFFIX_PATTERN = /\/hl\/v\d+$/;
const DEFAULT_TIMEOUT_MS = 8000;
/** Membuat pembayaran lebih lambat dari membaca status; Mayar kadang butuh beberapa detik. */
const CREATE_TIMEOUT_MS = 15_000;
/** Tautan bayar kedaluwarsa setelah ini; status `expired` melepas slot qurban. */
const DEFAULT_EXPIRES_IN_MINUTES = 24 * 60;
const MINUTE_MS = 60_000;
/**
 * Jeda sebelum percobaan ulang ke-1 dan ke-2. Panjang larik = jumlah retry,
 * jadi re-fetch paling banyak tiga permintaan.
 */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 1000];
const MAX_RETRIES = 2;
const TRAILING_SLASH_PATTERN = /\/+$/;
const DUPLICATE_REQUEST = /duplicate request/i;
const METHOD_DISABLED = /not available or disabled/i;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Kegagalan pembuatan pembayaran di sisi Mayar, dengan jenis yang bisa
 * dipetakan ke pesan ramah untuk donatur:
 * - `duplicate`: Mayar menolak (email + nominal) yang sama dalam 1 menit
 *   ("Duplicate request detected. Please wait 1 minute ...")
 * - `method_unavailable`: channel dimatikan di dasbor Mayar ("Payment method
 *   ... is not available or disabled")
 * - `unavailable`: jaringan/timeout atau 5xx
 * - `rejected`: penolakan lain (API key salah, payload ditolak, ...)
 */
export type MayarApiErrorKind =
  | 'duplicate'
  | 'method_unavailable'
  | 'unavailable'
  | 'rejected';

export class MayarApiError extends Error {
  readonly kind: MayarApiErrorKind;
  readonly status: number | null;

  constructor(kind: MayarApiErrorKind, message: string, status: number | null) {
    super(message);
    this.name = 'MayarApiError';
    this.kind = kind;
    this.status = status;
  }
}

function classifyCreateFailure(
  message: string,
  status: number
): MayarApiErrorKind {
  if (DUPLICATE_REQUEST.test(message)) {
    return 'duplicate';
  }
  if (METHOD_DISABLED.test(message)) {
    return 'method_unavailable';
  }
  return status >= 500 ? 'unavailable' : 'rejected';
}

export type MayarFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface MayarPaymentProviderConfig {
  apiKey: string;
  /**
   * Nilai yang Mayar kirim pada header `x-callback-token` di setiap webhook
   * (`MAYAR_WEBHOOK_SECRET`). Mayar tidak menandatangani badan webhook dengan
   * HMAC; header token inilah yang dibandingkan, dan status akhir tetap
   * diambil ulang dari API.
   */
  webhookSecret: string;
  /** Akar API v2, mis. `https://api.mayar.id/hl/v2`. */
  baseUrl?: string;
  /** Masa berlaku tautan bayar. Default 24 jam. */
  expiresInMinutes?: number;
  /** Disuntikkan tes supaya `expiredAt` deterministik. */
  now?: () => Date;
  fetchImpl?: MayarFetchImplementation;
  timeoutMs?: number;
  /**
   * Jeda backoff sebelum tiap percobaan ulang re-fetch. Dipotong ke
   * `MAX_RETRIES` entri — konfigurasi tidak bisa membuat webhook menahan
   * koneksi Mayar lebih lama dari kontrak.
   */
  retryDelaysMs?: readonly number[];
  /** Disuntikkan tes supaya backoff tidak benar-benar menunggu. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Hasil satu permintaan re-fetch, beserta apakah kegagalannya layak dicoba
 * ulang. Dipisah dari `resolution` karena dua hal itu tidak sama: 4xx dan
 * JSON rusak tetap dijawab `retry` ke Mayar (supaya bisa dikirim ulang setelah
 * masalahnya diperbaiki), tetapi **tidak** dicoba ulang di dalam proses —
 * mengulang permintaan yang pasti ditolak hanya memperpanjang webhook.
 */
type RefetchAttempt =
  | { retryable: false; result: { detail: MayarTransactionDetail } }
  | { retryable: boolean; result: { resolution: ProviderWebhookResult } };

interface MayarCreatePaymentData {
  paymentDetail?: unknown;
  id?: string;
  link?: string;
  url?: string;
  paymentUrl?: string;
  transactionId?: string;
  transaction_id?: string;
}

interface MayarCreatePaymentResponse {
  data?: MayarCreatePaymentData;
  messages?: string;
  statusCode?: number;
}

interface MayarTransactionDetail {
  amount?: number | string;
  id?: string;
  status?: string;
}

interface MayarTransactionResponse {
  data?: MayarTransactionDetail;
  messages?: string;
  statusCode?: number;
}

interface MayarWebhookPayload {
  data?: {
    amount?: number | string;
    id?: string;
    status?: string;
    transactionId?: string;
  };
  event?: string;
}

/**
 * Alamat API v2 dari nilai konfigurasi apa pun: akar polos
 * (`https://api.mayar.id`), atau dengan akhiran `/hl/v1` / `/hl/v2`, dengan
 * atau tanpa garis miring penutup. Hasilnya SELALU `<akar>/hl/v2` — satu
 * akhiran, tidak pernah ganda (`/hl/v2/hl/v2`) dan tidak pernah v1. API v1
 * dideprecate Mayar per 1 Oktober 2026, dan hanya v2 yang punya
 * `paymentMethod`.
 */
export function resolveMayarBaseUrl(configured?: string | null): string {
  const root = (configured?.trim() || DEFAULT_ROOT)
    .replace(TRAILING_SLASH_PATTERN, '')
    .replace(VERSION_SUFFIX_PATTERN, '')
    .replace(TRAILING_SLASH_PATTERN, '');

  return `${root}/hl/v2`;
}

/**
 * `providerRef` adalah id TRANSAKSI, bukan id payment request: hanya itu yang
 * dikenali `GET /transactions/{id}` dan yang dibawa webhook (`data.transactionId`).
 */
function parseCreatePaymentResponse(
  response: Response,
  body: MayarCreatePaymentResponse
): { link: string; paymentDetail: unknown; providerRef: string } {
  const data = body.data;

  if (!(response.ok && body.statusCode === 200 && data)) {
    const message = body.messages ?? String(response.status);
    throw new MayarApiError(
      classifyCreateFailure(message, response.status),
      `Mayar create payment failed: ${message}`,
      response.status
    );
  }

  const providerRef =
    data.transactionId ?? data.transaction_id ?? data.id ?? null;
  const link = data.link ?? data.url ?? data.paymentUrl ?? null;

  if (!(providerRef && link)) {
    throw new MayarApiError(
      'rejected',
      'Mayar create payment returned no transaction reference',
      response.status
    );
  }

  return { link, paymentDetail: data.paymentDetail, providerRef };
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function retryAttempt(
  status: 502 | 504,
  message: string,
  retryable: boolean
): RefetchAttempt {
  return {
    retryable,
    result: { resolution: { type: 'retry', status, message } },
  };
}

function outcomeFromMayarStatus(
  status: string | undefined
): 'LUNAS' | 'PENDING' | 'GAGAL' {
  const normalized = status?.trim().toUpperCase();

  // Spike lapangan: webhook mengirim "SUCCESS", sementara re-fetch sandbox
  // mengembalikan "paid" untuk transaksi yang benar-benar lunas.
  if (normalized === 'SUCCESS' || normalized === 'PAID') {
    return 'LUNAS';
  }

  if (
    normalized === 'CANCEL' ||
    normalized === 'CANCELLED' ||
    normalized === 'CANCELED' ||
    normalized === 'DENY' ||
    normalized === 'EXPIRED' ||
    normalized === 'FAILED' ||
    normalized === 'FAILURE'
  ) {
    return 'GAGAL';
  }

  return 'PENDING';
}

export class MayarPaymentProvider implements PaymentProviderV2 {
  readonly name = 'MAYAR' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly expiresInMinutes: number;
  private readonly fetchImpl: MayarFetchImplementation;
  private readonly now: () => Date;
  private readonly retryDelaysMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly webhookSecret: string;

  constructor(config: MayarPaymentProviderConfig) {
    if (!config.apiKey.trim()) {
      throw new Error('MayarPaymentProvider requires MAYAR_API_KEY');
    }
    if (!config.webhookSecret.trim()) {
      throw new Error('MayarPaymentProvider requires MAYAR_WEBHOOK_SECRET');
    }

    this.apiKey = config.apiKey.trim();
    this.webhookSecret = config.webhookSecret.trim();
    this.baseUrl = resolveMayarBaseUrl(config.baseUrl);
    this.expiresInMinutes =
      config.expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;
    this.now = config.now ?? (() => new Date());
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelaysMs = (
      config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    ).slice(0, MAX_RETRIES);
    this.sleep = config.sleep ?? defaultSleep;
  }

  async createTransaction(
    payload: CreatePaymentPayload
  ): Promise<CreatePaymentResponse> {
    // `paymentMethod` Mayar dikirim apa adanya dari pilihan donatur, tetapi
    // hanya kode yang kita kenal. Menolak di sini (bukan diam-diam mengganti
    // channel) membuat nilai lama atau salah ketik gagal terdengar, dan Mayar
    // tidak pernah menerima channel yang tidak sengaja dibuka.
    const paymentMethod = payload.paymentType;
    if (!isPaymentMethodCode(paymentMethod)) {
      throw new Error(
        `Metode pembayaran tidak didukung Mayar: ${payload.paymentType}`
      );
    }

    const amount = Number(payload.grossAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Mayar create payment requires a positive gross amount');
    }

    const description = payload.description || `Donasi ${payload.orderId}`;
    // Mayar menolak (email + nominal) yang sama dalam 1 menit sebagai duplikat.
    // Donatur tanpa email (tamu/anonim) semuanya akan berbagi satu alamat dan
    // bertabrakan pada nominal preset yang sama, jadi alamat pengganti dibuat
    // unik per pesanan. Alamat `+tag` tetap tiba di kotak hamba-allah@amwal.id (QA-06).
    const email =
      payload.customerEmail ??
      `hamba-allah+${payload.orderId.toLowerCase()}@amwal.id`;
    const mobile = payload.customerMobile ?? '081234567890';
    const name = payload.customerName ?? 'Donatur Amwal';
    const redirectUrl = payload.redirectUrl ?? 'https://example.com/finish';
    const expiredAt = new Date(
      this.now().getTime() + this.expiresInMinutes * MINUTE_MS
    ).toISOString();

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/payments/create`, {
        signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
        body: JSON.stringify({
          amount,
          description,
          email,
          expiredAt,
          mobile,
          name,
          paymentMethod,
          redirectUrl,
          extraData: {
            orderId: payload.orderId,
            ...(payload.metadata ?? {}),
          },
        }),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
    } catch (error) {
      throw new MayarApiError(
        'unavailable',
        isAbortError(error)
          ? 'Mayar create payment timed out'
          : 'Mayar create payment failed: network error',
        null
      );
    }
    const created = parseCreatePaymentResponse(
      response,
      (await response.json().catch(() => ({}))) as MayarCreatePaymentResponse
    );

    return {
      expiredAt,
      instructions: await instructionsFromPaymentDetail(created.paymentDetail),
      paymentType: paymentMethod,
      providerRef: created.providerRef,
      redirectUrl: created.link,
    };
  }

  verifyWebhookSignature(
    _payload: WebhookPayload,
    _signature: string
  ): boolean {
    return false;
  }

  async resolveWebhook(
    request: Request,
    rawBody: string
  ): Promise<ProviderWebhookResult> {
    let callbackToken =
      request.headers.get('x-callback-token') ??
      request.headers.get('x-mayar-token') ??
      request.headers.get('x-callback-secret');

    if (!callbackToken) {
      try {
        const url = new URL(request.url);
        callbackToken =
          url.searchParams.get('token') ??
          url.searchParams.get('callbackToken');
      } catch {
        // Ignored if URL parse fails
      }
    }

    if (!this.isValidCallbackToken(callbackToken)) {
      return {
        type: 'rejected',
        status: 403,
        message: 'Invalid webhook signature',
      };
    }

    let payload: MayarWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MayarWebhookPayload;
    } catch {
      return {
        type: 'rejected',
        status: 400,
        message: 'Invalid JSON body',
      };
    }

    const isSuccessEvent =
      !payload.event ||
      payload.event === 'payment.received' ||
      payload.event === 'invoice.paid' ||
      payload.event === 'payment.paid' ||
      payload.event === 'payment.success';

    if (!isSuccessEvent) {
      return { type: 'ignored' };
    }

    const providerRef =
      payload.data?.transactionId ??
      payload.data?.id ??
      (payload as Record<string, unknown>).transactionId ??
      (payload as Record<string, unknown>).id;
    if (typeof providerRef !== 'string' || !providerRef) {
      return {
        type: 'rejected',
        status: 400,
        message: 'Mayar webhook is missing transactionId',
      };
    }

    return await this.reconcileTransaction(providerRef);
  }

  /**
   * Re-fetch status transaksi by `providerRef` [I-11] — dipakai job
   * rekonsiliasi (`@amwal/core/payment/reconciliation`) DAN `resolveWebhook`
   * di atas, sehingga logika retry/backoff dan pemetaan status hanya ada di
   * satu tempat. Hasilnya `ProviderWebhookResult` yang sama persis:
   * `applyProviderEvent` tidak tahu dan tidak perlu tahu apakah event ini
   * datang dari webhook atau dari polling.
   */
  async reconcileTransaction(
    providerRef: string
  ): Promise<ProviderWebhookResult> {
    const detailResult = await this.fetchTransactionDetail(providerRef);
    if ('resolution' in detailResult) {
      return detailResult.resolution;
    }

    const detail = detailResult.detail;
    const amount = detail.amount;
    if (amount === undefined || amount === null) {
      return {
        type: 'retry',
        status: 502,
        message: 'Mayar transaction re-fetch returned no amount',
      };
    }

    return {
      type: 'event',
      event: {
        expectedAmount: String(amount),
        orderId: null,
        outcome: outcomeFromMayarStatus(detail.status),
        providerRef,
      },
    };
  }

  private isValidCallbackToken(token: string | null): boolean {
    if (!token) {
      return false;
    }

    const actual = Buffer.from(token);
    const expected = Buffer.from(this.webhookSecret);

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  /**
   * Re-fetch detail transaksi dengan retry terbatas [I-11, Defensif].
   *
   * Dicoba ulang HANYA untuk kegagalan yang mungkin sembuh sendiri: timeout,
   * error jaringan, dan HTTP 5xx. 4xx tidak pernah dicoba ulang — kunci API
   * yang salah tidak akan menjadi benar dalam satu detik.
   *
   * Paling banyak tiga permintaan dengan jeda 500 ms lalu 1000 ms. Setiap
   * percobaan mendapat `AbortSignal.timeout` baru; memakai ulang sinyal yang
   * sudah kedaluwarsa akan membuat percobaan berikutnya gagal seketika.
   *
   * Bila semua percobaan habis, hasilnya tetap `retry` (5xx) — **tidak
   * pernah** `GAGAL`. Retry di sini mengurangi ketergantungan pada pengiriman
   * ulang Mayar yang kebijakannya tidak terdokumentasi, tetapi tidak
   * menggantikan job rekonsiliasi sebagai jaring pengaman terakhir.
   *
   * Batas atas latensi: 3 × `timeoutMs` + 1,5 detik.
   */
  private async fetchTransactionDetail(
    providerRef: string
  ): Promise<
    { detail: MayarTransactionDetail } | { resolution: ProviderWebhookResult }
  > {
    let attempt = await this.requestTransactionDetail(providerRef);

    for (const delayMs of this.retryDelaysMs) {
      if (!attempt.retryable) {
        break;
      }
      await this.sleep(delayMs);
      attempt = await this.requestTransactionDetail(providerRef);
    }

    return attempt.result;
  }

  private async requestTransactionDetail(
    providerRef: string
  ): Promise<RefetchAttempt> {
    let response: Response;

    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/transactions/${encodeURIComponent(providerRef)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );
    } catch (error) {
      if (isAbortError(error)) {
        return retryAttempt(504, 'Mayar transaction re-fetch timed out', true);
      }
      return retryAttempt(502, 'Mayar transaction re-fetch failed', true);
    }

    if (response.status === 404) {
      return {
        retryable: false,
        result: {
          resolution: {
            type: 'rejected',
            status: 404,
            message: 'Mayar transaction not found',
          },
        },
      };
    }

    if (response.status >= 500) {
      return retryAttempt(
        502,
        `Mayar transaction re-fetch failed with HTTP ${response.status}`,
        true
      );
    }

    if (!response.ok) {
      return retryAttempt(
        502,
        `Mayar transaction re-fetch rejected with HTTP ${response.status}`,
        false
      );
    }

    let body: MayarTransactionResponse;
    try {
      body = (await response.json()) as MayarTransactionResponse;
    } catch {
      return retryAttempt(
        502,
        'Mayar transaction re-fetch returned invalid JSON',
        false
      );
    }

    if (!body.data) {
      return retryAttempt(
        502,
        'Mayar transaction re-fetch returned no data',
        false
      );
    }

    return { retryable: false, result: { detail: body.data } };
  }
}

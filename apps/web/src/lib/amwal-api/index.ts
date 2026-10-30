import { type ApiResponse, api } from '@/lib/api/client';
import { orpc } from '@/lib/orpc/client';
import type {
  AppNotification,
  CreateInfaqOrderInput,
  CreateInfaqOrderResult,
  CreateQurbanOrderInput,
  CreateQurbanOrderResult,
  CreateWaqfOrderInput,
  CreateWaqfOrderResult,
  CreateZakatOrderInput,
  CreateZakatOrderResult,
  DonorProfile,
  InfaqDonor,
  InfaqOrderStatusResult,
  LembagaProfile,
  LiveGoldPrice,
  PublicStats,
  QurbanBatch,
  QurbanBatchDetail,
  QurbanOrderStatusResult,
  TransactionDetail,
  TransactionListItem,
  WaqfDonor,
  WaqfOrderStatusResult,
  WaqfProgram,
  WilayahOption,
  ZakatCalculatorInput,
  ZakatCalculatorResult,
  ZakatOrderStatusResult,
} from './types';

/**
 * Public donor-facing data layer (Putaran 17 — proxy cleanup batch).
 *
 * The wakaf/zakat/qurban/infaq oRPC procedures were built and tested back
 * in Batch 3 (`router.waqf.*`, `router.zakat.*`, `router.qurban.*`,
 * `router.infaq.*`) but this file was never repointed at them — it kept
 * calling `fetch('/api/wakaf/...')` etc. against a dev proxy target
 * (`:3001`) that stopped existing once `apps/server` was decommissioned in
 * Batch 6. Every function below keeps its exact name/return shape so the
 * eleven consumer components need zero changes.
 *
 * `getNotifications`/`markNotificationRead`/`getEducationContents`/
 * `getNewsFeed`/`getGamificationProfile`/`sendAskAiMessage`/
 * `getMyTransactions`/`getTransaction` are left untouched (still REST): none
 * of them ever had a real backend, in `apps/server` or otherwise — they
 * were either honest Tier C 501 stubs or phantom calls with no route at
 * all. That's a pre-existing gap, not something the proxy removal breaks.
 */

interface Envelope<T> {
  data: T;
  message?: string;
}

interface ErrorEnvelope {
  error?: string;
}

export class AmwalApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AmwalApiError';
    this.status = status;
  }
}

function unwrap<T>(response: ApiResponse<Envelope<T> & ErrorEnvelope>): T {
  if (!response.ok) {
    throw new AmwalApiError(
      response.error || 'Terjadi kesalahan pada server.',
      response.status
    );
  }

  if (response.data && 'error' in response.data && response.data.error) {
    throw new AmwalApiError(response.data.error, response.status);
  }

  return response.data.data;
}

export async function getActiveWaqfPrograms(): Promise<WaqfProgram[]> {
  const result = await orpc.waqf.list({ active: true });
  return result.data as WaqfProgram[];
}

export async function getWaqfProgram(programId: string): Promise<WaqfProgram> {
  const result = await orpc.waqf.detail({ id: programId });
  if (!result.data) {
    throw new AmwalApiError('Program wakaf tidak ditemukan', 404);
  }
  return result.data as WaqfProgram;
}

export async function getLembagaProfile(id: string): Promise<LembagaProfile> {
  const result = await orpc.waqf.lembaga({ id });
  return result.data as LembagaProfile;
}

export async function getPublicStats(): Promise<PublicStats> {
  const result = await orpc.stats.public();
  return result.data;
}

export async function getInfaqDonors(): Promise<InfaqDonor[]> {
  const result = await orpc.infaq.donatur();
  return result.data as InfaqDonor[];
}

export async function getWaqfDonors(programId: string): Promise<WaqfDonor[]> {
  const result = await orpc.waqf.donatur({ id: programId });
  return result.data as WaqfDonor[];
}

export async function getWaqfOrderStatus(
  orderId: string
): Promise<WaqfOrderStatusResult> {
  const result = await orpc.waqf.orderStatus({ orderId });
  return result.data as unknown as WaqfOrderStatusResult;
}

export async function createWaqfOrder(
  input: CreateWaqfOrderInput
): Promise<CreateWaqfOrderResult> {
  return await orpc.waqf.createOrder(input);
}

/**
 * Pre-fills the authenticated-donor branch of `WaqfDonateForm` — name/email
 * read-only, WhatsApp asked for only when `phone` comes back null.
 */
export async function getMyDonorProfile(): Promise<DonorProfile> {
  const result = await orpc.auth.me();
  return { ...result.user, phone: result.phone };
}

/**
 * Katalog wilayah Kepmendagri (~91k baris) — cascading fetch per jenjang,
 * bukan sekali unduh seluruh tabel (lihat `router/wilayah.ts`).
 */
export async function getProvinces(): Promise<WilayahOption[]> {
  const result = await orpc.wilayah.getProvinces();
  return result.data;
}

export async function getRegencies(
  provinceCode: string
): Promise<WilayahOption[]> {
  const result = await orpc.wilayah.getRegencies({ provinceCode });
  return result.data;
}

export async function getDistricts(
  regencyCode: string
): Promise<WilayahOption[]> {
  const result = await orpc.wilayah.getDistricts({ regencyCode });
  return result.data;
}

export async function getVillages(
  districtCode: string
): Promise<WilayahOption[]> {
  const result = await orpc.wilayah.getVillages({ districtCode });
  return result.data;
}

export async function getLiveGoldPrice(): Promise<LiveGoldPrice> {
  const result = await orpc.zakat.goldPriceLive();
  return result.data;
}

export async function getQurbanBatches(
  params: { jenisHewan?: 'SAPI' | 'KAMBING'; status?: string } = {}
): Promise<QurbanBatch[]> {
  const result = await orpc.qurban.list({
    jenisHewan: params.jenisHewan,
    status:
      params.status === 'TERSEDIA' ||
      params.status === 'PENUH' ||
      params.status === 'SELESAI'
        ? params.status
        : undefined,
  });
  return result.data as QurbanBatch[];
}

export async function getQurbanBatchDetail(
  batchId: string
): Promise<QurbanBatchDetail> {
  const result = await orpc.qurban.detail({ batchId });
  return result.data as unknown as QurbanBatchDetail;
}

export async function createQurbanOrder(
  input: CreateQurbanOrderInput
): Promise<CreateQurbanOrderResult> {
  return await orpc.qurban.createOrder(input);
}

export async function getQurbanOrderStatus(
  orderId: string
): Promise<QurbanOrderStatusResult> {
  const result = await orpc.qurban.orderStatus({ orderId });
  return result.data as unknown as QurbanOrderStatusResult;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const result = await orpc.notifications.list({});
  return result.data as AppNotification[];
}

export async function getNotification(id: string): Promise<AppNotification> {
  const result = await orpc.notifications.byId({ id });
  return result.data as AppNotification;
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await orpc.notifications.markRead({ id: notificationId });
}

export async function markAllNotificationsRead(): Promise<void> {
  await orpc.notifications.markAllRead({});
}

export async function createInfaqOrder(
  input: CreateInfaqOrderInput
): Promise<CreateInfaqOrderResult> {
  const result = await orpc.infaq.createOrder(input);
  return result.data;
}

export async function getInfaqOrderStatus(
  orderId: string
): Promise<InfaqOrderStatusResult> {
  const result = await orpc.infaq.orderStatus({ orderId });
  return result.data as unknown as InfaqOrderStatusResult;
}

export async function getEducationContents(): Promise<unknown> {
  const response = await api.request<Envelope<unknown> & ErrorEnvelope>(
    '/api/education/contents'
  );
  return unwrap(response);
}

export async function getNewsFeed(): Promise<unknown> {
  const response = await api.request<Envelope<unknown> & ErrorEnvelope>(
    '/api/news'
  );
  return unwrap(response);
}

export async function getGamificationProfile(): Promise<unknown> {
  const response = await api.request<Envelope<unknown> & ErrorEnvelope>(
    '/api/gamification/me'
  );
  return unwrap(response);
}

export async function sendAskAiMessage(_message: string): Promise<unknown> {
  const response = await api.request<Envelope<unknown> & ErrorEnvelope>(
    '/api/ask-ai/messages',
    { method: 'POST', body: { message: _message } }
  );
  return unwrap(response);
}

export async function calculateZakat(
  input: ZakatCalculatorInput
): Promise<ZakatCalculatorResult> {
  const result = await orpc.zakat.calculate(input);
  return result.data as ZakatCalculatorResult;
}

export async function getZakatOrderStatus(
  orderId: string
): Promise<ZakatOrderStatusResult> {
  const result = await orpc.zakat.orderStatus({ orderId });
  return result.data as unknown as ZakatOrderStatusResult;
}

export async function createZakatOrder(
  input: CreateZakatOrderInput
): Promise<CreateZakatOrderResult> {
  return await orpc.zakat.createOrder(input);
}

/**
 * Donor payment history. These were the last two call sites still pointing at
 * a REST path that never had a backend at all — `/api/transactions` was never
 * implemented in `apps/server` or anywhere else, so the history screen had
 * never worked. Now served by `router/transactions.ts`; the return shapes are
 * unchanged, so `components/history/*` needed no edits.
 */
export async function getMyTransactions(): Promise<TransactionListItem[]> {
  const result = await orpc.transactions.list({});
  return result.data as TransactionListItem[];
}

export async function getTransaction(
  transactionId: string
): Promise<TransactionDetail> {
  const result = await orpc.transactions.detail({ transactionId });
  return result.data as TransactionDetail;
}

export async function downloadCertificate(
  transactionId: string
): Promise<Blob> {
  const response = await fetch(
    `/api/certificates/${encodeURIComponent(transactionId)}`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    let message = 'Sertifikat belum tersedia.';
    try {
      const body = (await response.json()) as ErrorEnvelope;
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new AmwalApiError(message, response.status);
  }

  return response.blob();
}

export * from './user';

export type LatestNewsItem = Awaited<
  ReturnType<typeof orpc.content.getLatestNews>
>['data'][number];

/** Most recent published news (`content.getLatestNews`), newest first. */
export async function getLatestNews(limit = 5): Promise<LatestNewsItem[]> {
  const result = await orpc.content.getLatestNews({ limit });
  return result.data;
}

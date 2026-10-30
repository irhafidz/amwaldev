import { eq } from 'drizzle-orm';
import {
  infaqOrders,
  qurbanOrders,
  waqfOrders,
  waqfPrograms,
  zakatOrders,
} from '../db/schema';
import type { Database } from '../db/types';
import type { PaymentModule } from '../payment/order-id';
import { normalizeIndonesianPhone } from './phone';
import { type SendWhatsAppDeps, sendWhatsAppNotification } from './service';
import {
  infaqThankYouMessage,
  qurbanThankYouMessage,
  waqfThankYouMessage,
  zakatThankYouMessage,
} from './templates';

/**
 * Ported from `apps/server/src/lib/whatsapp/notify.ts` (Putaran 17, Batch
 * 6) — same per-module lookups and message building, `database` and the
 * Baileys connection details are now required parameters instead of
 * module-level singletons (Batch 1's rule: a shared package cannot assume
 * any one app's `db`/env).
 */

const APP_URL = 'https://amwal.its.ac.id';

async function notifyWaqf(
  database: Database,
  orderId: string,
  nominal: number,
  deps: SendWhatsAppDeps
): Promise<void> {
  const [order] = await database
    .select({
      noTelepon: waqfOrders.noTelepon,
      namaWakif: waqfOrders.namaWakif,
      isAnonymous: waqfOrders.isAnonymous,
      waqfProgramId: waqfOrders.waqfProgramId,
    })
    .from(waqfOrders)
    .where(eq(waqfOrders.id, orderId));

  if (!order?.noTelepon) {
    return;
  }

  const [program] = await database
    .select({ judul: waqfPrograms.judul })
    .from(waqfPrograms)
    .where(eq(waqfPrograms.id, order.waqfProgramId));

  await sendWhatsAppNotification(
    order.noTelepon,
    waqfThankYouMessage({
      namaOrIsAnonymous: order.isAnonymous ? 'Hamba Allah' : order.namaWakif,
      judulProgram: program?.judul || 'Program Wakaf',
      nominal,
      orderId,
      certificateUrl: `${APP_URL}/wakaf/transaksi/${orderId}/sertifikat`,
    }),
    deps
  );
}

async function notifyZakat(
  database: Database,
  orderId: string,
  nominal: number,
  deps: SendWhatsAppDeps
): Promise<void> {
  const [order] = await database
    .select({
      noTelepon: zakatOrders.noTelepon,
      namaMuzakki: zakatOrders.namaMuzakki,
      isAnonymous: zakatOrders.isAnonymous,
      jenisZakat: zakatOrders.jenisZakat,
    })
    .from(zakatOrders)
    .where(eq(zakatOrders.id, orderId));

  if (!order?.noTelepon) {
    return;
  }

  await sendWhatsAppNotification(
    order.noTelepon,
    zakatThankYouMessage({
      namaOrIsAnonymous: order.isAnonymous ? 'Hamba Allah' : order.namaMuzakki,
      jenisZakat: order.jenisZakat,
      nominal,
      orderId,
      certificateUrl: `${APP_URL}/zakat/transaksi/${orderId}/sertifikat`,
    }),
    deps
  );
}

async function notifyInfaq(
  database: Database,
  orderId: string,
  nominal: number,
  deps: SendWhatsAppDeps
): Promise<void> {
  const [order] = await database
    .select({
      teleponPenginfaq: infaqOrders.teleponPenginfaq,
      namaPenginfaq: infaqOrders.namaPenginfaq,
      jenis: infaqOrders.jenis,
    })
    .from(infaqOrders)
    .where(eq(infaqOrders.orderId, orderId));

  if (!order?.teleponPenginfaq) {
    return;
  }

  await sendWhatsAppNotification(
    order.teleponPenginfaq,
    infaqThankYouMessage({
      namaOrIsAnonymous: order.namaPenginfaq || 'Hamba Allah',
      jenis: order.jenis || 'Infaq',
      nominal,
      orderId,
      receiptUrl: `${APP_URL}/infaq/transaksi/${orderId}/kuitansi`,
    }),
    deps
  );
}

async function notifyQurban(
  database: Database,
  orderId: string,
  nominal: number,
  deps: SendWhatsAppDeps
): Promise<void> {
  const [order] = await database
    .select({
      teleponPengqurban: qurbanOrders.teleponPengqurban,
      namaPengqurban: qurbanOrders.namaPengqurban,
      jenisHewan: qurbanOrders.jenisHewan,
      tipeKepemilikan: qurbanOrders.tipeKepemilikan,
      statusPembayaran: qurbanOrders.statusPembayaran,
      sisaTagihan: qurbanOrders.sisaTagihan,
    })
    .from(qurbanOrders)
    .where(eq(qurbanOrders.id, orderId));

  const target = order?.teleponPengqurban
    ? normalizeIndonesianPhone(order.teleponPengqurban)
    : null;
  if (!target) {
    return;
  }

  await sendWhatsAppNotification(
    target,
    qurbanThankYouMessage({
      namaOrIsAnonymous: order.namaPengqurban || 'Hamba Allah',
      jenisHewan: order.jenisHewan,
      tipeKepemilikan: order.tipeKepemilikan,
      statusPembayaran: order.statusPembayaran,
      nominal,
      sisaTagihan: Number(order.sisaTagihan ?? 0),
      orderId,
      certificateUrl: `${APP_URL}/qurban/transaksi/${orderId}/sertifikat`,
    }),
    deps
  );
}

/**
 * Builds and dispatches the settlement notification for a settled order.
 * Best-effort: any failure is swallowed so it can never affect the webhook
 * response or the ledger.
 */
export async function notifySettlement(
  database: Database,
  module: PaymentModule,
  orderId: string,
  amount: string,
  deps: SendWhatsAppDeps
): Promise<void> {
  const nominal = Number(amount);

  switch (module) {
    case 'WAQF':
      await notifyWaqf(database, orderId, nominal, deps);
      return;
    case 'ZAKAT':
      await notifyZakat(database, orderId, nominal, deps);
      return;
    case 'INFAQ':
      await notifyInfaq(database, orderId, nominal, deps);
      return;
    case 'QURBAN':
      await notifyQurban(database, orderId, nominal, deps);
      return;
    default:
      return;
  }
}

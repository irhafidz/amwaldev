import { and, eq, inArray, sql } from 'drizzle-orm';
import { hewanBatches, qurbanAnimalSlots } from '../db/schema';
import type { Database } from '../db/types';

type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export class SlotUnavailableError extends Error {
  constructor() {
    super('Slot tidak mencukupi atau sudah dipesan orang lain');
    this.name = 'SlotUnavailableError';
  }
}

export interface ReservedSlot {
  id: string;
  nomorSlot: number;
}

/**
 * Reserves the requested number of available slots for a qurban order.
 *
 * The row lock (`FOR UPDATE`) and the unique constraint
 * `(hewan_batch_id, nomor_slot)` are BOTH required — either one alone still
 * oversells. Ported from the legacy `lib/qurban.ts`, which passed the audit.
 */
export async function reserveSlots(
  tx: DatabaseTransaction,
  hewanBatchId: string,
  jumlahSlotDiminta: number,
  qurbanOrderId: string
): Promise<ReservedSlot[]> {
  const rows = (await tx.execute(sql`
    SELECT id, nomor_slot
    FROM qurban_animal_slots
    WHERE hewan_batch_id = ${hewanBatchId} AND status = 'TERSEDIA'
    ORDER BY nomor_slot ASC
    LIMIT ${jumlahSlotDiminta}
    FOR UPDATE
  `)) as Array<{ id: string; nomor_slot: number }>;

  const slots: ReservedSlot[] = rows.map((row) => ({
    id: String(row.id),
    nomorSlot: Number(row.nomor_slot),
  }));

  if (slots.length < jumlahSlotDiminta) {
    throw new SlotUnavailableError();
  }

  const slotIds = slots.map((slot) => slot.id);

  await tx
    .update(qurbanAnimalSlots)
    .set({ status: 'TERISI', qurbanOrderId })
    .where(inArray(qurbanAnimalSlots.id, slotIds));

  const [remaining] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(qurbanAnimalSlots)
    .where(
      and(
        eq(qurbanAnimalSlots.hewanBatchId, hewanBatchId),
        eq(qurbanAnimalSlots.status, 'TERSEDIA')
      )
    );

  if (Number(remaining?.count ?? 0) === 0) {
    await tx
      .update(hewanBatches)
      .set({ status: 'PENUH' })
      .where(eq(hewanBatches.id, hewanBatchId));
  }

  return slots;
}

/**
 * Jeda setelah batas bayar sebelum slot pesanan yang belum dibayar dilepas.
 * Menutup balapan "dibayar tepat di batas": penyedia pembayaran tidak lagi
 * menerima pembayaran setelah kedaluwarsa, jadi setelah jeda ini pesanan
 * PENDING pasti tidak akan lunas.
 */
export const SLOT_HOLD_GRACE_MINUTES = 60;

/** Batas bayar bila transaksi tidak menyimpan `payment_expires_at` (sebelum migrasi 0019). */
const FALLBACK_HOLD_HOURS = 24;

/**
 * Melepas slot yang tertahan pesanan yang tidak akan pernah dibayar: transaksi
 * GAGAL, atau PENDING yang batas bayarnya (+ jeda) sudah lewat. Tanpa ini slot
 * `TERISI` tertahan selamanya — dan sejak checkout tamu dibuka (QA-04), siapa
 * pun bisa menahan seluruh stok hewan tanpa membayar.
 *
 * Satu pernyataan atomik: kondisi dievaluasi ulang pada baris yang sama dengan
 * yang diubah, jadi pesanan yang lunas di tengah proses tidak pernah terlepas.
 * Batch yang `PENUH` hanya karena slot-slot itu dibuka kembali; batch yang
 * ditutup admin (tanpa slot terlepas) tidak disentuh.
 *
 * @returns jumlah slot yang dilepas
 */
export async function releaseExpiredSlotHolds(
  database: Database | DatabaseTransaction,
  now: Date = new Date()
): Promise<number> {
  const nowUtc = sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const rows = (await database.execute(sql`
    WITH stale AS (
      SELECT qo.id
      FROM qurban_orders qo
      JOIN transactions t ON t.id = qo.transaction_id
      WHERE t.status_pembayaran = 'GAGAL'
         OR (
           t.status_pembayaran = 'PENDING'
           AND COALESCE(
                 t.payment_expires_at,
                 t.created_at + make_interval(hours => ${FALLBACK_HOLD_HOURS})
               ) + make_interval(mins => ${SLOT_HOLD_GRACE_MINUTES}) < ${nowUtc}
         )
    ),
    freed AS (
      UPDATE qurban_animal_slots s
      SET status = 'TERSEDIA', qurban_order_id = NULL
      WHERE s.status = 'TERISI'
        AND s.qurban_order_id IN (SELECT id FROM stale)
      RETURNING s.hewan_batch_id
    ),
    reopened AS (
      UPDATE hewan_batches b
      SET status = 'TERSEDIA'
      WHERE b.status = 'PENUH'
        AND b.id IN (SELECT hewan_batch_id FROM freed)
      RETURNING b.id
    )
    SELECT count(*)::int AS freed FROM freed
  `)) as Array<{ freed: number }>;
  return Number(rows[0]?.freed ?? 0);
}

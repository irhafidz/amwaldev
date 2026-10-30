import { sql } from 'drizzle-orm';
import { orderSequences } from '../db/schema';
import type { Database } from '../db/types';
import { wibParts } from '../time/wib';
import {
  formatOrderId,
  formatProgramCode,
  MODULE_TO_CODE,
  type OrderIdModule,
  SUB_PROGRAM_CODES,
} from './order-id';

/**
 * Alokasi nomor urut order 12 digit [I-1].
 *
 * `formatOrderId()` hanya memformat string. Keunikan di bawah konkurensi
 * tidak bisa dijamin TypeScript: dua permintaan yang membaca nomor terakhir
 * lalu menambah satu akan menghasilkan nomor yang sama. Karena itu kenaikan
 * dilakukan satu pernyataan atomik di database — `INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING` mengunci baris cakupan, menaikkan, dan mengembalikan
 * nilai baru tanpa celah baca-lalu-tulis.
 *
 * Batas 9999 ditegakkan CHECK pada tabel, bukan oleh pemeriksaan di sini.
 * Pemeriksaan aplikasi bisa dilewati jalur kode lain; constraint tidak bisa.
 */

type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

const SEQUENCE_RANGE_CONSTRAINT = 'order_sequences_current_sequence_range';

export interface OrderScopeParams {
  module: OrderIdModule;
  subProgram?: string;
  at: Date;
}

/**
 * Kunci cakupan penomoran: `<kode modul>-<YY><MM>-<sub-program>`,
 * mis. `80-2609-00`. Bulan dan tahun diambil dalam WIB supaya nomor urut
 * berganti tepat tengah malam waktu Indonesia, bukan pukul 07:00 WIB
 * mengikuti UTC.
 */
export function orderScopeKey(params: OrderScopeParams): string {
  const time = wibParts(params.at);
  const month = String(time.month).padStart(2, '0');
  const year = String(time.year).slice(-2);
  const subProgram = (
    params.subProgram ??
    SUB_PROGRAM_CODES[params.module] ??
    '00'
  ).padStart(2, '0');

  return `${MODULE_TO_CODE[params.module]}-${year}${month}-${subProgram}`;
}

function isSequenceExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(SEQUENCE_RANGE_CONSTRAINT);
}

/**
 * Mengambil nomor urut berikutnya untuk satu cakupan, atomik.
 *
 * WAJIB dipanggil di dalam transaksi anchor yang sama dengan penyisipan
 * order. Kalau anchor gagal setelah nomor diambil, transaksi yang sama harus
 * membatalkannya — kalau tidak, nomor itu hangus dan deret berlubang.
 *
 * Melempar `ORDER_SEQUENCE_EXHAUSTED` ketika cakupan melewati 9999, memakai
 * kosakata galat yang sama dengan `formatOrderId()` supaya pemanggil tidak
 * perlu tahu apakah batas itu ditegakkan aplikasi atau database.
 */
export async function nextOrderSequence(
  tx: DatabaseTransaction,
  params: OrderScopeParams
): Promise<number> {
  const scopeKey = orderScopeKey(params);

  try {
    const [row] = await tx
      .insert(orderSequences)
      .values({ scopeKey, currentSequence: 1 })
      .onConflictDoUpdate({
        target: orderSequences.scopeKey,
        set: {
          currentSequence: sql`${orderSequences.currentSequence} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning({ currentSequence: orderSequences.currentSequence });

    if (!row) {
      throw new Error('ORDER_SEQUENCE_UNAVAILABLE');
    }

    return row.currentSequence;
  } catch (error) {
    if (isSequenceExhausted(error)) {
      throw new Error('ORDER_SEQUENCE_EXHAUSTED');
    }
    throw error;
  }
}

/**
 * Gabungan alokasi nomor dan pemformatan — bentuk yang sebaiknya dipakai
 * pemanggil, supaya nomor urut dan nomor order tidak pernah dirakit dari
 * dua sumber waktu yang berbeda.
 */
export async function nextOrderId(
  tx: DatabaseTransaction,
  params: OrderScopeParams
): Promise<string> {
  const seq = await nextOrderSequence(tx, params);

  return formatOrderId({
    module: params.module,
    subProgram: params.subProgram,
    at: params.at,
    seq,
  });
}

/**
 * Cakupan penomoran kode program terpisah dari order pembayaran ('PG', bukan
 * '00') — modul+bulan+tahun yang sama tidak boleh berbagi counter dengan
 * transaksi, walau keduanya memakai tabel `order_sequences` yang sama.
 */
const PROGRAM_CODE_SUB_SCOPE = 'PG';

export async function nextProgramCode(
  tx: DatabaseTransaction,
  params: { module: OrderIdModule; at: Date }
): Promise<string> {
  const seq = await nextOrderSequence(tx, {
    module: params.module,
    subProgram: PROGRAM_CODE_SUB_SCOPE,
    at: params.at,
  });

  return formatProgramCode({ module: params.module, at: params.at, seq });
}

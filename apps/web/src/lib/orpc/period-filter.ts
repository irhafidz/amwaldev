import { parseAnalyticsPeriod } from '@amwal/core/analytics/period';
import { ORPCError } from '@orpc/server';
import { gte, lt, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/**
 * Filter periode WIB untuk daftar admin [I-8].
 *
 * Rentangnya setengah terbuka `[awal, akhir)`: `parseAnalyticsPeriod`
 * mengembalikan detik terakhir periode (23:59:59 WIB), jadi batas atas
 * digeser satu detik. Memakai `<= 23:59:59` akan membuang transaksi pada
 * 23:59:59.500 — kolom `created_at` menyimpan milidetik (`timestamp(3)`).
 *
 * Kondisi dibangun sebagai SQL, bukan difilter di JavaScript setelah semua
 * baris ditarik, supaya index waktu `S-3` terpakai begitu dijalankan. Kolom
 * dibandingkan langsung — tanpa `DATE()` atau `EXTRACT()` di sisi kiri, yang
 * membuat index tidak bisa dipakai.
 */

export const yearField = z
  .number()
  .int('Tahun harus bilangan bulat')
  .optional();

export const monthField = z
  .number()
  .int('Bulan harus bilangan bulat')
  .min(1, 'Bulan minimal 1')
  .max(12, 'Bulan maksimal 12')
  .optional();

export interface PeriodFilter {
  year?: number;
  month?: number;
}

export function createdAtWithin(
  column: AnyPgColumn,
  filter: PeriodFilter
): SQL[] {
  if (filter.year === undefined) {
    // Bulan tanpa tahun ambigu (September tahun berapa?), jadi ditolak
    // alih-alih diam-diam diabaikan dan mengembalikan semua data.
    if (filter.month !== undefined) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Filter bulan harus disertai tahun',
      });
    }
    return [];
  }

  let period: ReturnType<typeof parseAnalyticsPeriod>;
  try {
    period = parseAnalyticsPeriod({ year: filter.year, month: filter.month });
  } catch (error) {
    throw new ORPCError('BAD_REQUEST', {
      message: error instanceof Error ? error.message : 'INVALID_PERIOD',
    });
  }

  const start = period.startDate.toISOString();
  const endExclusive = new Date(period.endDate.getTime() + 1000).toISOString();

  return [gte(column, start), lt(column, endExclusive)];
}

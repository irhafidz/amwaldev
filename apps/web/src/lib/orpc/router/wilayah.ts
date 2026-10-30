import { and, asc, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { wilayah } from '@/lib/db/schema';
import { publicProcedure } from '../procedures';

/**
 * Katalog wilayah Kepmendagri (~91k baris, `db/seeds/wilayah.sql`). Setiap
 * jenjang cukup difilter lewat panjang `kode` + awalan, jadi tidak perlu
 * kolom `level`/`parent_id` terpisah:
 *   provinsi "11" (2) -> kab/kota "11.01" (5) -> kecamatan "11.01.01" (8)
 *   -> kelurahan "11.01.01.2001" (13).
 * Publik & tanpa auth — data referensi geografis, bukan data donor.
 */

const wilayahColumns = { kode: wilayah.kode, nama: wilayah.nama };

const getProvinces = publicProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select(wilayahColumns)
    .from(wilayah)
    .where(sql`length(${wilayah.kode}) = 2`)
    .orderBy(asc(wilayah.nama));
  return { data: rows };
});

const getRegencies = publicProcedure
  .input(z.object({ provinceCode: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(wilayahColumns)
      .from(wilayah)
      .where(
        and(
          like(wilayah.kode, `${input.provinceCode}.%`),
          sql`length(${wilayah.kode}) = 5`
        )
      )
      .orderBy(asc(wilayah.nama));
    return { data: rows };
  });

const getDistricts = publicProcedure
  .input(z.object({ regencyCode: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(wilayahColumns)
      .from(wilayah)
      .where(
        and(
          like(wilayah.kode, `${input.regencyCode}.%`),
          sql`length(${wilayah.kode}) = 8`
        )
      )
      .orderBy(asc(wilayah.nama));
    return { data: rows };
  });

const getVillages = publicProcedure
  .input(z.object({ districtCode: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(wilayahColumns)
      .from(wilayah)
      .where(
        and(
          like(wilayah.kode, `${input.districtCode}.%`),
          sql`length(${wilayah.kode}) = 13`
        )
      )
      .orderBy(asc(wilayah.nama));
    return { data: rows };
  });

export const wilayahRouter = {
  getProvinces,
  getRegencies,
  getDistricts,
  getVillages,
};

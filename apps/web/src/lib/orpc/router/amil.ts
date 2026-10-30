import { rbacMatrix } from '@amwal/core/auth/rbac.matrix';
import {
  distributionReportSchema,
  offlineZakatSchema,
  setoranSchema,
} from '@amwal/core/contracts/amil';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '@/lib/db';
import {
  jenisZakatMaster,
  petugasLapanganProfiles,
  qurbanDistributionReports,
  setoranPetugasLapangan,
  zakatOrders,
} from '@/lib/db/schema';
import { anyRoleProcedure } from '../procedures';
import { assertJenisActive, syncCodes } from './admin/master-data';

/**
 * oRPC amil router (Putaran 17, Batch 3 + feature replay N-13) — a 1:1 port
 * of `apps/server/src/routes/amil.ts`. Offline collection is performed by
 * ADMIN or PETUGAS_LAPANGAN — there is no separate AMIL role (AI_RULES §4).
 */

const guarded = anyRoleProcedure(rbacMatrix.amil);

async function resolvePetugasProfile(
  database: Database,
  userId: string
): Promise<string> {
  const [existing] = await database
    .select({ id: petugasLapanganProfiles.id })
    .from(petugasLapanganProfiles)
    .where(eq(petugasLapanganProfiles.userId, userId));

  if (existing) {
    return existing.id;
  }

  const id = `PP-${ulid()}`;
  await database.insert(petugasLapanganProfiles).values({ id, userId });
  return id;
}

const offlineZakat = guarded
  .input(offlineZakatSchema)
  .handler(async ({ input, context }) => {
    const amil = context.user;
    if (!amil) {
      throw new ORPCError('UNAUTHORIZED');
    }

    await assertJenisActive(context.db, 'JENIS_ZAKAT', input.jenisZakat);
    const [row] = await context.db
      .insert(zakatOrders)
      .values({
        id: `ZOF-${ulid()}`,
        nomorKwitansi: `AMIL-${ulid().slice(-10).toUpperCase()}`,
        namaMuzakki: input.isAnonymous ? 'Hamba Allah' : input.namaMuzakki,
        noTelepon: input.noTelepon ?? null,
        alamat: input.alamat ?? null,
        isAnonymous: input.isAnonymous,
        jenisZakat: input.jenisZakat,
        metodePembayaran: input.metodePembayaran,
        nominal: input.nominal === undefined ? null : String(input.nominal),
        beratBerasKg:
          input.beratBerasKg === undefined ? null : String(input.beratBerasKg),
        jumlahJiwa: input.jumlahJiwa ?? null,
        status: 'TERVERIFIKASI',
        notes: input.notes ?? null,
        enteredByAmilId: amil.userId,
        transactionId: null,
      })
      .returning();

    return { success: true, data: row };
  });

const setoran = guarded
  .input(setoranSchema)
  .handler(async ({ input, context }) => {
    const amil = context.user;
    if (!amil) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const petugasId = await resolvePetugasProfile(context.db, amil.userId);
    const [row] = await context.db
      .insert(setoranPetugasLapangan)
      .values({
        id: `STR-${ulid()}`,
        petugasId,
        tanggal: input.tanggal,
        jumlahSetor: String(input.jumlahSetor),
        keterangan: input.keterangan ?? null,
      })
      .returning();

    return { data: row };
  });

const rekapCash = guarded.handler(async ({ context }) => {
  const amil = context.user;
  if (!amil) {
    throw new ORPCError('UNAUTHORIZED');
  }

  const petugasId = await resolvePetugasProfile(context.db, amil.userId);

  const [received] = await context.db
    .select({
      total: sql<number>`coalesce(sum(${zakatOrders.nominal}), 0)`,
    })
    .from(zakatOrders)
    .where(
      and(
        eq(zakatOrders.enteredByAmilId, amil.userId),
        eq(zakatOrders.metodePembayaran, 'TUNAI')
      )
    );

  const [deposited] = await context.db
    .select({
      total: sql<number>`coalesce(sum(${setoranPetugasLapangan.jumlahSetor}), 0)`,
    })
    .from(setoranPetugasLapangan)
    .where(
      and(
        eq(setoranPetugasLapangan.petugasId, petugasId),
        sql`${setoranPetugasLapangan.verifiedAt} IS NOT NULL`
      )
    );

  const totalDiterima = Number(received?.total ?? 0);
  const totalDisetorTerverifikasi = Number(deposited?.total ?? 0);

  return {
    data: {
      totalDiterima,
      totalDisetorTerverifikasi,
      saldoTunai: totalDiterima - totalDisetorTerverifikasi,
    },
  };
});

const distributionReport = guarded
  .input(distributionReportSchema)
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .insert(qurbanDistributionReports)
      .values({
        id: `QDR-${ulid()}`,
        qurbanOrderId: input.qurbanOrderId,
        lokasiLat: String(input.lokasiLat),
        lokasiLng: String(input.lokasiLng),
        jumlahPenerima: input.jumlahPenerima,
        buktiFotoUrl: input.buktiFotoUrl ?? null,
        lokasiPenyaluran: input.lokasiPenyaluran ?? null,
      })
      .returning();

    return { data: row };
  });

/** Pilihan jenis zakat aktif dari Master Data untuk form zakat offline. */
const jenisZakatOptions = guarded.handler(async ({ context }) => {
  await syncCodes(context.db, 'JENIS_ZAKAT');
  const rows = await context.db
    .select({
      kode: jenisZakatMaster.kode,
      label: jenisZakatMaster.label,
    })
    .from(jenisZakatMaster)
    .where(eq(jenisZakatMaster.isActive, true))
    .orderBy(asc(jenisZakatMaster.sortOrder), asc(jenisZakatMaster.label));
  return { data: rows };
});

export const amil = {
  offlineZakat,
  setoran,
  rekapCash,
  distributionReport,
  jenisZakatOptions,
};

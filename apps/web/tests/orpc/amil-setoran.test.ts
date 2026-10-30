import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, feature replay N-13 — coverage for `router.amil.setoran`,
 * `router.amil.rekapCash`, and `router.amil.distributionReport` (the three
 * field-officer additions that had no REST-era test in main). Proves the
 * deposit write path, the cash reconciliation arithmetic, and the geolocation
 * columns added by migration 0003 (present in the shared schema).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

async function createPetugas(): Promise<string> {
  const id = `p17n13-${ulid().toLowerCase()}-petugas`;
  await database.insert(schema.users).values({
    id,
    name: 'Petugas Lapangan',
    updatedAt: now(),
  });
  return id;
}

describe('oRPC amil: setoran, rekap-cash, distribution', () => {
  test('PETUGAS_LAPANGAN records a cash setoran', async () => {
    const petugasId = await createPetugas();
    const context = await createTestCaller({
      database,
      user: { userId: petugasId, role: 'PETUGAS_LAPANGAN' },
    });

    let setoranId: string | undefined;

    try {
      const result = await call(
        router.amil.setoran,
        { tanggal: '2026-09-13', jumlahSetor: 250_000, keterangan: 'Harian' },
        { context }
      );
      setoranId = result.data.id;
      expect(setoranId).toBeString();

      const [row] = await database
        .select({ jumlahSetor: schema.setoranPetugasLapangan.jumlahSetor })
        .from(schema.setoranPetugasLapangan)
        .where(eq(schema.setoranPetugasLapangan.id, setoranId));
      expect(Number(row?.jumlahSetor)).toBe(250_000);
    } finally {
      if (setoranId) {
        await database
          .delete(schema.setoranPetugasLapangan)
          .where(eq(schema.setoranPetugasLapangan.id, setoranId));
      }
      await database
        .delete(schema.petugasLapanganProfiles)
        .where(eq(schema.petugasLapanganProfiles.userId, petugasId));
      await database.delete(schema.users).where(eq(schema.users.id, petugasId));
    }
  });

  test('rekapCash = received TUNAI − deposited+verified', async () => {
    const petugasId = await createPetugas();
    const context = await createTestCaller({
      database,
      user: { userId: petugasId, role: 'PETUGAS_LAPANGAN' },
    });

    let setoranId: string | undefined;

    try {
      // Received: offline TUNAI zakat 100000.
      const zakatId = `p17n13-${ulid().toLowerCase()}-zakat`;
      await database.insert(schema.zakatOrders).values({
        id: zakatId,
        nomorKwitansi: `AMIL-${ulid().slice(-10).toUpperCase()}`,
        namaMuzakki: 'Muzakki Rekap',
        isAnonymous: false,
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TUNAI',
        nominal: '100000',
        status: 'TERVERIFIKASI',
        enteredByAmilId: petugasId,
        transactionId: null,
      });

      // Deposit: setoran 30000.
      const setoran = await call(
        router.amil.setoran,
        { tanggal: '2026-09-13', jumlahSetor: 30_000 },
        { context }
      );
      setoranId = setoran.data.id;

      // Verify the deposit.
      await database
        .update(schema.setoranPetugasLapangan)
        .set({ verifiedAt: now() })
        .where(eq(schema.setoranPetugasLapangan.id, setoranId));

      const result = await call(router.amil.rekapCash, undefined, { context });
      expect(result.data.totalDiterima).toBe(100_000);
      expect(result.data.totalDisetorTerverifikasi).toBe(30_000);
      expect(result.data.saldoTunai).toBe(70_000);

      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, zakatId));
    } finally {
      if (setoranId) {
        await database
          .delete(schema.setoranPetugasLapangan)
          .where(eq(schema.setoranPetugasLapangan.id, setoranId));
      }
      await database
        .delete(schema.petugasLapanganProfiles)
        .where(eq(schema.petugasLapanganProfiles.userId, petugasId));
      await database.delete(schema.users).where(eq(schema.users.id, petugasId));
    }
  });

  test('distributionReport stores geolocation columns', async () => {
    const petugasId = await createPetugas();
    const orderId = `p17n13-${ulid().toLowerCase()}-qurban-order`;

    await database.insert(schema.qurbanOrders).values({
      id: orderId,
      namaPengqurban: 'Shohibul Qurban',
      jenisHewan: 'KAMBING',
      tipeKepemilikan: 'INDIVIDU',
      metodePembayaran: 'TRANSFER',
      totalHarga: '2500000',
    });

    const context = await createTestCaller({
      database,
      user: { userId: petugasId, role: 'PETUGAS_LAPANGAN' },
    });

    let reportId: string | undefined;

    try {
      const result = await call(
        router.amil.distributionReport,
        {
          qurbanOrderId: orderId,
          lokasiLat: -7.281_97,
          lokasiLng: 112.794_23,
          jumlahPenerima: 5,
          lokasiPenyaluran: 'Surabaya Timur',
        },
        { context }
      );
      reportId = result.data.id;

      const [row] = await database
        .select({
          lokasiLat: schema.qurbanDistributionReports.lokasiLat,
          lokasiLng: schema.qurbanDistributionReports.lokasiLng,
          jumlahPenerima: schema.qurbanDistributionReports.jumlahPenerima,
        })
        .from(schema.qurbanDistributionReports)
        .where(eq(schema.qurbanDistributionReports.id, reportId));

      expect(Number(row?.lokasiLat)).toBeCloseTo(-7.281_97);
      expect(Number(row?.lokasiLng)).toBeCloseTo(112.794_23);
      expect(row?.jumlahPenerima).toBe(5);
    } finally {
      if (reportId) {
        await database
          .delete(schema.qurbanDistributionReports)
          .where(eq(schema.qurbanDistributionReports.id, reportId));
      }
      await database
        .delete(schema.qurbanOrders)
        .where(eq(schema.qurbanOrders.id, orderId));
      await database.delete(schema.users).where(eq(schema.users.id, petugasId));
    }
  });
});

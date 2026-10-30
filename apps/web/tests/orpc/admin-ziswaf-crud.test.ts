import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import type { ORPCContext } from '../../src/lib/orpc/context';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * CRUD admin Zakat & Infaq: entri zakat manual, konfigurasi fitrah, katalog
 * program infaq, dan donasi infaq manual. Order payment gateway harus tetap
 * terkunci (tidak bisa dihapus / diubah nominalnya) dari panel admin.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const adminId = `ziscrud-${runId}-admin`;
let adminContext: ORPCContext;

// Shared helper — only ever awaited from inside a test() body below.
async function expectRejects(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error('expected call to reject');
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect(error).toBeInstanceOf(ORPCError);
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect((error as ORPCError<string, unknown>).status).toBe(status);
  }
}

beforeAll(async () => {
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin ZIS CRUD',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  adminContext = await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
});

afterAll(async () => {
  await database
    .delete(schema.zakatOrders)
    .where(eq(schema.zakatOrders.enteredByAmilId, adminId));
  await database.delete(schema.users).where(eq(schema.users.id, adminId));
});

describe('oRPC admin.zakat CRUD', () => {
  test('rejects non-ADMIN', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `ziscrud-${runId}-wakif`, role: 'WAKIF' },
    });
    await expectRejects(
      call(
        router.admin.zakat.createOrder,
        {
          namaMuzakki: 'Tidak Boleh',
          jenisZakat: 'FITRAH',
          metodePembayaran: 'TUNAI',
          nominal: 45_000,
        },
        { context: wakifContext }
      ),
      403
    );
  });

  test('create → list → update → delete a manual zakat order', async () => {
    const created = await call(
      router.admin.zakat.createOrder,
      {
        namaMuzakki: 'H. Ahmad Uji',
        noTelepon: '081200000000',
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TUNAI',
        nominal: 1_500_000,
        notes: 'Gaji x 2.5%',
      },
      { context: adminContext }
    );
    expect(created.data.status).toBe('TERVERIFIKASI');
    expect(created.data.nomorKwitansi).toStartWith('BSZ-');
    const id = created.data.id;

    const list = await call(
      router.admin.zakat.ordersList,
      {},
      { context: adminContext }
    );
    expect(list.data.some((r) => r.id === id)).toBe(true);

    const updated = await call(
      router.admin.zakat.updateOrder,
      { id, nominal: 2_000_000, status: 'DITOLAK' },
      { context: adminContext }
    );
    expect(Number(updated.data.nominal)).toBe(2_000_000);
    expect(updated.data.status).toBe('DITOLAK');

    await expectRejects(
      call(
        router.admin.zakat.updateOrder,
        { id, metodePembayaran: 'BERAS' },
        { context: adminContext }
      ),
      400
    );

    await call(
      router.admin.zakat.deleteOrder,
      { id },
      { context: adminContext }
    );
    const [gone] = await database
      .select()
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, id));
    expect(gone).toBeUndefined();
  });

  test('gateway-paid zakat orders are locked', async () => {
    const txId = `ziscrud-${runId}-tx`;
    const orderId = `ziscrud-${runId}-gw`;
    await database.insert(schema.transactions).values({
      id: txId,
      wakifId: adminId,
      jenisTransaksi: 'ZAKAT',
      amount: '100000',
      disbursementDestination: 'ZAKAT',
    });
    await database.insert(schema.zakatOrders).values({
      id: orderId,
      nomorKwitansi: `ziscrud-${runId}-kw`,
      namaMuzakki: 'Muzakki Online',
      jenisZakat: 'FITRAH',
      metodePembayaran: 'TRANSFER',
      nominal: '100000',
      transactionId: txId,
      enteredByAmilId: adminId,
    });
    try {
      await expectRejects(
        call(
          router.admin.zakat.deleteOrder,
          { id: orderId },
          { context: adminContext }
        ),
        400
      );
      await expectRejects(
        call(
          router.admin.zakat.updateOrder,
          { id: orderId, nominal: 1 },
          { context: adminContext }
        ),
        400
      );
      const verified = await call(
        router.admin.zakat.updateOrder,
        { id: orderId, status: 'TERVERIFIKASI' },
        { context: adminContext }
      );
      expect(verified.data.status).toBe('TERVERIFIKASI');
    } finally {
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, txId));
    }
  });

  test('saveFitrahConfig deactivates the previous config of the same rice', async () => {
    const jenisBeras = `Beras Uji ${runId}`;
    const first = await call(
      router.admin.zakat.saveFitrahConfig,
      { jenisBeras, konversiHargaPerJiwa: 45_000 },
      { context: adminContext }
    );
    const second = await call(
      router.admin.zakat.saveFitrahConfig,
      { jenisBeras, konversiHargaPerJiwa: 50_000, tahunBerlaku: '1447 H' },
      { context: adminContext }
    );
    try {
      const list = await call(
        router.admin.zakat.fitrahConfigList,
        {},
        { context: adminContext }
      );
      const mine = list.data.filter((r) => r.jenisBeras === jenisBeras);
      expect(mine.find((r) => r.id === first.data.id)?.isActive).toBe(false);
      expect(mine.find((r) => r.id === second.data.id)?.isActive).toBe(true);
    } finally {
      await database
        .delete(schema.zakatFitrahConfig)
        .where(eq(schema.zakatFitrahConfig.jenisBeras, jenisBeras));
    }
  });

  test('goldPriceLatest returns the most recent history row', async () => {
    const set = await call(
      router.admin.zakat.setGoldPrice,
      { pricePerGram: 1_470_000 },
      { context: adminContext }
    );
    try {
      const latest = await call(
        router.admin.zakat.goldPriceLatest,
        {},
        { context: adminContext }
      );
      expect(latest.data?.id).toBe(set.data.id);
      expect(Number(latest.data?.pricePerGram)).toBe(1_470_000);
    } finally {
      await database
        .delete(schema.zakatGoldPriceHistory)
        .where(eq(schema.zakatGoldPriceHistory.id, set.data.id));
    }
  });
});

describe('oRPC admin.infaq CRUD', () => {
  test('program CRUD with collected total from manual donations', async () => {
    const program = await call(
      router.admin.infaq.createProgram,
      {
        nama: `Program Uji ${runId}`,
        jenis: 'SEDEKAH_YATIM',
        target: 10_000_000,
      },
      { context: adminContext }
    );
    const programId = program.data.id;
    expect(program.data.status).toBe('AKTIF');
    expect(Number(program.data.collected)).toBe(0);

    const donation = await call(
      router.admin.infaq.createOrder,
      {
        namaPenginfaq: 'Hamba Allah',
        nominal: 250_000,
        programId,
        metode: 'Kasir Tunai / Kotak Infaq',
      },
      { context: adminContext }
    );
    const donationId = donation.data.id;
    expect(donation.data.status).toBe('SETTLED');
    expect(donation.data.jenis).toBe('SEDEKAH_YATIM');
    expect(donation.data.isManual).toBe(true);
    expect(donation.data.paymentMethod).toBe('Kasir Tunai / Kotak Infaq');
    expect(donation.data.programNama).toBe(`Program Uji ${runId}`);

    const updatedDonation = await call(
      router.admin.infaq.updateOrder,
      { id: donationId, nominal: 300_000 },
      { context: adminContext }
    );
    expect(Number(updatedDonation.data.nominal)).toBe(300_000);

    const programs = await call(
      router.admin.infaq.programsList,
      {},
      { context: adminContext }
    );
    const listed = programs.data.find((p) => p.id === programId);
    expect(Number(listed?.collected)).toBe(300_000);
    expect(listed?.orderCount).toBe(1);

    const updatedProgram = await call(
      router.admin.infaq.updateProgram,
      { id: programId, target: null, status: 'SELESAI' },
      { context: adminContext }
    );
    expect(updatedProgram.data.target).toBeNull();
    expect(updatedProgram.data.status).toBe('SELESAI');

    // Menghapus program melepas alokasi, donasinya tetap ada.
    await call(
      router.admin.infaq.deleteProgram,
      { id: programId },
      { context: adminContext }
    );
    const [orphan] = await database
      .select()
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.id, donationId));
    expect(orphan?.programId).toBeNull();

    await call(
      router.admin.infaq.deleteOrder,
      { id: donationId },
      { context: adminContext }
    );
    const [gone] = await database
      .select()
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.id, donationId));
    expect(gone).toBeUndefined();
  });

  test('gateway infaq orders cannot be edited or deleted', async () => {
    const id = `ziscrud-${runId}-inf`;
    await database.insert(schema.infaqOrders).values({
      id,
      orderId: `INF-${ulid()}`,
      namaPenginfaq: 'Donatur Online',
      nominal: '50000',
      jenis: 'INFAQ_UMUM',
    });
    try {
      await expectRejects(
        call(router.admin.infaq.deleteOrder, { id }, { context: adminContext }),
        400
      );
      await expectRejects(
        call(
          router.admin.infaq.updateOrder,
          { id, nominal: 1 },
          { context: adminContext }
        ),
        400
      );
    } finally {
      await database
        .delete(schema.infaqOrders)
        .where(eq(schema.infaqOrders.id, id));
    }
  });
});

describe('oRPC admin.masterData — ZISWAF picklists', () => {
  test('list auto-syncs every DB-allowed jenis code', async () => {
    const zakat = await call(
      router.admin.masterData.list,
      { type: 'JENIS_ZAKAT' },
      { context: adminContext }
    );
    expect(zakat.data.map((r) => r.kode).sort()).toEqual(
      [
        'EMAS',
        'FIDYAH',
        'FITRAH',
        'KAFARAT',
        'MAAL_PENGHASILAN',
        'PERTANIAN',
        'PERUSAHAAN',
      ].sort()
    );
    const infaq = await call(
      router.admin.masterData.list,
      { type: 'JENIS_INFAQ' },
      { context: adminContext }
    );
    expect(infaq.data).toHaveLength(5);

    const resync = await call(
      router.admin.masterData.sync,
      { type: 'JENIS_ZAKAT' },
      { context: adminContext }
    );
    expect(resync.added).toBe(0);
  });

  test('coded jenis cannot be created or deleted', async () => {
    await expectRejects(
      call(
        router.admin.masterData.create,
        { type: 'JENIS_INFAQ', label: 'Infaq Baru', sortOrder: 0 },
        { context: adminContext }
      ),
      400
    );
    const infaq = await call(
      router.admin.masterData.list,
      { type: 'JENIS_INFAQ' },
      { context: adminContext }
    );
    const first = infaq.data[0];
    if (!first) {
      throw new Error('expected synced JENIS_INFAQ rows');
    }
    await expectRejects(
      call(
        router.admin.masterData.delete,
        { type: 'JENIS_INFAQ', id: first.id },
        { context: adminContext }
      ),
      400
    );
  });

  test('deactivated jenis zakat is rejected and hidden from petugas options', async () => {
    const list = await call(
      router.admin.masterData.list,
      { type: 'JENIS_ZAKAT' },
      { context: adminContext }
    );
    const fidyah = list.data.find((r) => r.kode === 'FIDYAH');
    if (!fidyah) {
      throw new Error('expected FIDYAH master row');
    }
    await call(
      router.admin.masterData.update,
      { type: 'JENIS_ZAKAT', id: fidyah.id, isActive: false },
      { context: adminContext }
    );
    try {
      await expectRejects(
        call(
          router.admin.zakat.createOrder,
          {
            namaMuzakki: 'Muzakki Fidyah',
            jenisZakat: 'FIDYAH',
            metodePembayaran: 'TUNAI',
            nominal: 50_000,
          },
          { context: adminContext }
        ),
        400
      );
      const options = await call(
        router.amil.jenisZakatOptions,
        {},
        { context: adminContext }
      );
      expect(options.data.some((o) => o.kode === 'FIDYAH')).toBe(false);
      expect(options.data.some((o) => o.kode === 'FITRAH')).toBe(true);
    } finally {
      await call(
        router.admin.masterData.update,
        { type: 'JENIS_ZAKAT', id: fidyah.id, isActive: true },
        { context: adminContext }
      );
    }
  });

  test('METODE_INFAQ sync imports channels already used by donations', async () => {
    const metode = `Kotak Masjid ${runId}`;
    const orderId = `ziscrud-${runId}-metode`;
    await database.insert(schema.infaqOrders).values({
      id: orderId,
      orderId: `INF-MAN-${ulid()}`,
      namaPenginfaq: 'Donatur Kotak',
      nominal: '20000',
      jenis: 'INFAQ_UMUM',
      status: 'SETTLED',
      metodeManual: metode,
    });
    try {
      const sync = await call(
        router.admin.masterData.sync,
        { type: 'METODE_INFAQ' },
        { context: adminContext }
      );
      expect(sync.added).toBeGreaterThanOrEqual(1);
      const list = await call(
        router.admin.masterData.list,
        { type: 'METODE_INFAQ' },
        { context: adminContext }
      );
      expect(list.data.some((r) => r.label === metode)).toBe(true);
      expect(
        list.data.some((r) => r.label === 'Kasir Tunai / Kotak Infaq')
      ).toBe(true);

      await expectRejects(
        call(
          router.admin.infaq.createOrder,
          {
            namaPenginfaq: 'Donatur',
            nominal: 10_000,
            jenis: 'INFAQ_UMUM',
            metode: 'Metode Tidak Terdaftar',
          },
          { context: adminContext }
        ),
        400
      );
    } finally {
      await database
        .delete(schema.infaqOrders)
        .where(eq(schema.infaqOrders.id, orderId));
      await database
        .delete(schema.metodeInfaqMaster)
        .where(eq(schema.metodeInfaqMaster.label, metode));
    }
  });
});

describe('oRPC admin.masterData — Waqaf picklists', () => {
  test('KATEGORI_WAQAF sync seeds the former hardcoded options once', async () => {
    await call(
      router.admin.masterData.sync,
      { type: 'KATEGORI_WAQAF' },
      { context: adminContext }
    );
    const again = await call(
      router.admin.masterData.sync,
      { type: 'KATEGORI_WAQAF' },
      { context: adminContext }
    );
    expect(again.added).toBe(0);
    const list = await call(
      router.admin.masterData.list,
      { type: 'KATEGORI_WAQAF' },
      { context: adminContext }
    );
    const labels = list.data.map((r) => r.label);
    for (const label of [
      'Infrastruktur & Sosial',
      'Pendidikan & Dakwah',
      'Kesehatan',
      'Air Bersih',
      'Agrobisnis',
      'Masjid',
      'Wakaf Produktif & Agrobisnis',
    ]) {
      expect(labels).toContain(label);
    }
  });

  test('AKAD_WAQAF sync maps the form akad to HABIS_PAKAI; create requires a mapping', async () => {
    await call(
      router.admin.masterData.sync,
      { type: 'AKAD_WAQAF' },
      { context: adminContext }
    );
    const list = await call(
      router.admin.masterData.list,
      { type: 'AKAD_WAQAF' },
      { context: adminContext }
    );
    expect(list.data.some((r) => r.jenisWakaf === 'HABIS_PAKAI')).toBe(true);

    await expectRejects(
      call(
        router.admin.masterData.create,
        { type: 'AKAD_WAQAF', label: 'Akad Tanpa Jenis', sortOrder: 9 },
        { context: adminContext }
      ),
      400
    );
    const created = await call(
      router.admin.masterData.create,
      {
        type: 'AKAD_WAQAF',
        label: `Akad Uji ${runId}`,
        sortOrder: 9,
        jenisWakaf: 'PRODUKTIF_KEKAL',
      },
      { context: adminContext }
    );
    try {
      expect(created && 'jenisWakaf' in created && created.jenisWakaf).toBe(
        'PRODUKTIF_KEKAL'
      );
    } finally {
      await database
        .delete(schema.akadWaqafMaster)
        .where(eq(schema.akadWaqafMaster.label, `Akad Uji ${runId}`));
    }
  });

  test('createProgram rejects a kategori that is not active in master data', async () => {
    await call(
      router.admin.masterData.sync,
      { type: 'KATEGORI_WAQAF' },
      { context: adminContext }
    );
    await expectRejects(
      call(
        router.admin.waqf.createProgram,
        {
          nadzirProfileId: 'tidak-dipakai',
          judul: 'Program Kategori Liar',
          deskripsi: 'Harus ditolak sebelum insert',
          kategori: `Kategori Tidak Terdaftar ${runId}`,
          targetDana: 1_000_000,
          durasiHari: 30,
          jenisWakaf: 'HABIS_PAKAI',
        },
        { context: adminContext }
      ),
      400
    );
  });
});

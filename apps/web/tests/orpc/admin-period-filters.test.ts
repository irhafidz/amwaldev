import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * [I-8] Filter periode WIB pada daftar admin zakat, qurban, dan infaq.
 *
 * Diuji ke Postgres sungguhan karena tipe kolom waktunya berbeda:
 * `infaq_orders.created_at` bertipe `timestamptz`, sedangkan `zakat_orders`
 * dan `qurban_orders` bertipe `timestamp(3)` tanpa zona. Keduanya harus
 * menghasilkan batas WIB yang sama, dan hanya database yang bisa
 * membuktikannya.
 *
 * Setiap fixture diletakkan tepat di sisi-sisi tengah malam WIB — titik di
 * mana filter yang memakai UTC akan salah sasaran selama tujuh jam.
 *
 * Basis data uji dipakai bersama, jadi pernyataan memeriksa keberadaan ID
 * milik tes ini, bukan jumlah total baris.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const RUN = `p11-period-${ulid().toLowerCase()}`;

// 2026-01-01 00:30 WIB — masih 2025 di UTC.
const NEW_YEAR_EARLY_WIB = '2025-12-31T17:30:00.000Z';
// 2025-12-31 23:59:59 WIB — sisi seberang batas yang sama.
const NEW_YEAR_EVE_WIB = '2025-12-31T16:59:59.000Z';
// 2026-09-01 00:30 WIB — masih Agustus di UTC.
const SEPTEMBER_EARLY_WIB = '2026-08-31T17:30:00.000Z';
// 2026-08-31 23:59:59 WIB.
const AUGUST_LATE_WIB = '2026-08-31T16:59:59.000Z';
// 2026-09-15 12:00 WIB.
const SEPTEMBER_MID_WIB = '2026-09-15T05:00:00.000Z';

const ids = {
  zakatIn: `${RUN}-zakat-in`,
  zakatOut: `${RUN}-zakat-out`,
  qurbanIn: `${RUN}-qurban-in`,
  qurbanOut: `${RUN}-qurban-out`,
  infaqEarlySept: `${RUN}-infaq-early-sept`,
  sedekahLateAug: `${RUN}-sedekah-late-aug`,
  sedekahMidSept: `${RUN}-sedekah-mid-sept`,
};

function adminContext() {
  return createTestCaller({
    database,
    user: { userId: `${RUN}-admin`, role: 'ADMIN' },
  });
}

function idsOf(rows: { id: string }[]): Set<string> {
  return new Set(rows.map((row) => row.id));
}

/**
 * Status HTTP dari pemanggilan yang diharapkan ditolak. Tidak memanggil
 * `expect` sendiri, supaya setiap pernyataan tetap berada di dalam `test()`.
 */
async function rejectionStatus(
  run: () => Promise<unknown>
): Promise<number | 'resolved' | 'not-orpc-error'> {
  try {
    await run();
    return 'resolved';
  } catch (error) {
    return error instanceof ORPCError ? error.status : 'not-orpc-error';
  }
}

beforeAll(async () => {
  await database.insert(schema.zakatOrders).values([
    {
      id: ids.zakatIn,
      nomorKwitansi: `${RUN}-kw-in`,
      namaMuzakki: 'Muzakki Periode',
      jenisZakat: 'MAAL_PENGHASILAN',
      metodePembayaran: 'TRANSFER',
      nominal: '100000.00',
      createdAt: NEW_YEAR_EARLY_WIB,
    },
    {
      id: ids.zakatOut,
      nomorKwitansi: `${RUN}-kw-out`,
      namaMuzakki: 'Muzakki Periode',
      jenisZakat: 'MAAL_PENGHASILAN',
      metodePembayaran: 'TRANSFER',
      nominal: '100000.00',
      createdAt: NEW_YEAR_EVE_WIB,
    },
  ]);

  await database.insert(schema.qurbanOrders).values([
    {
      id: ids.qurbanIn,
      namaPengqurban: 'Pengqurban Periode',
      jenisHewan: 'KAMBING',
      tipeKepemilikan: 'INDIVIDU',
      metodePembayaran: 'TRANSFER',
      totalHarga: '3000000.00',
      createdAt: NEW_YEAR_EARLY_WIB,
    },
    {
      id: ids.qurbanOut,
      namaPengqurban: 'Pengqurban Periode',
      jenisHewan: 'KAMBING',
      tipeKepemilikan: 'INDIVIDU',
      metodePembayaran: 'TRANSFER',
      totalHarga: '3000000.00',
      createdAt: NEW_YEAR_EVE_WIB,
    },
  ]);

  await database.insert(schema.infaqOrders).values([
    {
      id: ids.infaqEarlySept,
      orderId: `${RUN}-o1`,
      namaPenginfaq: 'Penginfaq Periode',
      nominal: '25000.00',
      jenis: 'INFAQ_UMUM',
      createdAt: SEPTEMBER_EARLY_WIB,
    },
    {
      id: ids.sedekahLateAug,
      orderId: `${RUN}-o2`,
      namaPenginfaq: 'Penginfaq Periode',
      nominal: '25000.00',
      jenis: 'SEDEKAH_YATIM',
      createdAt: AUGUST_LATE_WIB,
    },
    {
      id: ids.sedekahMidSept,
      orderId: `${RUN}-o3`,
      namaPenginfaq: 'Penginfaq Periode',
      nominal: '25000.00',
      jenis: 'SEDEKAH_OPERASIONAL',
      createdAt: SEPTEMBER_MID_WIB,
    },
  ]);
});

afterAll(async () => {
  await database
    .delete(schema.zakatOrders)
    .where(inArray(schema.zakatOrders.id, [ids.zakatIn, ids.zakatOut]));
  await database
    .delete(schema.qurbanOrders)
    .where(inArray(schema.qurbanOrders.id, [ids.qurbanIn, ids.qurbanOut]));
  await database
    .delete(schema.infaqOrders)
    .where(
      inArray(schema.infaqOrders.id, [
        ids.infaqEarlySept,
        ids.sedekahLateAug,
        ids.sedekahMidSept,
      ])
    );
});

describe('oRPC admin.zakat.ordersList — filter tahun WIB', () => {
  test('00:30 WIB 1 Januari masuk tahun baru, 23:59:59 WIB 31 Desember tidak', async () => {
    const context = await adminContext();
    const result = await call(
      router.admin.zakat.ordersList,
      { year: 2026 },
      { context }
    );
    const found = idsOf(result.data);

    expect(found.has(ids.zakatIn)).toBe(true);
    expect(found.has(ids.zakatOut)).toBe(false);
  });

  test('tanpa filter tahun, kedua sisi batas tetap tampil', async () => {
    const context = await adminContext();
    const result = await call(router.admin.zakat.ordersList, {}, { context });
    const found = idsOf(result.data);

    expect(found.has(ids.zakatIn)).toBe(true);
    expect(found.has(ids.zakatOut)).toBe(true);
  });
});

describe('oRPC admin.qurban.ordersList — filter tahun WIB', () => {
  test('batas tahun WIB berlaku sama pada kolom timestamp tanpa zona', async () => {
    const context = await adminContext();
    const result = await call(
      router.admin.qurban.ordersList,
      { year: 2025 },
      { context }
    );
    const found = idsOf(result.data);

    expect(found.has(ids.qurbanOut)).toBe(true);
    expect(found.has(ids.qurbanIn)).toBe(false);
  });

  test('tetap bisa dipanggil tanpa argumen seperti pemanggil UI yang ada', async () => {
    const context = await adminContext();
    const result = await call(router.admin.qurban.ordersList, undefined, {
      context,
    });
    const found = idsOf(result.data);

    expect(found.has(ids.qurbanIn)).toBe(true);
    expect(found.has(ids.qurbanOut)).toBe(true);
  });
});

describe('oRPC admin.infaq.ordersList — bulan + tahun WIB dan kategori', () => {
  test('bulan WIB pada kolom timestamptz: dini hari 1 Sep masuk, 31 Agu malam tidak', async () => {
    const context = await adminContext();
    const result = await call(
      router.admin.infaq.ordersList,
      { year: 2026, month: 9 },
      { context }
    );
    const found = idsOf(result.data);

    expect(found.has(ids.infaqEarlySept)).toBe(true);
    expect(found.has(ids.sedekahMidSept)).toBe(true);
    expect(found.has(ids.sedekahLateAug)).toBe(false);
  });

  test('kategori SEDEKAH memisahkan SEDEKAH_* dari INFAQ_*', async () => {
    const context = await adminContext();
    const result = await call(
      router.admin.infaq.ordersList,
      { year: 2026, month: 9, kategori: 'SEDEKAH' },
      { context }
    );
    const found = idsOf(result.data);

    expect(found.has(ids.sedekahMidSept)).toBe(true);
    expect(found.has(ids.infaqEarlySept)).toBe(false);
    expect(result.data.every((row) => row.jenis.startsWith('SEDEKAH_'))).toBe(
      true
    );
  });

  test('kategori INFAQ hanya mengembalikan INFAQ_*', async () => {
    const context = await adminContext();
    const result = await call(
      router.admin.infaq.ordersList,
      { year: 2026, month: 9, kategori: 'INFAQ' },
      { context }
    );

    expect(idsOf(result.data).has(ids.infaqEarlySept)).toBe(true);
    expect(result.data.every((row) => row.jenis.startsWith('INFAQ_'))).toBe(
      true
    );
  });

  test('bulan tanpa tahun ditolak 400, bukan diam-diam mengembalikan semua data', async () => {
    const context = await adminContext();

    expect(
      await rejectionStatus(() =>
        call(router.admin.infaq.ordersList, { month: 9 }, { context })
      )
    ).toBe(400);
  });

  test('tahun di luar rentang yang didukung ditolak 400', async () => {
    const context = await adminContext();

    expect(
      await rejectionStatus(() =>
        call(router.admin.infaq.ordersList, { year: 1999 }, { context })
      )
    ).toBe(400);
  });
});

describe('RBAC filter periode', () => {
  test('non-ADMIN ditolak 403 pada ketiga daftar', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: `${RUN}-wakif`, role: 'WAKIF' },
    });

    expect(
      await rejectionStatus(() =>
        call(router.admin.zakat.ordersList, { year: 2026 }, { context })
      )
    ).toBe(403);
    expect(
      await rejectionStatus(() =>
        call(router.admin.qurban.ordersList, { year: 2026 }, { context })
      )
    ).toBe(403);
    expect(
      await rejectionStatus(() =>
        call(
          router.admin.infaq.ordersList,
          { year: 2026, month: 9 },
          { context }
        )
      )
    ).toBe(403);
  });
});

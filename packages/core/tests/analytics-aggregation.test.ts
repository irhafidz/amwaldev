import { describe, expect, test } from 'bun:test';
import {
  aggregateComposition,
  aggregateTimeSeriesBuckets,
} from '../src/analytics/aggregation';

/**
 * Melengkapi blok agregasi di `analytics-period.test.ts`, yang sudah menutup
 * pengisian bucket kosong dan penjumlahan sederhana.
 *
 * Berkas ini sengaja menyasar bagian yang belum terbukti: atribusi batas WIB.
 * Donasi pukul 00:30 WIB tanggal 1 September tiba sebagai
 * `2026-08-31T17:30:00Z`. Agregasi yang memakai getMonth() UTC akan
 * memasukkannya ke Agustus — angka dashboard bergeser satu bulan untuk setiap
 * donasi antara pukul 00:00 dan 07:00 WIB, dan tidak ada yang menyadarinya
 * sampai laporan bulanan tidak cocok dengan mutasi bank.
 */

// 2026-09-01 00:30 WIB — tepat setelah tengah malam WIB, masih Agustus di UTC.
const EARLY_SEPTEMBER_WIB = new Date('2026-08-31T17:30:00Z');
// 2026-08-31 23:59:59 WIB — sisi seberang dari batas yang sama.
const LATE_AUGUST_WIB = new Date('2026-08-31T16:59:59Z');
// 2027-01-01 00:00 WIB — tahun baru WIB, masih 2026 di UTC.
const NEW_YEAR_WIB = new Date('2026-12-31T17:00:00Z');

describe('@amwal/core/analytics/aggregation — batas WIB', () => {
  test('donasi tepat setelah tengah malam WIB masuk hari itu, bukan hari UTC', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [{ date: EARLY_SEPTEMBER_WIB, amount: 50_000 }],
      { year: 2026, month: 9 }
    );

    expect(buckets[0]?.label).toBe('2026-09-01');
    expect(buckets[0]?.amount).toBe(50_000);
    expect(buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(50_000);
  });

  test('donasi tepat sebelum tengah malam WIB tetap di bulan sebelumnya', () => {
    const september = aggregateTimeSeriesBuckets(
      [{ date: LATE_AUGUST_WIB, amount: 50_000 }],
      { year: 2026, month: 9 }
    );
    expect(september.reduce((sum, b) => sum + b.amount, 0)).toBe(0);

    const august = aggregateTimeSeriesBuckets(
      [{ date: LATE_AUGUST_WIB, amount: 50_000 }],
      { year: 2026, month: 8 }
    );
    expect(august.at(-1)?.label).toBe('2026-08-31');
    expect(august.at(-1)?.amount).toBe(50_000);
  });

  test('bucket bulanan menempatkan donasi dini hari WIB di bulan yang benar', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [{ date: EARLY_SEPTEMBER_WIB, amount: 75_000 }],
      { year: 2026 }
    );

    const september = buckets.find((b) => b.label === '2026-09');
    const august = buckets.find((b) => b.label === '2026-08');

    expect(september?.amount).toBe(75_000);
    expect(august?.amount).toBe(0);
  });

  test('tahun baru WIB tidak dihitung pada tahun UTC sebelumnya', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [{ date: NEW_YEAR_WIB, amount: 10_000 }],
      { year: 2026 }
    );

    expect(buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(0);
  });
});

describe('@amwal/core/analytics/aggregation — penyaringan periode', () => {
  test('data di luar tahun yang diminta diabaikan', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [
        { date: new Date('2025-09-10T05:00:00Z'), amount: 1000 },
        { date: new Date('2026-09-10T05:00:00Z'), amount: 2000 },
        { date: new Date('2027-09-10T05:00:00Z'), amount: 4000 },
      ],
      { year: 2026 }
    );

    expect(buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(2000);
  });

  test('data di luar bulan yang diminta diabaikan', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [
        { date: new Date('2026-08-10T05:00:00Z'), amount: 1000 },
        { date: new Date('2026-09-10T05:00:00Z'), amount: 2000 },
      ],
      { year: 2026, month: 9 }
    );

    expect(buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(2000);
  });

  test('beberapa donasi pada hari yang sama dijumlahkan dalam satu bucket', () => {
    const buckets = aggregateTimeSeriesBuckets(
      [
        { date: new Date('2026-09-10T02:00:00Z'), amount: 1000 },
        { date: new Date('2026-09-10T09:00:00Z'), amount: 2000 },
        { date: new Date('2026-09-10T16:00:00Z'), amount: 3000 },
      ],
      { year: 2026, month: 9 }
    );

    const day10 = buckets.find((b) => b.label === '2026-09-10');
    expect(day10?.amount).toBe(6000);
    expect(buckets.filter((b) => b.amount > 0)).toHaveLength(1);
  });
});

describe('@amwal/core/analytics/aggregation — jumlah hari per bulan', () => {
  test('Februari tahun biasa menghasilkan 28 bucket', () => {
    const buckets = aggregateTimeSeriesBuckets([], { year: 2026, month: 2 });

    expect(buckets).toHaveLength(28);
    expect(buckets.at(-1)?.label).toBe('2026-02-28');
  });

  test('Februari tahun kabisat menghasilkan 29 bucket', () => {
    const buckets = aggregateTimeSeriesBuckets([], { year: 2028, month: 2 });

    expect(buckets).toHaveLength(29);
    expect(buckets.at(-1)?.label).toBe('2028-02-29');
  });

  test('bulan 30 dan 31 hari dibedakan', () => {
    expect(
      aggregateTimeSeriesBuckets([], { year: 2026, month: 4 })
    ).toHaveLength(30);
    expect(
      aggregateTimeSeriesBuckets([], { year: 2026, month: 12 })
    ).toHaveLength(31);
  });
});

describe('@amwal/core/analytics/aggregation — komposisi', () => {
  test('masukan kosong menghasilkan larik kosong, bukan galat', () => {
    expect(aggregateComposition([])).toEqual([]);
  });

  test('urutan keluaran stabil menurut nama modul', () => {
    const result = aggregateComposition([
      { module: 'ZAKAT', amount: 1 },
      { module: 'INFAQ', amount: 1 },
      { module: 'WAKAF', amount: 1 },
      { module: 'QURBAN', amount: 1 },
    ]);

    expect(result.map((r) => r.module)).toEqual([
      'INFAQ',
      'QURBAN',
      'WAKAF',
      'ZAKAT',
    ]);
  });

  test('modul dengan total nol tetap dilaporkan, bukan dibuang', () => {
    // Nominal yang saling meniadakan (mis. koreksi) tetap harus muncul —
    // menghilangkannya membuat modul seolah tidak pernah ada transaksi.
    expect(
      aggregateComposition([
        { module: 'INFAQ', amount: 5000 },
        { module: 'INFAQ', amount: -5000 },
      ])
    ).toEqual([{ module: 'INFAQ', amount: 0 }]);
  });
});

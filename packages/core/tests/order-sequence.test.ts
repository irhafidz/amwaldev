import { describe, expect, test } from 'bun:test';
import { orderScopeKey } from '../src/payment/order-sequence';

/**
 * Hanya `orderScopeKey()` yang bisa diuji murni. `nextOrderSequence()`
 * bergantung pada satu pernyataan atomik Postgres dan constraint CHECK di
 * tabel — menirunya dengan mock justru menguji mock, bukan jaminan yang
 * sebenarnya. Perilakunya diverifikasi terhadap database uji lewat
 * `apps/web/scripts/verify-0004.ts` (20 order paralel dan penolakan nomor
 * ke-10.000).
 *
 * Kunci cakupan menentukan KAPAN deret nomor direset. Salah zona waktu di
 * sini berarti deret berganti pukul 07:00 WIB mengikuti UTC, sehingga donasi
 * dini hari mendapat nomor bulan sebelumnya.
 */

describe('@amwal/core/payment/order-sequence — orderScopeKey', () => {
  test('memakai kode modul, tahun-bulan WIB, dan sub-program', () => {
    // 2026-09-16 12:00 WIB
    const at = new Date('2026-09-16T05:00:00Z');

    expect(orderScopeKey({ module: 'INFAQ', at })).toBe('80-2609-00');
    expect(orderScopeKey({ module: 'WAQF', at })).toBe('60-2609-00');
    expect(orderScopeKey({ module: 'ZAKAT', at })).toBe('70-2609-00');
    expect(orderScopeKey({ module: 'SEDEKAH', at })).toBe('85-2609-00');
    expect(orderScopeKey({ module: 'QURBAN', at })).toBe('90-2609-00');
  });

  test('tepat setelah tengah malam WIB sudah masuk bulan berikutnya', () => {
    // 2026-09-01 00:30 WIB — masih 31 Agustus di UTC.
    const at = new Date('2026-08-31T17:30:00Z');

    expect(orderScopeKey({ module: 'INFAQ', at })).toBe('80-2609-00');
  });

  test('tepat sebelum tengah malam WIB masih bulan berjalan', () => {
    // 2026-08-31 23:59:59 WIB
    const at = new Date('2026-08-31T16:59:59Z');

    expect(orderScopeKey({ module: 'INFAQ', at })).toBe('80-2608-00');
  });

  test('pergantian tahun mengikuti WIB, bukan UTC', () => {
    // 2027-01-01 00:00 WIB — masih 2026 di UTC.
    const at = new Date('2026-12-31T17:00:00Z');

    expect(orderScopeKey({ module: 'WAQF', at })).toBe('60-2701-00');
  });

  test('sub-program eksplisit dilengkapi menjadi dua digit', () => {
    const at = new Date('2026-09-16T05:00:00Z');

    expect(orderScopeKey({ module: 'WAQF', at, subProgram: '7' })).toBe(
      '60-2609-07'
    );
    expect(orderScopeKey({ module: 'WAQF', at, subProgram: '12' })).toBe(
      '60-2609-12'
    );
  });

  test('cakupan berbeda tidak pernah berbagi kunci', () => {
    const at = new Date('2026-09-16T05:00:00Z');
    const keys = [
      orderScopeKey({ module: 'WAQF', at }),
      orderScopeKey({ module: 'ZAKAT', at }),
      orderScopeKey({ module: 'INFAQ', at }),
      orderScopeKey({ module: 'SEDEKAH', at }),
      orderScopeKey({ module: 'QURBAN', at }),
      orderScopeKey({ module: 'WAQF', at, subProgram: '01' }),
      orderScopeKey({ module: 'WAQF', at: new Date('2026-10-16T05:00:00Z') }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});

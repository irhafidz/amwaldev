import { describe, expect, test } from 'bun:test';
import {
  PENDING_FALLBACK_TTL_MS,
  paymentDeadline,
  paymentDisplayStatus,
  remainingParts,
  resumablePayment,
  summarizeDonations,
} from '../../src/payment/resume';

const NOW = Date.parse('2026-10-09T10:00:00.000Z');
const created = '2026-10-09T09:00:00.000Z';
const future = '2026-10-09T10:15:00.000Z';
const past = '2026-10-09T09:45:00.000Z';
const qris = { type: 'qris' as const, qrString: 'AMWAL-SIMULASI-QRIS|1|100' };

describe('paymentDisplayStatus (QA-01, D1)', () => {
  test('LUNAS atau pesanan TERVERIFIKASI = Berhasil', () => {
    expect(
      paymentDisplayStatus(
        { statusPembayaran: 'LUNAS', createdAt: created },
        NOW
      )
    ).toBe('BERHASIL');
    expect(
      paymentDisplayStatus(
        {
          statusPembayaran: 'PENDING',
          orderStatus: 'TERVERIFIKASI',
          createdAt: created,
        },
        NOW
      )
    ).toBe('BERHASIL');
  });

  test('GAGAL atau DITOLAK = Gagal', () => {
    expect(
      paymentDisplayStatus(
        { statusPembayaran: 'GAGAL', createdAt: created },
        NOW
      )
    ).toBe('GAGAL');
    expect(
      paymentDisplayStatus(
        {
          statusPembayaran: 'PENDING',
          orderStatus: 'DITOLAK',
          createdAt: created,
        },
        NOW
      )
    ).toBe('GAGAL');
  });

  test('PENDING menunggu sampai batas waktu, lalu kedaluwarsa', () => {
    expect(
      paymentDisplayStatus(
        {
          statusPembayaran: 'PENDING',
          paymentExpiresAt: future,
          createdAt: created,
        },
        NOW
      )
    ).toBe('MENUNGGU');
    expect(
      paymentDisplayStatus(
        {
          statusPembayaran: 'PENDING',
          paymentExpiresAt: past,
          createdAt: created,
        },
        NOW
      )
    ).toBe('KEDALUWARSA');
  });

  test('transaksi lama tanpa payment_expires_at memakai createdAt + 24 jam', () => {
    expect(paymentDeadline({ createdAt: created })).toBe(
      Date.parse(created) + PENDING_FALLBACK_TTL_MS
    );
    const old = '2026-10-07T09:00:00.000Z';
    expect(
      paymentDisplayStatus({ statusPembayaran: 'PENDING', createdAt: old }, NOW)
    ).toBe('KEDALUWARSA');
    expect(
      paymentDisplayStatus(
        { statusPembayaran: 'PENDING', createdAt: created },
        NOW
      )
    ).toBe('MENUNGGU');
  });

  test('DP (uang muka) tetap menunggu dan tidak pernah kedaluwarsa', () => {
    const old = '2026-01-01T00:00:00.000Z';
    expect(
      paymentDisplayStatus({ statusPembayaran: 'DP', createdAt: old }, NOW)
    ).toBe('MENUNGGU');
  });
});

describe('timestamp DB naif (UTC tanpa zona waktu)', () => {
  test('dibaca sebagai UTC, bukan waktu lokal — pembayaran baru tidak tampak kedaluwarsa', () => {
    // Persis bentuk yang dikembalikan Drizzle untuk kolom timestamp(3).
    const naiveCreated = '2026-10-09 09:50:00.000';
    const naiveExpires = '2026-10-09 10:05:00.000';
    expect(
      paymentDeadline({
        paymentExpiresAt: naiveExpires,
        createdAt: naiveCreated,
      })
    ).toBe(Date.parse('2026-10-09T10:05:00.000Z'));
    expect(
      paymentDisplayStatus(
        {
          statusPembayaran: 'PENDING',
          paymentExpiresAt: naiveExpires,
          createdAt: naiveCreated,
        },
        NOW
      )
    ).toBe('MENUNGGU');
  });
});

describe('resumablePayment (QA-02)', () => {
  test('PENDING yang masih berlaku dengan instruksi tersimpan bisa dilanjutkan', () => {
    expect(
      resumablePayment(
        {
          statusPembayaran: 'PENDING',
          paymentExpiresAt: future,
          createdAt: created,
          paymentInstructions: qris,
          paymentUrl: 'https://pay.example/x',
        },
        NOW
      )
    ).toEqual({
      instructions: qris,
      url: 'https://pay.example/x',
      expiresAt: future,
    });
  });

  test('tidak pernah mengembalikan instruksi untuk transaksi lunas, kedaluwarsa, DP, atau tanpa data', () => {
    const base = {
      createdAt: created,
      paymentInstructions: qris,
      paymentUrl: 'https://pay.example/x',
    };
    expect(
      resumablePayment(
        { ...base, statusPembayaran: 'LUNAS', paymentExpiresAt: future },
        NOW
      )
    ).toBeNull();
    expect(
      resumablePayment(
        { ...base, statusPembayaran: 'PENDING', paymentExpiresAt: past },
        NOW
      )
    ).toBeNull();
    expect(
      resumablePayment({ ...base, statusPembayaran: 'DP' }, NOW)
    ).toBeNull();
    expect(
      resumablePayment(
        {
          statusPembayaran: 'PENDING',
          paymentExpiresAt: future,
          createdAt: created,
        },
        NOW
      )
    ).toBeNull();
  });
});

describe('summarizeDonations (D1)', () => {
  test('total hanya menjumlahkan yang berhasil; pending dihitung terpisah', () => {
    const summary = summarizeDonations(
      [
        { statusPembayaran: 'LUNAS', amount: '250000.00', createdAt: created },
        {
          statusPembayaran: 'PENDING',
          amount: '10000000.00',
          paymentExpiresAt: future,
          createdAt: created,
        },
        {
          statusPembayaran: 'PENDING',
          amount: '5000000.00',
          paymentExpiresAt: past,
          createdAt: created,
        },
        { statusPembayaran: 'GAGAL', amount: '75000.00', createdAt: created },
        { statusPembayaran: 'LUNAS', amount: 50_000, createdAt: created },
      ],
      NOW
    );
    expect(summary).toEqual({
      totalBerhasil: 300_000,
      berhasil: 2,
      menunggu: 1,
    });
  });
});

describe('remainingParts', () => {
  test('memecah sisa waktu dan berhenti di nol', () => {
    expect(remainingParts(NOW + 3_723_000, NOW)).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 3,
      expired: false,
    });
    expect(remainingParts(NOW - 1, NOW)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    });
  });
});

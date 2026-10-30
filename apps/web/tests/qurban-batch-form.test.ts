import { describe, expect, test } from 'bun:test';
import { slotCountFor, validateBatchForm } from '../src/lib/qurban-batch-form';

/** Murni, tanpa database. Alur Tambah Hewan Qurban (UAT #4, U4-05). */
describe('validateBatchForm', () => {
  const ok = {
    estimasiBeratKg: '',
    hargaPerSlot: '2950000',
    targetPenerimaManfaat: '',
  };

  test('hanya harga yang wajib', () => {
    expect(validateBatchForm(ok)).toBeNull();
  });

  test('harga kosong atau nol ditolak dengan pesan yang menyebut kolomnya', () => {
    expect(validateBatchForm({ ...ok, hargaPerSlot: '' })).toContain('Harga');
    expect(validateBatchForm({ ...ok, hargaPerSlot: '0' })).toContain('Harga');
  });

  test('berat: kosong boleh, nol/negatif tidak', () => {
    expect(validateBatchForm({ ...ok, estimasiBeratKg: '350' })).toBeNull();
    expect(validateBatchForm({ ...ok, estimasiBeratKg: '0' })).toContain(
      'Estimasi berat'
    );
    expect(validateBatchForm({ ...ok, estimasiBeratKg: '-4' })).toContain(
      'Estimasi berat'
    );
  });

  test('target penerima: kosong boleh, harus bilangan bulat positif', () => {
    expect(
      validateBatchForm({ ...ok, targetPenerimaManfaat: '40' })
    ).toBeNull();
    expect(
      validateBatchForm({ ...ok, targetPenerimaManfaat: '2.5' })
    ).toContain('Target penerima');
    expect(validateBatchForm({ ...ok, targetPenerimaManfaat: '0' })).toContain(
      'Target penerima'
    );
  });
});

describe('slotCountFor', () => {
  test('kambing selalu 1 slot walau kolom slot masih "7" dari pilihan sapi', () => {
    expect(slotCountFor({ jenisHewan: 'KAMBING', totalSlot: '7' })).toBe(1);
  });

  test('sapi memakai pilihan slotnya', () => {
    expect(slotCountFor({ jenisHewan: 'SAPI', totalSlot: '7' })).toBe(7);
    expect(slotCountFor({ jenisHewan: 'SAPI', totalSlot: '1' })).toBe(1);
  });
});

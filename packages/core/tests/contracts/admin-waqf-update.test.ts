import { describe, expect, it } from 'bun:test';
import {
  createProgramSchema,
  updateProgramSchema,
} from '../../src/contracts/admin-waqf';

describe('updateProgramSchema', () => {
  it('accepts the root-relative placeholder banner the admin list falls back to', () => {
    const parsed = updateProgramSchema.safeParse({
      id: 'p1',
      bannerUrl: '/assets/images/wakaf/wakaf-air-bersih-desa-nurul-amanah.png',
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts absolute and data: banners, rejects junk', () => {
    for (const bannerUrl of [
      'https://cdn.example.com/b.png',
      'data:image/png;base64,AAAA',
    ]) {
      expect(
        updateProgramSchema.safeParse({ id: 'p1', bannerUrl }).success
      ).toBe(true);
    }
    expect(
      updateProgramSchema.safeParse({ id: 'p1', bannerUrl: 'not a url' })
        .success
    ).toBe(false);
  });

  it('keeps the bank account fields (they used to be stripped silently)', () => {
    const parsed = updateProgramSchema.parse({
      id: 'p1',
      namaBank: 'Bank Syariah Indonesia',
      nomorRekeningBank: '7123456789',
      atasNamaRekening: 'Yayasan Contoh',
    });
    expect(parsed.namaBank).toBe('Bank Syariah Indonesia');
    expect(parsed.nomorRekeningBank).toBe('7123456789');
    expect(parsed.atasNamaRekening).toBe('Yayasan Contoh');
  });

  it('create accepts the same bank fields as optional', () => {
    const base = {
      nadzirProfileId: 'n1',
      judul: 'Sumur',
      deskripsi: 'Sumur desa',
      kategori: 'Air',
      targetDana: 1000,
      durasiHari: 30,
      jenisWakaf: 'HABIS_PAKAI' as const,
    };
    expect(createProgramSchema.safeParse(base).success).toBe(true);
    expect(
      createProgramSchema.parse({ ...base, namaBank: 'BSI' }).namaBank
    ).toBe('BSI');
  });
});

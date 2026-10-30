import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WakafNazhirCard } from '../../src/components/wakaf/wakaf-nazhir-card';
import { nadzirKategoriLabel } from '../../src/lib/nadzir-labels';

describe('nadzirKategoriLabel (QA-17)', () => {
  test('maps every NadzirKategori enum value to a readable label', () => {
    expect(nadzirKategoriLabel('BADAN_HUKUM')).toBe('Badan Hukum');
    expect(nadzirKategoriLabel('ORGANISASI')).toBe('Organisasi');
    expect(nadzirKategoriLabel('PERSEORANGAN')).toBe('Perseorangan');
  });

  test('tidies unknown values instead of showing them raw, and falls back when empty', () => {
    expect(nadzirKategoriLabel('YAYASAN_SOSIAL')).toBe('Yayasan Sosial');
    expect(nadzirKategoriLabel(null)).toBe('Organisasi');
    expect(nadzirKategoriLabel('  ', 'Lembaga')).toBe('Lembaga');
  });

  test('the public program page card never shows the raw enum', () => {
    const html = renderToStaticMarkup(
      <WakafNazhirCard
        location="Surabaya"
        nazhir={{
          id: 'nadzir-1',
          namaLembaga: 'Yayasan Wakaf Contoh',
          kategori: 'BADAN_HUKUM',
          // Belum terverifikasi: tanpa tautan profil, jadi bisa dirender tanpa router.
          statusVerifikasi: 'PENDING',
        }}
      />
    );
    expect(html).toContain('Badan Hukum');
    expect(html).not.toContain('BADAN_HUKUM');
  });
});

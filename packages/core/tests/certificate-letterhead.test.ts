import { describe, expect, test } from 'bun:test';
import { generateCertificatePdf } from '../src/certificate/generator';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  BODY_BOTTOM_MM,
  BODY_TOP_MM,
} from '../src/certificate/letterhead';

/**
 * Sertifikat berkop-kaki resmi A4 (QA-11). Struktur PDF diperiksa tanpa
 * perender: kertas A4 satu halaman, tiga logo + QR sebagai gambar, berkas
 * terkompresi, dan tautan resmi `amwal.id`. Tampilan visual (badan putih
 * polos, tanpa mozaik) diperiksa dengan merender halaman saat pengembangan.
 */

const base = {
  certificateId: 'CERT-TEST',
  nomorInternalAmwal: 'CERT-AMW-2026-0001',
  namaDonatur: 'Hj. Siti Aminah',
  nominal: 2_500_000,
  programTitle: 'Wakaf Pembangunan Masjid',
  tanggalTransaksi: '2026-10-09 01:42:00.000',
  namaLembaga: 'Yayasan Wakaf Amwal ITS',
  verifyBaseUrl: 'https://amwal.id',
};

const asText = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('generateCertificatePdf with the A4 letterhead', () => {
  test.each(['WAKAF', 'ZAKAT', 'INFAQ', 'QURBAN'])(
    '%s renders a one-page A4 PDF with the logos and the amwal.id link',
    async (jenisTransaksi) => {
      const pdf = await generateCertificatePdf({ ...base, jenisTransaksi });
      const text = asText(pdf);

      expect(text.startsWith('%PDF-')).toBe(true);
      // A4 portrait: 595.28 x 841.89 pt.
      const box = text.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1] ?? '';
      const [x0, y0, x1, y1] = box.trim().split(/\s+/).map(Number);
      expect([x0, y0]).toEqual([0, 0]);
      expect(x1).toBeCloseTo(595.28, 1);
      expect(y1).toBeCloseTo(841.89, 1);
      expect(text.match(/\/Type\s*\/Page\b(?!s)/g)).toHaveLength(1);
      // HETI + ITS + ikon Amwal + QR verifikasi.
      expect(text.match(/\/Subtype\s*\/Image/g)?.length).toBeGreaterThanOrEqual(
        4
      );
      // Tautan resmi di kaki.
      expect(text).toContain('https://amwal.id');
      // Logo PNG tanpa kompresi membuat berkas ±2 MB.
      expect(pdf.byteLength).toBeLessThan(300_000);
    }
  );

  test('the body area sits between the header and the footer', () => {
    expect(A4_WIDTH_MM).toBe(210);
    expect(A4_HEIGHT_MM).toBe(297);
    // Kop selesai di ±33 mm; kaki mulai di 297 - 24 = 273 mm.
    expect(BODY_TOP_MM).toBeGreaterThan(33);
    expect(BODY_BOTTOM_MM).toBeLessThan(273);
  });

  test('refuses an unverifiable QR instead of printing it', async () => {
    await expect(
      generateCertificatePdf({
        ...base,
        jenisTransaksi: 'WAKAF',
        verifyBaseUrl: '',
      })
    ).rejects.toThrow();
  });
});

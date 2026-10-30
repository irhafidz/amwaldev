import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { generateCertificatePdf } from '../src/certificate/generator';
import {
  isWholeCow,
  joinShohibul,
  MAX_SHOHIBUL_PER_COW,
  maxShohibulNames,
} from '../src/qurban/shohibul';

/** QA-13: satu sapi utuh boleh atas 1-7 nama; selain itu satu nama per slot. */

const STREAM_PATTERN = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const PAGE_PATTERN = /\/Type\s*\/Page\b/g;

describe('maxShohibulNames', () => {
  test('a whole cow (SAPI, one slot) holds up to 7 names', () => {
    const cow = { jenisHewan: 'SAPI', totalSlot: 1 } as const;
    expect(isWholeCow(cow)).toBe(true);
    expect(maxShohibulNames(cow, 1)).toBe(MAX_SHOHIBUL_PER_COW);
  });

  test('a shared cow (7 slots) and a goat stay one name per slot', () => {
    expect(maxShohibulNames({ jenisHewan: 'SAPI', totalSlot: 7 }, 3)).toBe(3);
    expect(isWholeCow({ jenisHewan: 'SAPI', totalSlot: 7 })).toBe(false);
    expect(maxShohibulNames({ jenisHewan: 'KAMBING', totalSlot: 1 }, 1)).toBe(
      1
    );
  });

  test('joins names in the legacy "A, B" shape', () => {
    expect(joinShohibul(['Ahmad bin Ali', 'Siti binti Umar'])).toBe(
      'Ahmad bin Ali, Siti binti Umar'
    );
  });
});

function pdfText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString('latin1');
  return [...raw.matchAll(STREAM_PATTERN)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString(
          'latin1'
        );
      } catch {
        return '';
      }
    })
    .join('\n')
    .replaceAll('\\(', '(')
    .replaceAll('\\)', ')');
}

const base = {
  certificateId: 'CERT-Q',
  nomorInternalAmwal: 'CERT-AMW-2026-0042',
  jenisTransaksi: 'QURBAN',
  namaDonatur: 'Budi Santoso',
  nominal: 21_000_000,
  programTitle: 'Qurban Sapi Utuh',
  tanggalTransaksi: '2026-10-09 01:42:00.000',
  verifyBaseUrl: 'https://amwal.id',
};

describe('qurban certificate shohibul line', () => {
  test('prints every shohibul name of a whole cow on one page', async () => {
    const names = Array.from(
      { length: 7 },
      (_, i) => `Shohibul Nomor ${i + 1} bin Abdullah`
    );
    const pdf = await generateCertificatePdf({ ...base, shohibulList: names });
    const text = pdfText(pdf);
    expect(text).toContain('Atas Nama');
    expect(text).toContain('Shohibul Nomor 1 bin Abdullah');
    expect(text).toContain('Shohibul Nomor 7 bin Abdullah');
    expect(
      Buffer.from(pdf).toString('latin1').match(PAGE_PATTERN)
    ).toHaveLength(1);
  });

  test('omits the line when the only shohibul is the buyer', async () => {
    const pdf = await generateCertificatePdf({
      ...base,
      shohibulList: ['Budi Santoso'],
    });
    expect(pdfText(pdf)).not.toContain('Atas Nama');
  });
});

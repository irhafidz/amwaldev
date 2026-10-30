import { describe, expect, test } from 'bun:test';
import { sha256Body } from '../src/akad/sha256';
import {
  AKAD_MODULES,
  activateAkadSchema,
  akadAcceptanceInputSchema,
  akadModuleSchema,
  publishAkadSchema,
} from '../src/contracts/akad';

describe('akad contracts & schemas', () => {
  test('validates all 5 supported modules', () => {
    for (const mod of AKAD_MODULES) {
      expect(akadModuleSchema.parse({ module: mod })).toEqual({ module: mod });
    }
    expect(() => akadModuleSchema.parse({ module: 'UNKNOWN' })).toThrow();
  });

  test('validates publish input trimming and constraints', () => {
    const valid = publishAkadSchema.parse({
      module: 'WAKAF',
      title: '  Akad Wakaf Uang  ',
      body: '  Dengan ini saya berwakaf...  ',
    });
    expect(valid.title).toBe('Akad Wakaf Uang');
    expect(valid.body).toBe('Dengan ini saya berwakaf...');

    expect(() =>
      publishAkadSchema.parse({
        module: 'WAKAF',
        title: '   ',
        body: 'valid body',
      })
    ).toThrow();
  });

  test('validates activate schema', () => {
    expect(activateAkadSchema.parse({ module: 'QURBAN', version: 1 })).toEqual({
      module: 'QURBAN',
      version: 1,
    });
    expect(() =>
      activateAkadSchema.parse({ module: 'QURBAN', version: 0 })
    ).toThrow();
    expect(() =>
      activateAkadSchema.parse({ module: 'QURBAN', version: -1 })
    ).toThrow();
  });

  test('validates akad acceptance input schema', () => {
    const hash = 'a'.repeat(64);
    const valid = akadAcceptanceInputSchema.parse({
      templateId: 'tmpl_123',
      version: 2,
      bodySha256: hash,
    });
    expect(valid.templateId).toBe('tmpl_123');
    expect(valid.version).toBe(2);
    expect(valid.bodySha256).toBe(hash);

    expect(() =>
      akadAcceptanceInputSchema.parse({
        templateId: '',
        version: 1,
        bodySha256: hash,
      })
    ).toThrow();

    expect(() =>
      akadAcceptanceInputSchema.parse({
        templateId: 'tmpl_123',
        version: 1,
        bodySha256: 'invalid-hash',
      })
    ).toThrow();
  });
});

describe('sha256Body', () => {
  test('produces a valid 64-character lowercase hex hash', async () => {
    const hash = await sha256Body('Saya berniat berwakaf...');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('is deterministic for identical input', async () => {
    const text = 'Teks akad hukum donasi.';
    expect(await sha256Body(text)).toBe(await sha256Body(text));
  });

  test('normalizes CRLF and LF to produce identical hash', async () => {
    const textLF = 'Baris 1\nBaris 2\nBaris 3';
    const textCRLF = 'Baris 1\r\nBaris 2\r\nBaris 3';

    expect(await sha256Body(textLF)).toBe(await sha256Body(textCRLF));
  });

  test('normalizes leading and trailing whitespace', async () => {
    const textA = 'Teks akad donasi';
    const textB = '   \n\r\n  Teks akad donasi \t  \n  ';

    expect(await sha256Body(textA)).toBe(await sha256Body(textB));
  });

  test('different text produces different hash', async () => {
    const hash1 = await sha256Body('Akad Wakaf Versi 1');
    const hash2 = await sha256Body('Akad Wakaf Versi 2');

    expect(hash1).not.toBe(hash2);
  });
});

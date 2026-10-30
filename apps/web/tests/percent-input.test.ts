import { describe, expect, test } from 'bun:test';
import { sanitizePercentInput } from '../src/lib/percent-input';

/** Murni, tanpa database. Kasus "080%" dari UAT #4 (Mas Atiq, Kelola Progress). */
describe('sanitizePercentInput', () => {
  test('membuang nol di depan: mengetik 8 lalu 0 setelah "0" menjadi 80, bukan 080', () => {
    expect(sanitizePercentInput('080')).toBe('80');
    expect(sanitizePercentInput('08')).toBe('8');
    expect(sanitizePercentInput('007')).toBe('7');
  });

  test('nol tunggal dan kolom kosong dipertahankan apa adanya', () => {
    expect(sanitizePercentInput('0')).toBe('0');
    expect(sanitizePercentInput('00')).toBe('0');
    expect(sanitizePercentInput('')).toBe('');
  });

  test('dibatasi 0-100 dan hanya menerima digit', () => {
    expect(sanitizePercentInput('100')).toBe('100');
    expect(sanitizePercentInput('101')).toBe('100');
    expect(sanitizePercentInput('1000')).toBe('100');
    expect(sanitizePercentInput('-5')).toBe('5');
    expect(sanitizePercentInput('7a%')).toBe('7');
    expect(sanitizePercentInput('abc')).toBe('');
  });
});

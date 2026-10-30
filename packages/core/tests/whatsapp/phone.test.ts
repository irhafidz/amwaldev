import { describe, expect, it } from 'bun:test';
import {
  formatIndonesianPhone,
  isValidIndonesianPhone,
  normalizeIndonesianPhone,
} from '../../src/whatsapp/phone';

describe('normalizeIndonesianPhone', () => {
  it('normalizes a trunk-prefixed number to the 62 form', () => {
    expect(normalizeIndonesianPhone('081211004001')).toBe('6281211004001');
  });

  it('keeps an already-canonical number unchanged', () => {
    expect(normalizeIndonesianPhone('6281211004001')).toBe('6281211004001');
  });

  it('accepts a bare national number without trunk prefix', () => {
    expect(normalizeIndonesianPhone('81211004001')).toBe('6281211004001');
  });

  it('strips plus sign, spaces, dashes and parentheses', () => {
    expect(normalizeIndonesianPhone('+62 812-1100-4001')).toBe('6281211004001');
    expect(normalizeIndonesianPhone('(0812) 1100 4001')).toBe('6281211004001');
  });

  it('accepts the shortest and longest published mobile lengths', () => {
    expect(normalizeIndonesianPhone('0812345678')).toBe('62812345678');
    expect(normalizeIndonesianPhone('0812345678901')).toBe('62812345678901');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(normalizeIndonesianPhone('')).toBeNull();
    expect(normalizeIndonesianPhone('   ')).toBeNull();
  });

  it('rejects a landline starting with a non-mobile prefix', () => {
    expect(normalizeIndonesianPhone('0211234567')).toBeNull();
    expect(normalizeIndonesianPhone('62211234567')).toBeNull();
  });

  it('rejects a number that is too short or too long', () => {
    expect(normalizeIndonesianPhone('081234567')).toBeNull();
    expect(normalizeIndonesianPhone('081234567890123')).toBeNull();
  });

  it('rejects free text and non-Indonesian country codes', () => {
    expect(normalizeIndonesianPhone('bukan nomor')).toBeNull();
    expect(normalizeIndonesianPhone('+1 415 555 0100')).toBeNull();
    expect(normalizeIndonesianPhone('60123456789')).toBeNull();
  });
});

describe('isValidIndonesianPhone', () => {
  it('returns true for a valid number and false otherwise', () => {
    expect(isValidIndonesianPhone('0812-1100-4001')).toBe(true);
    expect(isValidIndonesianPhone('12345')).toBe(false);
  });
});

describe('formatIndonesianPhone', () => {
  it('groups a canonical number into a readable display form', () => {
    expect(formatIndonesianPhone('6281211004001')).toBe('+62 812-1100-4001');
  });

  it('normalizes before formatting', () => {
    expect(formatIndonesianPhone('081211004001')).toBe('+62 812-1100-4001');
  });

  it('returns an unrecognized value unchanged', () => {
    expect(formatIndonesianPhone('bukan nomor')).toBe('bukan nomor');
  });
});

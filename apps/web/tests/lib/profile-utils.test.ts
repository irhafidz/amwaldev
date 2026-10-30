import { describe, expect, test } from 'bun:test';
import {
  normalizeBirthDate,
  normalizeGender,
  normalizePhoneNumber,
} from '../../src/lib/profile-utils';

describe('Profile Utilities — normalizeBirthDate', () => {
  test('keeps ISO YYYY-MM-DD unchanged', () => {
    expect(normalizeBirthDate('2003-08-23')).toBe('2003-08-23');
    expect(normalizeBirthDate('1990-12-01')).toBe('1990-12-01');
  });

  test('normalizes DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(normalizeBirthDate('23/08/2003')).toBe('2003-08-23');
    expect(normalizeBirthDate('1/2/1995')).toBe('1995-02-01');
  });

  test('normalizes DD-MM-YYYY to YYYY-MM-DD', () => {
    expect(normalizeBirthDate('23-08-2003')).toBe('2003-08-23');
    expect(normalizeBirthDate('05-11-1988')).toBe('1988-11-05');
  });

  test('normalizes YYYY/MM/DD to YYYY-MM-DD', () => {
    expect(normalizeBirthDate('2003/08/23')).toBe('2003-08-23');
  });

  test('normalizes full ISO timestamp to YYYY-MM-DD', () => {
    expect(normalizeBirthDate('2003-08-23T00:00:00.000Z')).toBe('2003-08-23');
  });

  test('handles null, undefined, or empty string gracefully', () => {
    expect(normalizeBirthDate(null)).toBeNull();
    expect(normalizeBirthDate(undefined)).toBeNull();
    expect(normalizeBirthDate('')).toBeNull();
    expect(normalizeBirthDate('   ')).toBeNull();
  });
});

describe('Profile Utilities — normalizeGender', () => {
  test('normalizes male aliases to Laki-laki', () => {
    expect(normalizeGender('Laki-laki')).toBe('Laki-laki');
    expect(normalizeGender('male')).toBe('Laki-laki');
    expect(normalizeGender('Male')).toBe('Laki-laki');
    expect(normalizeGender('pria')).toBe('Laki-laki');
    expect(normalizeGender('Pria')).toBe('Laki-laki');
    expect(normalizeGender('l')).toBe('Laki-laki');
    expect(normalizeGender('L')).toBe('Laki-laki');
  });

  test('normalizes female aliases to Perempuan', () => {
    expect(normalizeGender('Perempuan')).toBe('Perempuan');
    expect(normalizeGender('female')).toBe('Perempuan');
    expect(normalizeGender('Female')).toBe('Perempuan');
    expect(normalizeGender('wanita')).toBe('Perempuan');
    expect(normalizeGender('Wanita')).toBe('Perempuan');
    expect(normalizeGender('p')).toBe('Perempuan');
    expect(normalizeGender('P')).toBe('Perempuan');
  });

  test('handles null, undefined, or unrecognized values gracefully', () => {
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender(undefined)).toBeNull();
    expect(normalizeGender('')).toBeNull();
    expect(normalizeGender('unknown')).toBeNull();
  });
});

describe('Profile Utilities — normalizePhoneNumber', () => {
  test('removes dashes, spaces, and formatting characters', () => {
    expect(normalizePhoneNumber('0812-3317-7952')).toBe('081233177952');
    expect(normalizePhoneNumber('+62 812 3317 7952')).toBe('+6281233177952');
    expect(normalizePhoneNumber('(0812) 33177952')).toBe('081233177952');
    expect(normalizePhoneNumber('0812.3317.7952')).toBe('081233177952');
  });

  test('handles null, undefined, or empty string', () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber('')).toBeNull();
    expect(normalizePhoneNumber('   ')).toBeNull();
  });
});

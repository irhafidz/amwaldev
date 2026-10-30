import { describe, expect, test } from 'bun:test';
import { safeRedirectPath } from '../../src/lib/auth/safe-redirect';

/** `?redirect=` setelah masuk/daftar hanya boleh path internal (anti open redirect). */

describe('safeRedirectPath', () => {
  test('keeps internal paths, with query and hash', () => {
    for (const path of ['/dashboard', '/riwayat/AMW-1', '/zakat?x=1#a']) {
      expect(safeRedirectPath(path)).toBe(path);
    }
  });

  test('falls back for anything that could leave the site', () => {
    for (const bad of [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'dashboard',
      '',
      undefined,
      null,
    ]) {
      expect(safeRedirectPath(bad)).toBe('/dashboard');
    }
  });

  test('uses the given fallback', () => {
    expect(safeRedirectPath('//x', '/masuk')).toBe('/masuk');
  });
});

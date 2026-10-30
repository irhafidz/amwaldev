import { describe, expect, test } from 'bun:test';
import { resolvePublicOrigin } from '../../src/lib/public-url';

const headers = (values: Record<string, string>) => new Headers(values);

describe('resolvePublicOrigin', () => {
  test('uses the configured public URL first, reduced to its origin', () => {
    expect(
      resolvePublicOrigin({
        configured: ['https://amwal.id/some/path/', 'https://other.example'],
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });

  test('falls through to the legacy names when PUBLIC_APP_URL is unset', () => {
    expect(
      resolvePublicOrigin({
        configured: [undefined, 'https://amwal.id', 'https://old.example'],
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
    expect(
      resolvePublicOrigin({
        configured: [undefined, undefined, 'https://amwal.id'],
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });

  test('without configuration, trusts x-forwarded-host and x-forwarded-proto (Traefik)', () => {
    expect(
      resolvePublicOrigin({
        configured: [],
        headers: headers({
          'x-forwarded-host': 'amwal.id',
          'x-forwarded-proto': 'https',
        }),
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });

  test('takes the first value of a proxy chain and defaults the protocol to https', () => {
    expect(
      resolvePublicOrigin({
        configured: [],
        headers: headers({ 'x-forwarded-host': 'amwal.id, internal:3000' }),
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });

  test('production NEVER yields localhost: a localhost config is ignored in favour of the proxy host', () => {
    expect(
      resolvePublicOrigin({
        configured: ['http://localhost:3000'],
        headers: headers({ 'x-forwarded-host': 'amwal.id' }),
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });

  test.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
  ])(
    'production with only %s and no proxy headers fails loudly instead of redirecting there',
    (local) => {
      expect(() =>
        resolvePublicOrigin({ configured: [local], nodeEnv: 'production' })
      ).toThrow('PUBLIC_APP_URL');
      expect(() =>
        resolvePublicOrigin({ configured: [], nodeEnv: 'production' })
      ).toThrow('localhost');
    }
  );

  test('a localhost forwarded host is also refused in production', () => {
    expect(() =>
      resolvePublicOrigin({
        configured: [],
        headers: headers({ 'x-forwarded-host': 'localhost:3000' }),
        nodeEnv: 'production',
      })
    ).toThrow();
  });

  test('outside production the dev origin is the last resort, and local config is allowed', () => {
    expect(
      resolvePublicOrigin({ configured: [], nodeEnv: 'development' })
    ).toBe('http://localhost:3000');
    expect(resolvePublicOrigin({ configured: [], nodeEnv: 'test' })).toBe(
      'http://localhost:3000'
    );
    expect(
      resolvePublicOrigin({
        configured: ['http://localhost:5173'],
        nodeEnv: 'development',
      })
    ).toBe('http://localhost:5173');
  });

  test('ignores garbage and non-http(s) values', () => {
    expect(
      resolvePublicOrigin({
        configured: [
          'not a url',
          'javascript:alert(1)',
          'ftp://x.example',
          '  ',
        ],
        headers: headers({ 'x-forwarded-host': 'amwal.id' }),
        nodeEnv: 'production',
      })
    ).toBe('https://amwal.id');
  });
});

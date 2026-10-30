import { describe, expect, test } from 'bun:test';
import { decodeJwt } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
} from '../../src/auth/tokens';

/** QA Test#1 (Awan): sesi login 3 jam; cookie dan JWT memakai satu angka. */

describe('access token lifetime', () => {
  test('is 3 hours (10800 s) and shorter than the refresh token', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(10_800);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBeGreaterThan(ACCESS_TOKEN_TTL_SECONDS);
  });

  test('the signed JWT expires exactly one TTL after it was issued', async () => {
    const secret = new TextEncoder().encode('a'.repeat(32));
    const token = await signAccessToken(
      { userId: 'u-1', role: 'WAKIF' },
      secret
    );
    const { iat, exp } = decodeJwt(token);
    expect((exp ?? 0) - (iat ?? 0)).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });
});

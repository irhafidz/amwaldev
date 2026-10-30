import { describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';
import { verifyAccessToken } from '../src/lib/auth/core';
import type { SessionUser } from '../src/lib/auth/types';

// Mirrors the secret resolution in `lib/auth/core.ts` — the token the backend
// signs during login must be accepted here.
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev_secret_only_never_use_in_prod'
);

function sign(
  user: SessionUser,
  expiresIn: string | number = '20m'
): Promise<string> {
  return new SignJWT({ userId: user.userId, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

describe('S10-N-02: session verification (Zone 0)', () => {
  const mockUser: SessionUser = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    role: 'ADMIN',
  };

  it('accepts a token signed by the backend with { userId, role }', async () => {
    const verified = await verifyAccessToken(await sign(mockUser));
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(mockUser.userId);
    expect(verified?.role).toBe(mockUser.role);
  });

  it('rejects an expired access token', async () => {
    const expired = await sign(mockUser, Math.floor(Date.now() / 1000) - 60);
    expect(await verifyAccessToken(expired)).toBeNull();
  });

  it('rejects a malformed access token', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
    expect(await verifyAccessToken(fakeToken)).toBeNull();
  });
});

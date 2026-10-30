import { describe, expect, test } from 'bun:test';
import { generateReferralCode } from '@amwal/core/affiliate/code';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * [I-4] `routes/r/$kode.ts` — pure HTTP redirect route. Calls the actual
 * exported `handle`, same pattern `certificate.test.ts` uses for
 * `routes/api/certificates.$id.ts`.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { handle } = await import('../../src/routes/r/$kode');
const { hashClick } = await import('../../src/lib/affiliate/click-tracking');

const database: Database = createDatabase(connectionUrl);

function referralRequest(
  kode: string,
  extra?: {
    cookie?: string;
    to?: string;
    ip?: string;
    userAgent?: string;
  }
): Request {
  const url = new URL(`http://localhost/r/${kode}`);
  if (extra?.to !== undefined) {
    url.searchParams.set('to', extra.to);
  }
  const headers = new Headers();
  if (extra?.cookie) {
    headers.set('cookie', extra.cookie);
  }
  if (extra?.ip) {
    headers.set('x-forwarded-for', extra.ip);
  }
  if (extra?.userAgent) {
    headers.set('user-agent', extra.userAgent);
  }
  return new Request(url, { headers });
}

async function seedReferrerWithCode(): Promise<{
  userId: string;
  code: string;
}> {
  const runId = ulid().toLowerCase();
  const userId = `p11-redirect-${runId}`;
  const code = generateReferralCode();
  await database.insert(schema.users).values({
    id: userId,
    name: 'Redirect Route Referrer',
    updatedAt: new Date().toISOString(),
  });
  await database.insert(schema.affiliateCodes).values({ userId, code });
  return { userId, code };
}

async function cleanup(seed: { userId: string; code: string }): Promise<void> {
  await database
    .delete(schema.affiliateClicks)
    .where(eq(schema.affiliateClicks.referralCode, seed.code));
  await database
    .delete(schema.affiliateCodes)
    .where(eq(schema.affiliateCodes.userId, seed.userId));
  await database.delete(schema.users).where(eq(schema.users.id, seed.userId));
}

describe('GET /r/$kode [I-4]', () => {
  test('a valid code sets the amwal_ref cookie and redirects home', async () => {
    const seed = await seedReferrerWithCode();
    try {
      const response = await handle({
        request: referralRequest(seed.code),
        params: { kode: seed.code },
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('http://localhost/');
      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`amwal_ref=${seed.code}`);
      expect(setCookie.toLowerCase()).toContain('httponly');
      expect(setCookie.toLowerCase()).toContain('samesite=lax');
    } finally {
      await cleanup(seed);
    }
  });

  test('an unknown code still redirects, without setting a cookie', async () => {
    const unknownCode = generateReferralCode();
    const response = await handle({
      request: referralRequest(unknownCode),
      params: { kode: unknownCode },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('first-touch: an existing amwal_ref cookie is never overwritten', async () => {
    const seed = await seedReferrerWithCode();
    try {
      const response = await handle({
        request: referralRequest(seed.code, {
          cookie: 'amwal_ref=someone-else',
        }),
        params: { kode: seed.code },
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('set-cookie')).toBeNull();
    } finally {
      await cleanup(seed);
    }
  });

  test('a whitelisted relative ?to= is honored', async () => {
    const response = await handle({
      request: referralRequest(generateReferralCode(), {
        to: '/wakaf/program-123',
      }),
      params: { kode: 'irrelevant-unknown-code' },
    });

    expect(response.headers.get('location')).toBe(
      'http://localhost/wakaf/program-123'
    );
  });

  test.each([
    ['//evil.example.com', 'protocol-relative'],
    ['https://evil.example.com', 'absolute URL'],
    ['javascript:alert(1)', 'javascript: scheme'],
    ['/wakaf/../../etc', 'path traversal-shaped but non-matching chars'],
  ])('rejects an open-redirect target (%s — %s)', async (to) => {
    const response = await handle({
      request: referralRequest('any-code-here123', { to }),
      params: { kode: 'any-code-here123' },
    });

    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  test('click tracking: repeated hits from the same device count once per day', async () => {
    const seed = await seedReferrerWithCode();
    try {
      const device = { ip: '203.0.113.7', userAgent: 'BunReferralTest/1.0' };

      const first = await handle({
        request: referralRequest(seed.code, device),
        params: { kode: seed.code },
      });
      const second = await handle({
        request: referralRequest(seed.code, device),
        params: { kode: seed.code },
      });

      expect(first.status).toBe(302);
      expect(second.status).toBe(302);

      const rows = await database
        .select({ id: schema.affiliateClicks.id })
        .from(schema.affiliateClicks)
        .where(eq(schema.affiliateClicks.referralCode, seed.code));

      expect(rows).toHaveLength(1);
    } finally {
      await cleanup(seed);
    }
  });

  test('click tracking: a different device on the same day is a separate click', async () => {
    const seed = await seedReferrerWithCode();
    try {
      await handle({
        request: referralRequest(seed.code, {
          ip: '203.0.113.7',
          userAgent: 'BunReferralTest/1.0',
        }),
        params: { kode: seed.code },
      });
      await handle({
        request: referralRequest(seed.code, {
          ip: '203.0.113.9',
          userAgent: 'OtherBrowser/2.0',
        }),
        params: { kode: seed.code },
      });

      const rows = await database
        .select({ id: schema.affiliateClicks.id })
        .from(schema.affiliateClicks)
        .where(eq(schema.affiliateClicks.referralCode, seed.code));

      expect(rows).toHaveLength(2);
    } finally {
      await cleanup(seed);
    }
  });

  test('click tracking: an existing amwal_ref cookie still counts the click', async () => {
    const seed = await seedReferrerWithCode();
    try {
      const response = await handle({
        request: referralRequest(seed.code, {
          cookie: 'amwal_ref=someone-else',
          ip: '203.0.113.11',
          userAgent: 'BunReferralTest/1.0',
        }),
        params: { kode: seed.code },
      });

      expect(response.headers.get('set-cookie')).toBeNull();

      const rows = await database
        .select({ id: schema.affiliateClicks.id })
        .from(schema.affiliateClicks)
        .where(eq(schema.affiliateClicks.referralCode, seed.code));

      expect(rows).toHaveLength(1);
    } finally {
      await cleanup(seed);
    }
  });

  test('click tracking: an unknown code writes no click row', async () => {
    const unknownCode = generateReferralCode();
    await handle({
      request: referralRequest(unknownCode, {
        ip: '203.0.113.13',
        userAgent: 'BunReferralTest/1.0',
      }),
      params: { kode: unknownCode },
    });

    const rows = await database
      .select({ id: schema.affiliateClicks.id })
      .from(schema.affiliateClicks)
      .where(eq(schema.affiliateClicks.referralCode, unknownCode));

    expect(rows).toHaveLength(0);
  });
});

describe('hashClick [I-4]', () => {
  const wibMorning = new Date('2026-05-04T02:00:00.000Z'); // 09:00 WIB
  const wibNextMorning = new Date('2026-05-05T02:00:00.000Z'); // 09:00 WIB +1d

  test('is stable for the same IP, User-Agent, and WIB day', () => {
    expect(hashClick('1.2.3.4', 'UA/1', wibMorning)).toBe(
      hashClick('1.2.3.4', 'UA/1', wibMorning)
    );
  });

  test('changes across WIB days for the same device', () => {
    expect(hashClick('1.2.3.4', 'UA/1', wibMorning)).not.toBe(
      hashClick('1.2.3.4', 'UA/1', wibNextMorning)
    );
  });

  test('splits the WIB day at midnight (16:59 vs 17:01 UTC)', () => {
    const justBeforeMidnight = new Date('2026-05-04T16:59:00.000Z');
    const justAfterMidnight = new Date('2026-05-04T17:01:00.000Z');
    expect(hashClick('1.2.3.4', 'UA/1', justBeforeMidnight)).not.toBe(
      hashClick('1.2.3.4', 'UA/1', justAfterMidnight)
    );
  });

  test('changes when the User-Agent changes', () => {
    expect(hashClick('1.2.3.4', 'UA/1', wibMorning)).not.toBe(
      hashClick('1.2.3.4', 'UA/2', wibMorning)
    );
  });

  test('changes when the IP changes', () => {
    expect(hashClick('1.2.3.4', 'UA/1', wibMorning)).not.toBe(
      hashClick('1.2.3.5', 'UA/1', wibMorning)
    );
  });
});

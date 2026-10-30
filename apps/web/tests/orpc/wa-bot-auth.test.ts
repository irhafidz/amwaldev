import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Regression for the admin "http-401" from wa-bot: apps/web sent the secret
 * twice (`X-Internal-Secret` and `x-internal-secret`), which `Headers` merges
 * into `"secret, secret"`. The fake bot below behaves like the real one: it
 * accepts only a header that equals its secret exactly.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');
const { env } = await import('../../src/env/server');
const { cleanSecret } = await import('../../src/lib/whatsapp/bot-client');
const { createTestCaller } = await import('./test-utils');

const database = createDatabase(connectionUrl);
const seenSecrets: (string | null)[] = [];
let expectedSecret = cleanSecret(env.INTERNAL_SECRET);

const fakeBot = Bun.serve({
  port: 0,
  fetch(request) {
    const presented = request.headers.get('x-internal-secret');
    seenSecrets.push(presented);
    if (presented !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ status: 'CONNECTED', phone: '6281234567890' });
  },
});

const originalUrl = process.env.BAILEYS_SERVICE_URL;
process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeBot.port}`;

afterAll(() => {
  process.env.BAILEYS_SERVICE_URL = originalUrl;
  fakeBot.stop(true);
});

async function adminContext() {
  return await createTestCaller({
    database,
    user: { userId: 'wa-auth-admin', role: 'ADMIN' },
  });
}

describe('wa-bot internal auth', () => {
  test('the secret travels exactly once, byte for byte', async () => {
    seenSecrets.length = 0;

    const result = await call(router.admin.wa.getStatus, undefined, {
      context: await adminContext(),
    });

    expect(result.data.status).toBe('CONNECTED');
    expect(seenSecrets).toEqual([expectedSecret]);
    expect(seenSecrets[0]).not.toContain(',');
  });

  test('the legacy admin.settings proxy authenticates the same way', async () => {
    const result = await call(router.admin.settings.baileysStatus, undefined, {
      context: await adminContext(),
    });

    expect((result.data as { status: string }).status).toBe('CONNECTED');
  });

  test('a mismatched secret is explained, not a bare http-401', async () => {
    expectedSecret = 'a-different-secret-on-the-bot-side';
    try {
      const result = await call(router.admin.wa.getStatus, undefined, {
        context: await adminContext(),
      });

      expect(result.data.status).toBe('SERVICE_OFFLINE');
      expect(result.data.reason).toContain('http-401');
      expect(result.data.reason).toContain('INTERNAL_SECRET');
    } finally {
      expectedSecret = cleanSecret(env.INTERNAL_SECRET);
    }
  });
});

describe('cleanSecret', () => {
  test('trims whitespace and surrounding quotes only', () => {
    expect(cleanSecret('  abc  ')).toBe('abc');
    expect(cleanSecret('"abc"')).toBe('abc');
    expect(cleanSecret("'abc'")).toBe('abc');
    expect(cleanSecret(' "abc" ')).toBe('abc');
    expect(cleanSecret('a"b"c')).toBe('a"b"c');
    expect(cleanSecret('"abc')).toBe('"abc');
  });
});

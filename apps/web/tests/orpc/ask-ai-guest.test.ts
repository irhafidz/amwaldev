import { beforeEach, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * QA-09: Tanya Amwal terbuka untuk tamu — tanpa riwayat, dengan pembatas laju
 * per IP, kuota harian, dan sanitasi/panjang pertanyaan.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { resetGuestAskLimits } = await import(
  '../../src/lib/ask-ai-guest-limit'
);

const database: Database = createDatabase(connectionUrl);

async function ask(message: string, ip = '203.0.113.9') {
  const context = await createTestCaller({
    database,
    user: null,
    headers: { 'x-forwarded-for': ip },
  });
  return await call(router.askAi.ask, { message }, { context });
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ORPCError<string, unknown>;
  }
  throw new Error('expected rejection');
}

describe('askAi.ask (guest)', () => {
  beforeEach(() => resetGuestAskLimits());

  test('answers a guest without storing a conversation', async () => {
    const before = await database.select().from(schema.chatbotConversations);
    const result = await ask('Berapa nisab zakat penghasilan?');
    expect(result.data.role).toBe('ASSISTANT');
    expect(result.data.content.length).toBeGreaterThan(10);
    expect(result.data.disclaimer).toContain('bukan fatwa');
    expect('conversationId' in result.data).toBe(false);
    const after = await database.select().from(schema.chatbotConversations);
    expect(after.length).toBe(before.length);
  });

  test('still requires login for the stored-history path', async () => {
    const context = await createTestCaller({ database, user: null });
    const error = await failure(
      call(router.askAi.send, { message: 'halo apa kabar' }, { context })
    );
    expect(error.status).toBe(401);
  });

  test('rejects questions longer than the guest cap (300) and blank ones', async () => {
    expect((await failure(ask('a'.repeat(301)))).status).toBe(400);
    expect((await failure(ask('  \n\t  '))).status).toBe(400);
    expect((await failure(ask('ab'))).status).toBe(400);
  });

  test('strips control characters and collapses whitespace before it counts', async () => {
    // 290 huruf + sisipan kontrol/spasi berlebih: setelah dibersihkan <= 300.
    const noisy = `${'a'.repeat(290)}\u0000\u0007   \n\n\t   ok`;
    const result = await ask(noisy);
    expect(result.data.content.length).toBeGreaterThan(0);
  });

  test('throttles a burst from one IP, but not another IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      await ask(`pertanyaan nisab ke ${i}`);
    }
    const blocked = await failure(ask('pertanyaan nisab ke 6'));
    expect(blocked.status).toBe(429);
    expect(blocked.message).toContain('Terlalu banyak pertanyaan');
    await ask('pertanyaan nisab dari ip lain', '198.51.100.7');
  });
});

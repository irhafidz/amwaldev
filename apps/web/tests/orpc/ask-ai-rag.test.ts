import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * `askAi.send` against a fake amwal-rag: answers are stored with their sources,
 * and every failure is a friendly, typed error that leaves no orphan message.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { env } = await import('../../src/env/server');

const database: Database = createDatabase(connectionUrl);
const userId = `rag-${ulid().toLowerCase()}`;
const received: { body: unknown; key: string | null }[] = [];
let behaviour: 'ok' | number | 'slow' = 'ok';

const fakeRag = Bun.serve({
  port: 0,
  async fetch(request) {
    received.push({
      body: await request.json().catch(() => null),
      key: request.headers.get('x-api-key'),
    });
    if (behaviour === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (typeof behaviour === 'number') {
      return Response.json(
        { request_id: 'r', error: { code: 'e', message: 'detail internal' } },
        { status: behaviour }
      );
    }
    return Response.json({
      request_id: 'r',
      answer: 'Nisab zakat penghasilan setara 85 gram emas.',
      sources: [{ sumber: 'Panduan Zakat', unit: 'Bab 2', halaman: 14 }],
    });
  },
});

const original = {
  key: env.RAG_API_KEY,
  timeout: env.RAG_TIMEOUT_MS,
  url: env.RAG_SERVICE_URL,
};
const mutableEnv = env as {
  RAG_API_KEY?: string;
  RAG_SERVICE_URL: string;
  RAG_TIMEOUT_MS: number;
};

beforeAll(async () => {
  mutableEnv.RAG_API_KEY = 'kunci-uji';
  mutableEnv.RAG_SERVICE_URL = `http://127.0.0.1:${fakeRag.port}`;
  mutableEnv.RAG_TIMEOUT_MS = 5000;
  await database.insert(schema.users).values({
    id: userId,
    name: 'Penanya RAG',
    updatedAt: new Date().toISOString(),
  });
});

afterAll(async () => {
  mutableEnv.RAG_API_KEY = original.key;
  mutableEnv.RAG_SERVICE_URL = original.url;
  mutableEnv.RAG_TIMEOUT_MS = original.timeout;
  fakeRag.stop(true);

  const conversations = await database
    .select({ id: schema.chatbotConversations.id })
    .from(schema.chatbotConversations)
    .where(eq(schema.chatbotConversations.userId, userId));
  const ids = conversations.map((row) => row.id);
  if (ids.length > 0) {
    await database
      .delete(schema.chatbotMessages)
      .where(inArray(schema.chatbotMessages.conversationId, ids));
    await database
      .delete(schema.chatbotConversations)
      .where(inArray(schema.chatbotConversations.id, ids));
  }
  await database.delete(schema.users).where(eq(schema.users.id, userId));
});

async function send(message: string, conversationId?: string) {
  const context = await createTestCaller({
    database,
    user: { userId, role: 'WAKIF' },
  });
  return await call(
    router.askAi.send,
    { message, conversationId },
    { context }
  );
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ORPCError<string, unknown>;
  }
  throw new Error('expected rejection');
}

async function storedMessages() {
  const conversations = await database
    .select({ id: schema.chatbotConversations.id })
    .from(schema.chatbotConversations)
    .where(eq(schema.chatbotConversations.userId, userId));
  if (conversations.length === 0) {
    return [];
  }
  return await database
    .select()
    .from(schema.chatbotMessages)
    .where(
      inArray(
        schema.chatbotMessages.conversationId,
        conversations.map((row) => row.id)
      )
    );
}

describe('askAi.send with the RAG service', () => {
  test('forwards only the question with the API key, and stores the answer with its sources', async () => {
    behaviour = 'ok';
    received.length = 0;

    const result = await send('Berapa nisab zakat penghasilan?');

    expect(received).toEqual([
      {
        body: { question: 'Berapa nisab zakat penghasilan?' },
        key: 'kunci-uji',
      },
    ]);
    expect(result.data.content).toContain('85 gram emas');
    expect(result.data.content).toContain('Panduan Zakat (Bab 2, hlm. 14)');
    expect(result.data.sources).toEqual([
      { sumber: 'Panduan Zakat', unit: 'Bab 2', halaman: 14 },
    ]);

    const rows = await storedMessages();
    expect(rows.map((row) => row.role).sort()).toEqual(['ASSISTANT', 'USER']);
  });

  test('a busy service becomes 429 with a friendly message and stores nothing', async () => {
    const before = (await storedMessages()).length;
    behaviour = 429;

    const error = await failure(send('Apa syarat sah wakaf uang?'));

    expect(error.status).toBe(429);
    expect(error.message).toContain('Coba lagi');
    expect(error.message).not.toContain('detail internal');
    expect((await storedMessages()).length).toBe(before);
  });

  test('an offline or failing service becomes 503 without leaking details', async () => {
    const before = (await storedMessages()).length;

    behaviour = 503;
    const failing = await failure(send('Apa syarat sah wakaf uang?'));
    expect(failing.status).toBe(503);
    expect(failing.message).toBe(
      'Asisten AI sedang tidak tersedia. Silakan coba lagi nanti.'
    );

    mutableEnv.RAG_SERVICE_URL = 'http://127.0.0.1:1';
    const offline = await failure(send('Apa syarat sah wakaf uang?'));
    expect(offline.status).toBe(503);
    mutableEnv.RAG_SERVICE_URL = `http://127.0.0.1:${fakeRag.port}`;

    expect((await storedMessages()).length).toBe(before);
  });

  test('a rejected API key is a 503 for the user (a deployment problem, not theirs)', async () => {
    behaviour = 401;

    const error = await failure(send('Apa syarat sah wakaf uang?'));

    expect(error.status).toBe(503);
  });

  test('a slow service becomes 504', async () => {
    behaviour = 'slow';
    mutableEnv.RAG_TIMEOUT_MS = 80;

    const error = await failure(send('Apa syarat sah wakaf uang?'));
    mutableEnv.RAG_TIMEOUT_MS = 5000;

    expect(error.status).toBe(504);
  });

  test('questions outside 3-500 characters are rejected before any call', async () => {
    behaviour = 'ok';
    received.length = 0;

    expect((await failure(send('ab'))).status).toBe(400);
    expect((await failure(send('x'.repeat(501)))).status).toBe(400);
    expect(received).toHaveLength(0);
  });
});

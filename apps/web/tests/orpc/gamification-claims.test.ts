import { afterAll, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { eq, like } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Audit C3: READ/WATCH claims must point at real published content, pay once
 * per content, and stop after the daily limit.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { DAILY_CONTENT_CLAIM_LIMIT } = await import(
  '@amwal/core/gamification/ledger'
);
const { createTestCaller } = await import('./test-utils');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const userId = `c3-${runId}-user`;
const contentPrefix = `c3-${runId}-content`;

async function createContent(id: string, status: string) {
  await database.insert(schema.educationContents).values({
    id,
    judul: `Konten ${id}`,
    tipe: 'VIDEO',
    status,
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ORPCError<string, unknown>;
  }
  return null;
}

describe('gamification content claims (audit C3)', () => {
  afterAll(async () => {
    await database
      .delete(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, userId));
    await database
      .delete(schema.educationContents)
      .where(like(schema.educationContents.id, `${contentPrefix}%`));
    await database.delete(schema.users).where(eq(schema.users.id, userId));
  });

  test('setup user', async () => {
    await database.insert(schema.users).values({
      id: userId,
      name: 'Donor C3',
      updatedAt: new Date().toISOString(),
    });
  });

  test('made-up and unpublished content ids are rejected', async () => {
    const context = await createTestCaller({
      database,
      user: { role: 'WAKIF', userId },
    });
    await createContent(`${contentPrefix}-draft`, 'DRAFT');

    const ghost = await rejection(
      call(
        router.gamification.claimWatch,
        { contentId: `${contentPrefix}-ghost` },
        { context }
      )
    );
    const draft = await rejection(
      call(
        router.gamification.claimRead,
        { contentId: `${contentPrefix}-draft`, dwellSeconds: 60 },
        { context }
      )
    );

    expect(ghost?.status).toBe(404);
    expect(draft?.status).toBe(404);
    const rows = await database
      .select({ id: schema.gamificationPointLedgers.id })
      .from(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, userId));
    expect(rows).toHaveLength(0);
  });

  test('published content pays once, then the daily limit stops new ids', async () => {
    const context = await createTestCaller({
      database,
      user: { role: 'WAKIF', userId },
    });
    const ids = Array.from(
      { length: DAILY_CONTENT_CLAIM_LIMIT + 1 },
      (_, index) => `${contentPrefix}-pub-${index}`
    );
    await Promise.all(ids.map((id) => createContent(id, 'PUBLISHED')));

    const first = await call(
      router.gamification.claimWatch,
      { contentId: ids[0] as string },
      { context }
    );
    const replay = await call(
      router.gamification.claimWatch,
      { contentId: ids[0] as string },
      { context }
    );
    expect(first.status).toBe('CLAIMED');
    expect(replay.status).toBe('ALREADY_CLAIMED');

    for (const id of ids.slice(1, DAILY_CONTENT_CLAIM_LIMIT)) {
      const result = await call(
        router.gamification.claimWatch,
        { contentId: id },
        { context }
      );
      expect(result.status).toBe('CLAIMED');
    }

    const capped = await rejection(
      call(
        router.gamification.claimWatch,
        { contentId: ids.at(-1) as string },
        { context }
      )
    );
    expect(capped?.status).toBe(429);

    // A replay of something already paid is still a value, not an error.
    const stillDuplicate = await call(
      router.gamification.claimWatch,
      { contentId: ids[0] as string },
      { context }
    );
    expect(stillDuplicate.status).toBe('ALREADY_CLAIMED');
  });
});

describe('education.articles.claimReadingXp (QA-07)', () => {
  const readerId = `c3-${runId}-reader`;
  const articleId = crypto.randomUUID();

  afterAll(async () => {
    await database
      .delete(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, readerId));
    await database
      .delete(schema.educationArticles)
      .where(eq(schema.educationArticles.id, articleId));
    await database.delete(schema.users).where(eq(schema.users.id, readerId));
  });

  test('pays the same +50 the catalog badge promises, once per article', async () => {
    const { ACTIVITY_POINTS } = await import('@amwal/core/gamification/points');
    await database.insert(schema.users).values({
      id: readerId,
      name: 'Pembaca QA-07',
      updatedAt: new Date().toISOString(),
    });
    await database.insert(schema.educationArticles).values({
      id: articleId,
      title: 'Artikel XP Baca',
      slug: `c3-${runId}-artikel-xp-baca`,
      content: 'Isi artikel.',
    });
    const context = await createTestCaller({
      database,
      user: { role: 'WAKIF', userId: readerId },
    });

    const first = await call(
      router.education.articles.claimReadingXp,
      { articleId },
      { context }
    );
    expect(ACTIVITY_POINTS.READ).toBe(50);
    expect(first.data).toEqual({
      success: true,
      xpAwarded: ACTIVITY_POINTS.READ,
      isNewReward: true,
    });

    const again = await call(
      router.education.articles.claimReadingXp,
      { articleId },
      { context }
    );
    expect(again.data.isNewReward).toBe(false);
    expect(again.data.xpAwarded).toBe(0);

    const rows = await database
      .select({ points: schema.gamificationPointLedgers.pointsEarned })
      .from(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, readerId));
    expect(rows.map((row) => Number(row.points))).toEqual([
      ACTIVITY_POINTS.READ,
    ]);
  });
});

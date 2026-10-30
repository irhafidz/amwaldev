import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** content.getLatestNews — public feed behind the dashboard "Berita Terbaru". */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const id = (n: number) => `news-${runId}-${n}`;
const NEXT_YEAR = `${new Date().getUTCFullYear() + 1}`;

beforeAll(async () => {
  // Future-dated so these rows always sort ahead of whatever else is in the DB.
  const base = {
    tipe: 'ARTIKEL' as const,
    kategori: 'Kegiatan',
    coverUrl: 'https://example.com/cover.jpg',
  };
  await database.insert(schema.educationContents).values([
    {
      ...base,
      id: id(1),
      judul: `Berita Terbaru ${runId}`,
      body: '## Penyaluran **wakaf** sumur\n\nDana telah disalurkan kepada warga desa.',
      status: 'PUBLISHED',
      publishedAt: `${NEXT_YEAR}-03-03 10:00:00`,
      slug: `terbaru-${runId}`,
    },
    {
      ...base,
      id: id(2),
      judul: `Berita Lama ${runId}`,
      body: 'Isi berita lama.',
      status: 'PUBLISHED',
      publishedAt: `${NEXT_YEAR}-01-01 10:00:00`,
    },
    {
      ...base,
      id: id(3),
      judul: `Masih Draf ${runId}`,
      status: 'DRAFT',
      publishedAt: `${NEXT_YEAR}-09-09 10:00:00`,
    },
    {
      ...base,
      id: id(4),
      judul: `Diarsipkan ${runId}`,
      status: 'ARCHIVED',
      publishedAt: `${NEXT_YEAR}-08-08 10:00:00`,
    },
    {
      id: id(5),
      judul: `Video ${runId}`,
      tipe: 'VIDEO',
      status: 'PUBLISHED',
      publishedAt: `${NEXT_YEAR}-07-07 10:00:00`,
    },
  ]);
});

afterAll(async () => {
  await database
    .delete(schema.educationContents)
    .where(inArray(schema.educationContents.id, [1, 2, 3, 4, 5].map(id)));
});

describe('content.getLatestNews', () => {
  test('is public, newest first, and returns only published articles', async () => {
    const guest = await createTestCaller({ database, user: null });
    const { data } = await call(
      router.content.getLatestNews,
      { limit: 20 },
      { context: guest }
    );
    const ours = data.filter((item) => item.id.startsWith(`news-${runId}`));

    expect(ours.map((item) => item.id)).toEqual([id(1), id(2)]);
    expect(ours[0]).toMatchObject({
      title: `Berita Terbaru ${runId}`,
      thumbnailUrl: 'https://example.com/cover.jpg',
      slug: `terbaru-${runId}`,
    });
    expect(ours[0]?.excerpt).toBe(
      'Penyaluran wakaf sumur Dana telah disalurkan kepada warga desa.'
    );
    expect(ours[0]?.publishedAt).toBe(`${NEXT_YEAR}-03-03T10:00:00.000Z`);
  });

  test('defaults to the 5 most recent and honours the limit', async () => {
    const guest = await createTestCaller({ database, user: null });
    const defaults = await call(
      router.content.getLatestNews,
      {},
      { context: guest }
    );
    expect(defaults.data.length).toBeLessThanOrEqual(5);
    expect(defaults.data[0]?.id).toBe(id(1));

    const one = await call(
      router.content.getLatestNews,
      { limit: 1 },
      { context: guest }
    );
    expect(one.data).toHaveLength(1);
  });

  test('unrelated drafts never leak', async () => {
    const guest = await createTestCaller({ database, user: null });
    const { data } = await call(
      router.content.getLatestNews,
      { limit: 20 },
      { context: guest }
    );
    const ids = new Set(data.map((item) => item.id));
    expect(ids.has(id(3))).toBe(false);
    expect(ids.has(id(4))).toBe(false);
    expect(ids.has(id(5))).toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * `admin.education.stats` (real COUNT/SUM aggregation for the header cards)
 * and `admin.education.categories.*` (CRUD against `education_categories`,
 * including the delete guardrail for categories still referenced by an
 * article or a video).
 */

const connectionUrl = assertTestDatabase();
const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

async function createAdminUser(): Promise<string> {
  const adminId = `p17edu-${ulid().toLowerCase()}-admin`;
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin Edukasi Test',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  return adminId;
}

describe('admin.education.stats', () => {
  test('counts real articles/videos and sums likes_count from both', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const articleId = crypto.randomUUID();
    const videoId = crypto.randomUUID();

    try {
      await database.insert(schema.educationArticles).values({
        id: articleId,
        title: 'Artikel Uji Statistik',
        slug: `artikel-uji-statistik-${Date.now()}`,
        content: 'Konten uji statistik.',
        likesCount: 7,
      });
      await database.insert(schema.educationVideos).values({
        id: videoId,
        title: 'Video Uji Statistik',
        sourceType: 'embed',
        videoUrl: 'https://youtube.com/watch?v=test',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        likesCount: 3,
      });

      const before = await call(router.admin.education.stats, {}, { context });

      const after1 = await database
        .select({ id: schema.educationArticles.id })
        .from(schema.educationArticles)
        .where(eq(schema.educationArticles.id, articleId));
      expect(after1).toHaveLength(1);

      expect(before.data.totalArtikel).toBeGreaterThanOrEqual(1);
      expect(before.data.totalVideo).toBeGreaterThanOrEqual(1);
      expect(before.data.totalLike).toBeGreaterThanOrEqual(10);
    } finally {
      await database
        .delete(schema.educationArticles)
        .where(eq(schema.educationArticles.id, articleId));
      await database
        .delete(schema.educationVideos)
        .where(eq(schema.educationVideos.id, videoId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('admin.education.videos', () => {
  test('create persists an embed video with the resolved category and no duration column', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const category = await call(
      router.admin.education.categories.create,
      { name: 'Kategori Uji Video Create', type: 'video' },
      { context }
    );

    let videoId: string | undefined;
    try {
      const created = await call(
        router.admin.education.videos.create,
        {
          title: 'Video Uji Embed',
          categoryId: category.data.id,
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          speaker: 'Ustadz Uji Coba',
          description: 'Deskripsi uji coba video embed',
        },
        { context }
      );
      videoId = created.data.id;

      expect(created.data.categoryId).toBe(category.data.id);
      expect(created.data.sourceType).toBe('embed');
      expect(created.data.status).toBe('published');
      expect('duration' in created.data).toBe(false);

      const [row] = await database
        .select()
        .from(schema.educationVideos)
        .where(eq(schema.educationVideos.id, videoId));
      expect(row?.title).toBe('Video Uji Embed');
    } finally {
      if (videoId) {
        await database
          .delete(schema.educationVideos)
          .where(eq(schema.educationVideos.id, videoId));
      }
      await database
        .delete(schema.educationCategories)
        .where(eq(schema.educationCategories.id, category.data.id));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('admin.education.videos list & delete', () => {
  test('list joins category name and orders by newest first; delete removes the row', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const category = await call(
      router.admin.education.categories.create,
      { name: 'Kategori Uji List Video', type: 'video' },
      { context }
    );

    let videoId: string | undefined;
    try {
      const created = await call(
        router.admin.education.videos.create,
        {
          title: 'Video Uji List & Delete',
          categoryId: category.data.id,
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        },
        { context }
      );
      videoId = created.data.id;

      const list = await call(
        router.admin.education.videos.list,
        {},
        { context }
      );
      const row = list.data.find((v) => v.id === videoId);
      expect(row).toBeDefined();
      expect(row?.categoryName).toBe('Kategori Uji List Video');
      expect(list.data[0]?.id).toBe(videoId);

      const deleted = await call(
        router.admin.education.videos.delete,
        { id: videoId },
        { context }
      );
      expect(deleted.success).toBe(true);

      const afterDelete = await call(
        router.admin.education.videos.list,
        {},
        { context }
      );
      expect(afterDelete.data.some((v) => v.id === videoId)).toBe(false);
      videoId = undefined;

      await expect(
        call(
          router.admin.education.videos.delete,
          { id: created.data.id },
          { context }
        )
      ).rejects.toThrow(ORPCError);
    } finally {
      if (videoId) {
        await database
          .delete(schema.educationVideos)
          .where(eq(schema.educationVideos.id, videoId));
      }
      await database
        .delete(schema.educationCategories)
        .where(eq(schema.educationCategories.id, category.data.id));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('admin.education.videos update', () => {
  test('updates video title, author/speaker, category, and videoUrl', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const category = await call(
      router.admin.education.categories.create,
      { name: 'Kategori Uji Video Update', type: 'video' },
      { context }
    );

    let videoId: string | undefined;
    try {
      const created = await call(
        router.admin.education.videos.create,
        {
          title: 'Video Awal',
          categoryId: category.data.id,
          videoUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
          thumbnailUrl: 'https://example.com/old.jpg',
          speaker: 'Ustadz Lama',
        },
        { context }
      );
      videoId = created.data.id;

      const updated = await call(
        router.admin.education.videos.update,
        {
          id: videoId,
          title: 'Video Hasil Edit',
          categoryId: category.data.id,
          videoUrl: 'https://youtu.be/bbbbbbbbbbb?t=5',
          authorName: 'Ustadz Baru',
          thumbnailUrl: 'https://example.com/new.jpg',
          description: 'Deskripsi baru hasil edit',
        },
        { context }
      );

      expect(updated.data.title).toBe('Video Hasil Edit');
      expect(updated.data.sourceType).toBe('embed');
      // Tautan apa pun dinormalkan ke bentuk baku youtube.com/watch?v=ID.
      expect(updated.data.videoUrl).toBe(
        'https://www.youtube.com/watch?v=bbbbbbbbbbb'
      );
      expect(updated.data.speaker).toBe('Ustadz Baru');
      expect(updated.data.description).toBe('Deskripsi baru hasil edit');

      const [row] = await database
        .select()
        .from(schema.educationVideos)
        .where(eq(schema.educationVideos.id, videoId));
      expect(row?.title).toBe('Video Hasil Edit');
      expect(row?.sourceType).toBe('embed');
      expect(row?.speaker).toBe('Ustadz Baru');
    } finally {
      if (videoId) {
        await database
          .delete(schema.educationVideos)
          .where(eq(schema.educationVideos.id, videoId));
      }
      await database
        .delete(schema.educationCategories)
        .where(eq(schema.educationCategories.id, category.data.id));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('admin.education.articles', () => {
  test('create persists the article and its quiz questions in one transaction; list joins category + quiz count; delete cascades quiz rows and unblocks the category guardrail', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const category = await call(
      router.admin.education.categories.create,
      { name: 'Kategori Uji Artikel', type: 'article' },
      { context }
    );

    let articleId: string | undefined;
    try {
      const created = await call(
        router.admin.education.articles.create,
        {
          title: 'Artikel Uji Kuis',
          categoryId: category.data.id,
          content: 'Konten uji artikel dengan kuis.',
          quiz: [
            {
              question: 'Soal 1?',
              options: [
                { key: 'A', text: 'Opsi A' },
                { key: 'B', text: 'Opsi B' },
              ],
              correctKey: 'A',
              explanation: 'Dalil soal 1.',
            },
            {
              question: 'Soal 2?',
              options: [
                { key: 'A', text: 'Opsi A' },
                { key: 'B', text: 'Opsi B' },
              ],
              correctKey: 'B',
            },
          ],
        },
        { context }
      );
      articleId = created.data.id;
      expect(created.data.categoryId).toBe(category.data.id);
      expect('excerpt' in created.data).toBe(false);

      const quizRows = await database
        .select()
        .from(schema.educationQuizQuestions)
        .where(eq(schema.educationQuizQuestions.articleId, articleId));
      expect(quizRows).toHaveLength(2);
      expect('points' in quizRows[0]).toBe(false);

      const list = await call(
        router.admin.education.articles.list,
        {},
        { context }
      );
      const row = list.data.find((a) => a.id === articleId);
      expect(row?.categoryName).toBe('Kategori Uji Artikel');
      expect(row?.quizQuestionsCount).toBe(2);
      expect(list.data[0]?.id).toBe(articleId);

      // Kategori masih dipakai artikel aktif -> guardrail menolak hapus.
      await expect(
        call(
          router.admin.education.categories.delete,
          { id: category.data.id },
          { context }
        )
      ).rejects.toThrow(ORPCError);

      const deleted = await call(
        router.admin.education.articles.delete,
        { id: articleId },
        { context }
      );
      expect(deleted.success).toBe(true);
      articleId = undefined;

      const quizRowsAfterDelete = await database
        .select()
        .from(schema.educationQuizQuestions)
        .where(eq(schema.educationQuizQuestions.articleId, created.data.id));
      expect(quizRowsAfterDelete).toHaveLength(0);

      // Kategori sekarang boleh dihapus karena tidak ada artikel lagi.
      const categoryDeleted = await call(
        router.admin.education.categories.delete,
        { id: category.data.id },
        { context }
      );
      expect(categoryDeleted.success).toBe(true);
    } finally {
      if (articleId) {
        await database
          .delete(schema.educationArticles)
          .where(eq(schema.educationArticles.id, articleId));
      }
      await database
        .delete(schema.educationCategories)
        .where(eq(schema.educationCategories.id, category.data.id));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('admin.education.categories', () => {
  test('create/update/list round-trip, and delete is rejected while a video still uses the category', async () => {
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const created = await call(
      router.admin.education.categories.create,
      { name: 'Kategori Uji CRUD', type: 'video' },
      { context }
    );
    expect(created.data.slug).toBe('kategori-uji-crud');

    const videoId = crypto.randomUUID();
    try {
      const updated = await call(
        router.admin.education.categories.update,
        { id: created.data.id, name: 'Kategori Uji CRUD (Direvisi)' },
        { context }
      );
      expect(updated.data.name).toBe('Kategori Uji CRUD (Direvisi)');

      const list = await call(
        router.admin.education.categories.list,
        { type: 'video' },
        { context }
      );
      expect(list.data.some((c) => c.id === created.data.id)).toBe(true);

      await database.insert(schema.educationVideos).values({
        id: videoId,
        categoryId: created.data.id,
        title: 'Video Pakai Kategori Uji',
        sourceType: 'embed',
        videoUrl: 'https://youtube.com/watch?v=inuse',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });

      await expect(
        call(
          router.admin.education.categories.delete,
          { id: created.data.id },
          { context }
        )
      ).rejects.toThrow(ORPCError);

      await database
        .delete(schema.educationVideos)
        .where(eq(schema.educationVideos.id, videoId));

      // Now that nothing references it, delete succeeds.
      const deleted = await call(
        router.admin.education.categories.delete,
        { id: created.data.id },
        { context }
      );
      expect(deleted.success).toBe(true);
    } finally {
      await database
        .delete(schema.educationVideos)
        .where(eq(schema.educationVideos.id, videoId));
      await database
        .delete(schema.educationCategories)
        .where(eq(schema.educationCategories.id, created.data.id));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });
});

describe('video edukasi: sematan YouTube saja', () => {
  const ID = 'dQw4w9WgXcQ';

  async function adminContext() {
    const adminUserId = await createAdminUser();
    return {
      adminUserId,
      context: await createTestCaller({
        database,
        user: { userId: adminUserId, role: 'ADMIN' },
      }),
    };
  }

  async function removeAdmin(adminUserId: string) {
    await database.delete(schema.users).where(eq(schema.users.id, adminUserId));
  }

  test('create normalises any YouTube link, forces embed and fills the official thumbnail', async () => {
    const { adminUserId, context } = await adminContext();
    let videoId: string | undefined;
    try {
      const created = await call(
        router.admin.education.videos.create,
        {
          title: 'Video Tautan Pendek',
          videoUrl: `https://youtu.be/${ID}?t=12`,
        },
        { context }
      );
      videoId = created.data.id;

      expect(created.data.sourceType).toBe('embed');
      expect(created.data.videoUrl).toBe(
        `https://www.youtube.com/watch?v=${ID}`
      );
      expect(created.data.thumbnailUrl).toBe(
        `https://img.youtube.com/vi/${ID}/hqdefault.jpg`
      );
    } finally {
      if (videoId) {
        await database
          .delete(schema.educationVideos)
          .where(eq(schema.educationVideos.id, videoId));
      }
      await removeAdmin(adminUserId);
    }
  });

  test.each([
    ['an mp4 file', 'https://cdn.example.com/kajian.mp4'],
    ['another video site', 'https://vimeo.com/123456789'],
    ['a spoofed host', `https://www.youtube.com.evil.example/watch?v=${ID}`],
    ['a userinfo trick', `https://youtube.com@evil.example/watch?v=${ID}`],
    ['plain text', 'bukan tautan'],
  ])('create rejects %s and writes nothing', async (_label, videoUrl) => {
    const { adminUserId, context } = await adminContext();
    const title = `Video Ditolak ${ulid()}`;
    try {
      await expect(
        call(
          router.admin.education.videos.create,
          { title, videoUrl },
          { context }
        )
      ).rejects.toThrow();

      const rows = await database
        .select({ id: schema.educationVideos.id })
        .from(schema.educationVideos)
        .where(eq(schema.educationVideos.title, title));
      expect(rows).toHaveLength(0);
    } finally {
      await removeAdmin(adminUserId);
    }
  });

  test('update rejects a non-YouTube link, and saving a legacy file video converts it to an embed', async () => {
    const { adminUserId, context } = await adminContext();
    const legacyId = crypto.randomUUID();
    try {
      await database.insert(schema.educationVideos).values({
        id: legacyId,
        title: 'Video Berkas Lama',
        sourceType: 'upload',
        videoUrl: 'https://storage.example/old.mp4',
        thumbnailUrl: 'https://example.com/t.jpg',
      });

      await expect(
        call(
          router.admin.education.videos.update,
          {
            id: legacyId,
            title: 'Masih Berkas',
            videoUrl: 'https://storage.example/old.mp4',
          },
          { context }
        )
      ).rejects.toThrow();

      const updated = await call(
        router.admin.education.videos.update,
        {
          id: legacyId,
          title: 'Sudah YouTube',
          videoUrl: `https://youtu.be/${ID}`,
        },
        { context }
      );
      expect(updated.data.sourceType).toBe('embed');
      expect(updated.data.videoUrl).toBe(
        `https://www.youtube.com/watch?v=${ID}`
      );
    } finally {
      await database
        .delete(schema.educationVideos)
        .where(eq(schema.educationVideos.id, legacyId));
      await removeAdmin(adminUserId);
    }
  });

  test('the file-upload endpoint no longer exists', () => {
    expect(
      (router.admin.education.videos as Record<string, unknown>).getUploadUrl
    ).toBeUndefined();
  });

  test('the public list hides legacy file videos but keeps embeds', async () => {
    const legacyId = crypto.randomUUID();
    const embedId = crypto.randomUUID();
    const publicContext = await createTestCaller({ database, user: null });
    try {
      await database.insert(schema.educationVideos).values([
        {
          id: legacyId,
          title: 'Berkas Lama Publik',
          sourceType: 'upload',
          videoUrl: 'https://storage.example/old.mp4',
          thumbnailUrl: 'https://example.com/t.jpg',
        },
        {
          id: embedId,
          title: 'Sematan Publik',
          sourceType: 'embed',
          videoUrl: `https://www.youtube.com/watch?v=${ID}`,
          thumbnailUrl: 'https://example.com/t.jpg',
        },
      ]);

      const list = await call(
        router.education.videos.list,
        {},
        { context: publicContext }
      );
      const ids = list.data.map((video) => video.id);

      expect(ids).toContain(embedId);
      expect(ids).not.toContain(legacyId);
    } finally {
      for (const id of [legacyId, embedId]) {
        await database
          .delete(schema.educationVideos)
          .where(eq(schema.educationVideos.id, id));
      }
    }
  });
});

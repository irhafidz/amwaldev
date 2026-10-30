import {
  parseYoutubeVideoId,
  youtubeLinkSchema,
  youtubeThumbnailUrl,
} from '@amwal/core/education/youtube';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  educationArticles,
  educationCategories,
  educationContentLikes,
  educationQuizQuestions,
  educationVideos,
} from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin Edukasi oRPC router — statistik header riil + CRUD kategori
 * (`education_categories`, dipakai bersama oleh artikel & video lewat
 * filter `type`).
 */

const SLUG_INVALID_CHARS = /[^a-z0-9]+/g;
const SLUG_EDGE_DASHES = /(^-|-$)/g;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(SLUG_INVALID_CHARS, '-')
    .replace(SLUG_EDGE_DASHES, '');
}

/** 3 kartu statistik header — total artikel, total video, total like gabungan. */
const stats = adminProcedure.handler(async ({ context }) => {
  const [[articleAgg], [videoAgg]] = await Promise.all([
    context.db
      .select({
        total: sql<number>`count(*)::int`,
        likes: sql<number>`coalesce(sum(${educationArticles.likesCount}), 0)::int`,
      })
      .from(educationArticles),
    context.db
      .select({
        total: sql<number>`count(*)::int`,
        likes: sql<number>`coalesce(sum(${educationVideos.likesCount}), 0)::int`,
      })
      .from(educationVideos),
  ]);

  return {
    data: {
      totalArtikel: articleAgg?.total ?? 0,
      totalVideo: videoAgg?.total ?? 0,
      totalLike: (articleAgg?.likes ?? 0) + (videoAgg?.likes ?? 0),
    },
  };
});

const categoryType = z.enum(['article', 'video']);

const categoriesList = adminProcedure
  .input(z.object({ type: categoryType }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(educationCategories)
      .where(eq(educationCategories.type, input.type))
      .orderBy(desc(educationCategories.createdAt));
    return { data: rows };
  });

const categoriesCreate = adminProcedure
  .input(z.object({ name: z.string().trim().min(1), type: categoryType }))
  .handler(async ({ input, context }) => {
    const name = input.name.trim();
    const slug = slugify(name);

    const [existing] = await context.db
      .select({ id: educationCategories.id })
      .from(educationCategories)
      .where(
        and(
          eq(educationCategories.type, input.type),
          eq(educationCategories.slug, slug)
        )
      )
      .limit(1);
    if (existing) {
      throw new ORPCError('CONFLICT', {
        message: `Kategori dengan nama serupa ("${name}") sudah ada`,
      });
    }

    const [created] = await context.db
      .insert(educationCategories)
      .values({ name, type: input.type, slug })
      .returning();

    return { data: created };
  });

const categoriesUpdate = adminProcedure
  .input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1) }))
  .handler(async ({ input, context }) => {
    const name = input.name.trim();
    const slug = slugify(name);
    const [current] = await context.db
      .select({ type: educationCategories.type })
      .from(educationCategories)
      .where(eq(educationCategories.id, input.id))
      .limit(1);
    if (!current) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Kategori tidak ditemukan',
      });
    }

    // Nama baru tidak boleh menabrak kategori lain bertipe sama.
    const [clash] = await context.db
      .select({ id: educationCategories.id })
      .from(educationCategories)
      .where(
        and(
          eq(educationCategories.type, current.type),
          eq(educationCategories.slug, slug),
          ne(educationCategories.id, input.id)
        )
      )
      .limit(1);
    if (clash) {
      throw new ORPCError('CONFLICT', {
        message: `Kategori dengan nama serupa ("${name}") sudah ada`,
      });
    }

    const [updated] = await context.db
      .update(educationCategories)
      .set({ name, slug })
      .where(eq(educationCategories.id, input.id))
      .returning();
    return { data: updated };
  });

const categoriesDelete = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const [category] = await context.db
      .select()
      .from(educationCategories)
      .where(eq(educationCategories.id, input.id))
      .limit(1);

    if (!category) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Kategori tidak ditemukan',
      });
    }

    if (category.type === 'video') {
      const [inUse] = await context.db
        .select({ id: educationVideos.id })
        .from(educationVideos)
        .where(eq(educationVideos.categoryId, input.id))
        .limit(1);
      if (inUse) {
        throw new ORPCError('CONFLICT', {
          message: `Kategori "${category.name}" masih digunakan oleh video aktif`,
        });
      }
    } else {
      const [inUse] = await context.db
        .select({ id: educationArticles.id })
        .from(educationArticles)
        .where(eq(educationArticles.categoryId, input.id))
        .limit(1);
      if (inUse) {
        throw new ORPCError('CONFLICT', {
          message: `Kategori "${category.name}" masih digunakan oleh artikel aktif`,
        });
      }
    }

    await context.db
      .delete(educationCategories)
      .where(eq(educationCategories.id, input.id));

    return { success: true };
  });

/** Thumbnail resmi YouTube dari URL tonton baku yang sudah divalidasi. */
function thumbnailFor(watchUrl: string): string {
  const id = parseYoutubeVideoId(watchUrl);
  if (!id) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Tautan bukan video YouTube yang valid',
    });
  }
  return youtubeThumbnailUrl(id);
}

const videosCreate = adminProcedure
  .input(
    z.object({
      title: z.string().trim().min(1),
      categoryId: z.string().uuid().nullable().optional(),
      // Hanya sematan YouTube. Nilainya dinormalkan ke `youtube.com/watch?v=ID`.
      videoUrl: youtubeLinkSchema,
      speaker: z.string().trim().optional(),
      // Kosong = pakai thumbnail resmi YouTube.
      thumbnailUrl: z.string().trim().optional(),
      description: z.string().trim().optional(),
      status: z.enum(['published', 'draft']).default('published'),
    })
  )
  .handler(async ({ input, context }) => {
    const [created] = await context.db
      .insert(educationVideos)
      .values({
        title: input.title,
        categoryId: input.categoryId ?? null,
        sourceType: 'embed',
        videoUrl: input.videoUrl,
        speaker: input.speaker || null,
        thumbnailUrl: input.thumbnailUrl || thumbnailFor(input.videoUrl),
        description: input.description || null,
        status: input.status,
      })
      .returning();

    return { data: created };
  });

const videosList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: educationVideos.id,
      title: educationVideos.title,
      categoryId: educationVideos.categoryId,
      categoryName: educationCategories.name,
      sourceType: educationVideos.sourceType,
      videoUrl: educationVideos.videoUrl,
      speaker: educationVideos.speaker,
      thumbnailUrl: educationVideos.thumbnailUrl,
      description: educationVideos.description,
      likesCount: educationVideos.likesCount,
      status: educationVideos.status,
      createdAt: educationVideos.createdAt,
    })
    .from(educationVideos)
    .leftJoin(
      educationCategories,
      eq(educationVideos.categoryId, educationCategories.id)
    )
    .orderBy(desc(educationVideos.createdAt));

  return { data: rows };
});

const videosDelete = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const [deleted] = await context.db
      .delete(educationVideos)
      .where(eq(educationVideos.id, input.id))
      .returning({ id: educationVideos.id });
    if (deleted) {
      await context.db
        .delete(educationContentLikes)
        .where(
          and(
            eq(educationContentLikes.contentType, 'video'),
            eq(educationContentLikes.contentId, input.id)
          )
        );
    }

    if (!deleted) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Video tidak ditemukan',
      });
    }
    return { success: true };
  });

const videosUpdate = adminProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1),
      categoryId: z.string().uuid().nullable().optional(),
      videoUrl: youtubeLinkSchema,
      speaker: z.string().trim().optional(),
      authorName: z.string().trim().optional(),
      thumbnailUrl: z.string().trim().optional(),
      description: z.string().trim().optional(),
      durationSeconds: z.number().optional(),
      status: z.enum(['published', 'draft']).default('published'),
    })
  )
  .handler(async ({ input, context }) => {
    const speaker = input.speaker ?? input.authorName;

    const [updated] = await context.db
      .update(educationVideos)
      .set({
        title: input.title,
        categoryId: input.categoryId ?? null,
        // Menyimpan ulang video lama (berkas) otomatis menjadikannya sematan.
        sourceType: 'embed',
        videoUrl: input.videoUrl,
        speaker: speaker || null,
        thumbnailUrl: input.thumbnailUrl || thumbnailFor(input.videoUrl),
        description: input.description || null,
        status: input.status,
      })
      .where(eq(educationVideos.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Video tidak ditemukan',
      });
    }

    return { data: updated };
  });

const quizOptionInput = z.object({
  key: z.string().trim().min(1).max(5),
  text: z.string().trim().min(1),
});

const quizQuestionInput = z.object({
  question: z.string().trim().min(1),
  options: z.array(quizOptionInput).min(2),
  correctKey: z.string().trim().min(1).max(5),
  explanation: z.string().trim().optional(),
});

const articlesList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: educationArticles.id,
      title: educationArticles.title,
      slug: educationArticles.slug,
      categoryId: educationArticles.categoryId,
      categoryName: educationCategories.name,
      coverImageUrl: educationArticles.coverImageUrl,
      authorName: educationArticles.authorName,
      content: educationArticles.content,
      status: educationArticles.status,
      likesCount: educationArticles.likesCount,
      createdAt: educationArticles.createdAt,
      quizQuestionsCount: sql<number>`(
        select count(*)::int from ${educationQuizQuestions}
        where ${educationQuizQuestions.articleId} = ${educationArticles.id}
      )`,
    })
    .from(educationArticles)
    .leftJoin(
      educationCategories,
      eq(educationArticles.categoryId, educationCategories.id)
    )
    .orderBy(desc(educationArticles.createdAt));

  return { data: rows };
});

const articlesCreate = adminProcedure
  .input(
    z.object({
      title: z.string().trim().min(1),
      categoryId: z.string().uuid().nullable().optional(),
      coverImageUrl: z.string().trim().optional(),
      authorName: z.string().trim().optional(),
      content: z.string().trim().min(1),
      quiz: z.array(quizQuestionInput).optional().default([]),
    })
  )
  .handler(async ({ input, context }) => {
    const baseSlug = slugify(input.title) || `artikel-${Date.now()}`;
    const authorName = input.authorName?.trim();

    const created = await context.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: educationArticles.id })
        .from(educationArticles)
        .where(eq(educationArticles.slug, baseSlug))
        .limit(1);
      const slug = existing
        ? `${baseSlug}-${Date.now().toString(36)}`
        : baseSlug;

      const [article] = await tx
        .insert(educationArticles)
        .values({
          title: input.title,
          categoryId: input.categoryId ?? null,
          slug,
          coverImageUrl: input.coverImageUrl || null,
          content: input.content,
          ...(authorName ? { authorName } : {}),
        })
        .returning();

      if (input.quiz.length > 0) {
        await tx.insert(educationQuizQuestions).values(
          input.quiz.map((q, index) => ({
            articleId: article.id,
            question: q.question,
            options: q.options,
            correctKey: q.correctKey,
            explanation: q.explanation || null,
            orderIndex: index,
          }))
        );
      }

      return article;
    });

    return { data: created };
  });

const articlesGet = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const [article] = await context.db
      .select()
      .from(educationArticles)
      .where(eq(educationArticles.id, input.id))
      .limit(1);

    if (!article) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Artikel tidak ditemukan',
      });
    }

    const quizRows = await context.db
      .select({
        question: educationQuizQuestions.question,
        options: educationQuizQuestions.options,
        correctKey: educationQuizQuestions.correctKey,
        explanation: educationQuizQuestions.explanation,
      })
      .from(educationQuizQuestions)
      .where(eq(educationQuizQuestions.articleId, input.id))
      .orderBy(educationQuizQuestions.orderIndex);

    const quiz = quizRows.map((q) => ({
      ...q,
      explanation: q.explanation ?? undefined,
    }));

    return { data: { ...article, quiz } };
  });

const articlesUpdate = adminProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1),
      categoryId: z.string().uuid().nullable().optional(),
      coverImageUrl: z.string().trim().optional(),
      authorName: z.string().trim().optional(),
      content: z.string().trim().min(1),
      quiz: z.array(quizQuestionInput).optional().default([]),
    })
  )
  .handler(async ({ input, context }) => {
    const authorName = input.authorName?.trim();

    const updated = await context.db.transaction(async (tx) => {
      const [article] = await tx
        .update(educationArticles)
        .set({
          title: input.title,
          categoryId: input.categoryId ?? null,
          coverImageUrl: input.coverImageUrl || null,
          content: input.content,
          ...(authorName ? { authorName } : {}),
        })
        .where(eq(educationArticles.id, input.id))
        .returning();

      if (!article) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Artikel tidak ditemukan',
        });
      }

      await tx
        .delete(educationQuizQuestions)
        .where(eq(educationQuizQuestions.articleId, input.id));

      if (input.quiz.length > 0) {
        await tx.insert(educationQuizQuestions).values(
          input.quiz.map((q, index) => ({
            articleId: article.id,
            question: q.question,
            options: q.options,
            correctKey: q.correctKey,
            explanation: q.explanation || null,
            orderIndex: index,
          }))
        );
      }

      return article;
    });

    return { data: updated };
  });

const articlesDelete = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const [deleted] = await context.db
      .delete(educationArticles)
      .where(eq(educationArticles.id, input.id))
      .returning({ id: educationArticles.id });

    if (!deleted) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Artikel tidak ditemukan',
      });
    }
    await context.db
      .delete(educationContentLikes)
      .where(
        and(
          eq(educationContentLikes.contentType, 'article'),
          eq(educationContentLikes.contentId, input.id)
        )
      );
    return { success: true };
  });

export const education = {
  stats,
  categories: {
    list: categoriesList,
    create: categoriesCreate,
    update: categoriesUpdate,
    delete: categoriesDelete,
  },
  videos: {
    create: videosCreate,
    list: videosList,
    update: videosUpdate,
    delete: videosDelete,
  },
  articles: {
    list: articlesList,
    get: articlesGet,
    create: articlesCreate,
    update: articlesUpdate,
    delete: articlesDelete,
  },
};

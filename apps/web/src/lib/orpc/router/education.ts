import { award, awardContent } from '@amwal/core/gamification/ledger';
import {
  ACTIVITY_POINTS,
  quizKey,
  readKey,
} from '@amwal/core/gamification/points';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import { resolveRequestUser } from '@/lib/auth/core';
import type { Database } from '@/lib/db';
import {
  educationArticleComments,
  educationArticles,
  educationCategories,
  educationContentLikes,
  educationQuizAttempts,
  educationQuizQuestions,
  educationVideos,
  users,
} from '@/lib/db/schema';
import { protectedProcedure, publicProcedure } from '../procedures';

/**
 * Public Edukasi oRPC router (Batch: Public Education & Interactive Quiz
 * Views) — reads the same `education_*` tables the admin router
 * (`router/admin/education.ts`) writes, filtered to `status: 'published'`
 * only. Quiz-checking and comment-posting are the only writes here; both are
 * guest-safe reads elsewhere on purpose (AMW-02 style: no admin guard on a
 * donor/visitor-facing router).
 */

/** Best-effort session lookup — never throws, so guests can still take quizzes. */
async function resolveOptionalUserId(request: Request): Promise<string | null> {
  const user = await resolveRequestUser(request);
  return user?.userId ?? null;
}

const categoriesList = publicProcedure
  .input(z.object({ type: z.enum(['article', 'video']) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(educationCategories)
      .where(eq(educationCategories.type, input.type))
      .orderBy(desc(educationCategories.createdAt));
    return { data: rows };
  });

const articleSelectColumns = {
  id: educationArticles.id,
  title: educationArticles.title,
  slug: educationArticles.slug,
  categoryId: educationArticles.categoryId,
  categoryName: educationCategories.name,
  coverImageUrl: educationArticles.coverImageUrl,
  authorName: educationArticles.authorName,
  content: educationArticles.content,
  likesCount: educationArticles.likesCount,
  createdAt: educationArticles.createdAt,
  quizQuestionsCount: sql<number>`(
    select count(*)::int from ${educationQuizQuestions}
    where ${educationQuizQuestions.articleId} = ${educationArticles.id}
  )`,
} as const;

const articlesList = publicProcedure
  .input(
    z.object({
      search: z.string().trim().optional(),
      categoryId: z.string().uuid().optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [eq(educationArticles.status, 'published')];
    if (input.search) {
      conditions.push(ilike(educationArticles.title, `%${input.search}%`));
    }
    if (input.categoryId) {
      conditions.push(eq(educationArticles.categoryId, input.categoryId));
    }

    const rows = await context.db
      .select(articleSelectColumns)
      .from(educationArticles)
      .leftJoin(
        educationCategories,
        eq(educationArticles.categoryId, educationCategories.id)
      )
      .where(and(...conditions))
      .orderBy(
        desc(educationArticles.likesCount),
        desc(educationArticles.createdAt)
      );

    return { data: rows };
  });

const articlesBySlug = publicProcedure
  .input(z.object({ slug: z.string().trim().min(1) }))
  .handler(async ({ input, context }) => {
    const [article] = await context.db
      .select(articleSelectColumns)
      .from(educationArticles)
      .leftJoin(
        educationCategories,
        eq(educationArticles.categoryId, educationCategories.id)
      )
      .where(
        and(
          eq(educationArticles.slug, input.slug),
          eq(educationArticles.status, 'published')
        )
      )
      .limit(1);

    if (!article) {
      throw new ORPCError('NOT_FOUND', { message: 'Artikel tidak ditemukan' });
    }
    return { data: article };
  });

const videosList = publicProcedure
  .input(z.object({ categoryId: z.string().uuid().optional() }))
  .handler(async ({ input, context }) => {
    // Hanya sematan YouTube yang ditampilkan. Berkas lama (`upload`) tidak
    // dihapus dari database, tetapi tidak lagi disajikan ke publik.
    const conditions = [
      eq(educationVideos.status, 'published'),
      eq(educationVideos.sourceType, 'embed'),
    ];
    if (input.categoryId) {
      conditions.push(eq(educationVideos.categoryId, input.categoryId));
    }

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
        createdAt: educationVideos.createdAt,
      })
      .from(educationVideos)
      .leftJoin(
        educationCategories,
        eq(educationVideos.categoryId, educationCategories.id)
      )
      .where(and(...conditions))
      .orderBy(desc(educationVideos.createdAt));

    return { data: rows };
  });

const quizList = publicProcedure
  .input(z.object({ articleId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: educationQuizQuestions.id,
        question: educationQuizQuestions.question,
        options: educationQuizQuestions.options,
        orderIndex: educationQuizQuestions.orderIndex,
      })
      .from(educationQuizQuestions)
      .where(eq(educationQuizQuestions.articleId, input.articleId))
      .orderBy(educationQuizQuestions.orderIndex);

    return { data: rows };
  });

const quizCheck = publicProcedure
  .input(
    z.object({
      articleId: z.string().uuid(),
      answers: z.array(
        z.object({
          questionId: z.string().uuid(),
          key: z.string().trim().min(1),
        })
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const questions = await context.db
      .select()
      .from(educationQuizQuestions)
      .where(eq(educationQuizQuestions.articleId, input.articleId))
      .orderBy(educationQuizQuestions.orderIndex);

    if (questions.length === 0) {
      throw new ORPCError('NOT_FOUND', { message: 'Kuis tidak ditemukan' });
    }

    const answerByQuestion = new Map(
      input.answers.map((answer) => [answer.questionId, answer.key])
    );

    let correctCount = 0;
    const results = questions.map((question) => {
      const givenKey = answerByQuestion.get(question.id) ?? null;
      const isCorrect = givenKey === question.correctKey;
      if (isCorrect) {
        correctCount += 1;
      }
      return {
        questionId: question.id,
        givenKey,
        correctKey: question.correctKey,
        isCorrect,
        explanation: question.explanation,
      };
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const userId = await resolveOptionalUserId(context.request);

    await context.db.insert(educationQuizAttempts).values({
      articleId: input.articleId,
      userId,
      score,
      correctCount,
      totalQuestions: questions.length,
    });

    let xpAwarded = 0;
    let isNewReward = false;

    if (userId && score >= 70) {
      const [article] = await context.db
        .select({ title: educationArticles.title })
        .from(educationArticles)
        .where(eq(educationArticles.id, input.articleId))
        .limit(1);

      isNewReward = await award(context.db, {
        userId,
        activityType: 'QUIZ',
        idempotencyKey: quizKey(userId, input.articleId),
        points: ACTIVITY_POINTS.QUIZ,
        sourceRef: `Penyelesaian Kuis: ${article?.title ?? 'Artikel Edukasi'}`,
      });

      if (isNewReward) {
        xpAwarded = ACTIVITY_POINTS.QUIZ;
      }
    }

    return {
      data: {
        score,
        correctCount,
        totalQuestions: questions.length,
        results,
        xpAwarded,
        isNewReward,
      },
    };
  });

const claimReadingXp = protectedProcedure
  .input(
    z
      .object({
        articleId: z.string().uuid().optional(),
        slug: z.string().trim().optional(),
      })
      .refine((data) => data.articleId || data.slug, {
        message: 'articleId atau slug wajib disertakan',
      })
  )
  .handler(async ({ input, context }) => {
    const condition = input.articleId
      ? eq(educationArticles.id, input.articleId)
      : eq(educationArticles.slug, input.slug as string);

    const [article] = await context.db
      .select({
        id: educationArticles.id,
        title: educationArticles.title,
      })
      .from(educationArticles)
      .where(and(condition, eq(educationArticles.status, 'published')))
      .limit(1);

    if (!article) {
      throw new ORPCError('NOT_FOUND', { message: 'Artikel tidak ditemukan' });
    }

    const userId = context.user.userId;
    const result = await awardContent(context.db, {
      userId,
      activityType: 'READ',
      idempotencyKey: readKey(userId, article.id),
      // Satu sumber nilai dengan badge "+50 XP" di katalog (QA-07; dulu 25).
      points: ACTIVITY_POINTS.READ,
      sourceRef: `Membaca Artikel: ${article.title}`,
    });
    if (result === 'LIMIT_REACHED') {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Batas klaim poin konten harian tercapai. Coba lagi besok.',
      });
    }
    const isNewReward = result === 'AWARDED';

    return {
      data: {
        success: true,
        xpAwarded: isNewReward ? ACTIVITY_POINTS.READ : 0,
        isNewReward,
      },
    };
  });

const commentsList = publicProcedure
  .input(z.object({ articleId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: educationArticleComments.id,
        authorName: educationArticleComments.authorName,
        comment: educationArticleComments.comment,
        createdAt: educationArticleComments.createdAt,
      })
      .from(educationArticleComments)
      .where(eq(educationArticleComments.articleId, input.articleId))
      .orderBy(desc(educationArticleComments.createdAt));

    return { data: rows };
  });

async function resolveAuthorName(database: Database, userId: string) {
  const [user] = await database
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.name ?? 'Pengguna Amwal';
}

const commentsCreate = protectedProcedure
  .input(
    z.object({
      articleId: z.string().uuid(),
      comment: z
        .string()
        .trim()
        .min(3, 'Komentar minimal 3 karakter')
        .max(2000, 'Komentar maksimal 2000 karakter'),
    })
  )
  .handler(async ({ input, context }) => {
    const authorName = await resolveAuthorName(context.db, context.user.userId);

    const [created] = await context.db
      .insert(educationArticleComments)
      .values({
        articleId: input.articleId,
        userId: context.user.userId,
        authorName,
        comment: input.comment,
      })
      .returning();

    return { data: created };
  });

const likeTarget = z.object({
  contentType: z.enum(['article', 'video']),
  contentId: z.string().uuid(),
});

/**
 * Toggle suka per pengguna. Baris `education_content_likes` adalah sumber
 * kebenaran "sudah menyukai"; `likes_count` bergeser ±1 hanya bila baris
 * benar-benar disisipkan/dihapus, jadi klik ganda/balapan tidak menggandakan.
 */
const likesToggle = protectedProcedure
  .input(likeTarget)
  .handler(async ({ input, context }) => {
    const { userId } = context.user;
    const countTable =
      input.contentType === 'article' ? educationArticles : educationVideos;

    return await context.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: countTable.id })
        .from(countTable)
        .where(eq(countTable.id, input.contentId))
        .limit(1);
      if (!target) {
        throw new ORPCError('NOT_FOUND', { message: 'Konten tidak ditemukan' });
      }

      const removed = await tx
        .delete(educationContentLikes)
        .where(
          and(
            eq(educationContentLikes.userId, userId),
            eq(educationContentLikes.contentType, input.contentType),
            eq(educationContentLikes.contentId, input.contentId)
          )
        )
        .returning({ id: educationContentLikes.id });

      let liked = false;
      let delta = -removed.length;
      if (removed.length === 0) {
        const inserted = await tx
          .insert(educationContentLikes)
          .values({
            userId,
            contentType: input.contentType,
            contentId: input.contentId,
          })
          .onConflictDoNothing()
          .returning({ id: educationContentLikes.id });
        liked = inserted.length > 0;
        delta = inserted.length;
      }

      const [row] = await tx
        .update(countTable)
        .set({
          likesCount: sql`greatest(0, ${countTable.likesCount} + ${delta})`,
        })
        .where(eq(countTable.id, input.contentId))
        .returning({ likesCount: countTable.likesCount });

      return { data: { liked, likesCount: row?.likesCount ?? 0 } };
    });
  });

/** Id konten bertipe tertentu yang sudah disukai pengguna saat ini. */
const likesMine = protectedProcedure
  .input(z.object({ contentType: z.enum(['article', 'video']) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({ contentId: educationContentLikes.contentId })
      .from(educationContentLikes)
      .where(
        and(
          eq(educationContentLikes.userId, context.user.userId),
          eq(educationContentLikes.contentType, input.contentType)
        )
      );
    return { data: rows.map((row) => row.contentId) };
  });

export const education = {
  categories: { list: categoriesList },
  articles: {
    list: articlesList,
    bySlug: articlesBySlug,
    claimReadingXp,
  },
  videos: { list: videosList },
  quiz: { list: quizList, check: quizCheck },
  comments: { list: commentsList, create: commentsCreate },
  likes: { toggle: likesToggle, mine: likesMine },
};

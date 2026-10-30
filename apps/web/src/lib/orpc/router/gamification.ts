import {
  checkInResultSchema,
  checkInSchema,
  claimQuizSchema,
  claimReadSchema,
  claimResultSchema,
  claimWatchSchema,
  type GamificationClaimStatus,
  pointHistorySchema,
  pointsHistoryResultSchema,
  pointsSummaryResultSchema,
  pointsSummarySchema,
  submitQuizAttemptResultSchema,
  submitQuizAttemptSchema,
} from '@amwal/core/contracts/gamification';
import {
  ASNAF_QUIZ_ID,
  ASNAF_QUIZ_TITLE,
  gradeAsnafQuiz,
} from '@amwal/core/education/asnaf-quiz';
import {
  award,
  awardContent,
  getBalance,
  getCheckInDates,
  listLedger,
  settleUserPenalties,
  streakDays,
} from '@amwal/core/gamification/ledger';
import {
  ACTIVITY_POINTS,
  checkInKey,
  quizKey,
  readKey,
  watchKey,
} from '@amwal/core/gamification/points';
import { toWibDate } from '@amwal/core/time/wib';
import { ORPCError } from '@orpc/server';
import { and, eq, gte } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { SessionUser } from '@/lib/auth/types';
import type { Database } from '@/lib/db';
import {
  educationArticles,
  educationContents,
  quizAttempts,
  quizzes,
} from '@/lib/db/schema';
import { protectedProcedure, publicProcedure } from '../procedures';

/**
 * oRPC gamification router (Sprint 11, `I-10b` — Zone 1).
 *
 * The procedures are thin by design: every rule that must hold under
 * concurrency — idempotent awarding, the per-user advisory lock, flooring the
 * balance at 0 — lives in `@amwal/core/gamification/ledger` (Zone 0). This
 * file only decides *which* activity is being claimed and *what it is worth*.
 *
 * All six procedures are `protectedProcedure`: points are per-user, so a
 * session is the requirement, not a role. There is deliberately no
 * `rbacMatrix` entry — the matrix maps roles per namespace, and an entry no
 * one references is dead configuration.
 *
 * Every date here is `YYYY-MM-DD` in **WIB**, derived on the server. A device
 * with a fast clock cannot claim tomorrow's check-in.
 */

/** Passing score for a quiz claim, matching `quiz_attempts.skor`. */
const QUIZ_PASS_SCORE = 70;

interface HandlerContext {
  db: Database;
  user: SessionUser | null;
}

function sessionUserId(context: HandlerContext): string {
  const user = context.user;
  if (!user) {
    // `protectedProcedure` guarantees a session — this only narrows the type.
    throw new ORPCError('UNAUTHORIZED');
  }
  return user.userId;
}

async function readBalanceState(
  context: HandlerContext,
  userId: string,
  today: string
) {
  const [balance, checkinDates] = await Promise.all([
    getBalance(context.db, userId),
    getCheckInDates(context.db, userId),
  ]);

  return {
    saldo: balance,
    sudahCheckInHariIni: checkinDates.has(today),
    streakHari: streakDays(checkinDates, today),
  };
}

/**
 * Shared claim path for the three "content" activities. A repeated claim is a
 * value, never an error: `ALREADY_CLAIMED` lets a UI that sent twice render
 * the correct result instead of an error state.
 */
async function claim(
  context: HandlerContext,
  userId: string,
  input: {
    activityType: 'QUIZ' | 'READ' | 'WATCH';
    key: string;
    points: number;
  }
): Promise<{
  status: GamificationClaimStatus;
  awarded: boolean;
  points: number;
  saldo: number;
}> {
  const payload = {
    userId,
    activityType: input.activityType,
    idempotencyKey: input.key,
    points: input.points,
    sourceRef: input.key,
  };
  let awarded: boolean;
  if (input.activityType === 'QUIZ') {
    awarded = await award(context.db, payload);
  } else {
    const result = await awardContent(context.db, payload);
    if (result === 'LIMIT_REACHED') {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Batas klaim poin konten harian tercapai. Coba lagi besok.',
      });
    }
    awarded = result === 'AWARDED';
  }

  return {
    status: awarded ? 'CLAIMED' : 'ALREADY_CLAIMED',
    awarded,
    points: awarded ? input.points : 0,
    saldo: await getBalance(context.db, userId),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A claim must point at real, published content. Without this any made-up
 * `contentId` is a fresh idempotency key, i.e. a fresh +50 XP.
 */
async function assertPublishedContent(
  database: Database,
  contentId: string
): Promise<void> {
  const [content] = await database
    .select({ id: educationContents.id })
    .from(educationContents)
    .where(
      and(
        eq(educationContents.id, contentId),
        eq(educationContents.status, 'PUBLISHED')
      )
    )
    .limit(1);
  if (content) {
    return;
  }

  // `education_articles.id` is a uuid column; a non-uuid string would make
  // Postgres throw instead of simply not matching.
  if (UUID_PATTERN.test(contentId)) {
    const [article] = await database
      .select({ id: educationArticles.id })
      .from(educationArticles)
      .where(
        and(
          eq(educationArticles.id, contentId),
          eq(educationArticles.status, 'published')
        )
      )
      .limit(1);
    if (article) {
      return;
    }
  }

  throw new ORPCError('NOT_FOUND', { message: 'Konten tidak ditemukan' });
}

/** Saldo poin pengguna sesi; penalti diselesaikan lazy saat dibaca (D6). */
const summary = protectedProcedure
  .input(pointsSummarySchema)
  .output(pointsSummaryResultSchema)
  .handler(async ({ context }) => {
    const userId = sessionUserId(context);
    const today = toWibDate(new Date());

    await settleUserPenalties(context.db, userId, today);

    return readBalanceState(context, userId, today);
  });

/** Riwayat baris ledger milik pengguna sesi, terbaru dulu. */
const history = protectedProcedure
  .input(pointHistorySchema)
  .output(pointsHistoryResultSchema)
  .handler(async ({ input, context }) => {
    const userId = sessionUserId(context);
    const page = await listLedger(context.db, userId, {
      cursor: input.cursor,
      limit: input.limit,
    });

    return {
      items: page.items.map((row) => ({
        id: row.id,
        activityType: row.activityType,
        points: row.points,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  });

/** +50; tanggal selalu WIB dari server, bukan dari jam perangkat. */
const checkIn = protectedProcedure
  .input(checkInSchema)
  .output(checkInResultSchema)
  .handler(async ({ context }) => {
    const userId = sessionUserId(context);
    const today = toWibDate(new Date());

    // Settle first: the balance that floors the penalties must not include
    // today's award, or a donor could "pay" an old penalty with a new point.
    await settleUserPenalties(context.db, userId, today);

    const awarded = await award(context.db, {
      userId,
      activityType: 'CHECKIN',
      idempotencyKey: checkInKey(userId, today),
      points: ACTIVITY_POINTS.CHECKIN,
      sourceRef: today,
    });

    return {
      awarded,
      points: awarded ? ACTIVITY_POINTS.CHECKIN : 0,
      ...(await readBalanceState(context, userId, today)),
    };
  });

/**
 * [Sprint 11.1, remediasi `I-10b`] Menilai jawaban kuis edukasi 8 Asnaf di
 * server dan menulis percobaannya ke `quiz_attempts` — inilah yang tidak
 * pernah ada sebelumnya, sehingga `claimQuiz` di bawah tidak pernah punya
 * baris untuk dibaca. Hanya mendukung `ASNAF_QUIZ_ID`; kuis CMS umum
 * menyusul saat artikel `I-9` tersambung ke tabel `quizzes`.
 */
const submitQuizAttempt = protectedProcedure
  .input(submitQuizAttemptSchema)
  .output(submitQuizAttemptResultSchema)
  .handler(async ({ input, context }) => {
    const userId = sessionUserId(context);

    if (input.quizId !== ASNAF_QUIZ_ID) {
      throw new ORPCError('NOT_FOUND', { message: 'Kuis tidak dikenal' });
    }

    const grade = gradeAsnafQuiz(input.answers);

    await context.db
      .insert(quizzes)
      .values({ id: ASNAF_QUIZ_ID, judul: ASNAF_QUIZ_TITLE })
      .onConflictDoNothing({ target: quizzes.id });

    await context.db.insert(quizAttempts).values({
      id: `QA-${ulid()}`,
      quizId: ASNAF_QUIZ_ID,
      userId,
      skor: grade.percentage.toFixed(2),
    });

    return { quizId: ASNAF_QUIZ_ID, ...grade };
  });

/**
 * Menilai kuis tanpa menulis apa pun (QA-08, D5): tamu boleh bermain, tetapi
 * tidak ada percobaan, poin, atau klaim yang tersimpan. Kunci jawaban tetap di
 * server, jadi skor tamu pun dinilai server.
 */
const gradeQuiz = publicProcedure
  .input(submitQuizAttemptSchema)
  .output(submitQuizAttemptResultSchema)
  .handler(({ input }) => {
    if (input.quizId !== ASNAF_QUIZ_ID) {
      throw new ORPCError('NOT_FOUND', { message: 'Kuis tidak dikenal' });
    }
    return { quizId: ASNAF_QUIZ_ID, ...gradeAsnafQuiz(input.answers) };
  });

/** +100, sekali per kuis per pengguna; hanya bila ada percobaan lulus. */
const claimQuiz = protectedProcedure
  .input(claimQuizSchema)
  .output(claimResultSchema)
  .handler(async ({ input, context }) => {
    const userId = sessionUserId(context);

    const [passed] = await context.db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.quizId, input.quizId),
          gte(quizAttempts.skor, String(QUIZ_PASS_SCORE))
        )
      )
      .limit(1);

    if (!passed) {
      return {
        status: 'NOT_ELIGIBLE' as const,
        awarded: false,
        points: 0,
        saldo: await getBalance(context.db, userId),
      };
    }

    return claim(context, userId, {
      activityType: 'QUIZ',
      key: quizKey(userId, input.quizId),
      points: ACTIVITY_POINTS.QUIZ,
    });
  });

/**
 * +50, hanya bila dwell ≥ 30 detik (ditegakkan `claimReadSchema`).
 *
 * **Gap yang dinyatakan terang-terangan:** dwell-nya masih datang dari klien.
 * Verifikasi sisi server menuntut tabel sesi baca (`readBegin` menyimpan waktu
 * server, `claimRead` membandingkan) — DDL itu harus lewat jendela `0005` milik
 * Claude Pro, bukan ditambahkan diam-diam di sini. Sampai itu ada, klaim baca
 * tidak lebih kuat dari klaim tonton.
 */
const claimRead = protectedProcedure
  .input(claimReadSchema)
  .output(claimResultSchema)
  .handler(async ({ input, context }) => {
    const userId = sessionUserId(context);
    await assertPublishedContent(context.db, input.contentId);
    return await claim(context, userId, {
      activityType: 'READ',
      key: readKey(userId, input.contentId),
      points: ACTIVITY_POINTS.READ,
    });
  });

/** +50 per konten; item potong pertama bila lingkup harus menyusut (§6). */
const claimWatch = protectedProcedure
  .input(claimWatchSchema)
  .output(claimResultSchema)
  .handler(async ({ input, context }) => {
    const userId = sessionUserId(context);
    await assertPublishedContent(context.db, input.contentId);
    return await claim(context, userId, {
      activityType: 'WATCH',
      key: watchKey(userId, input.contentId),
      points: ACTIVITY_POINTS.WATCH,
    });
  });

export const gamification = {
  summary,
  history,
  checkIn,
  submitQuizAttempt,
  gradeQuiz,
  claimQuiz,
  claimRead,
  claimWatch,
};

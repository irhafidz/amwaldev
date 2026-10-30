import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * `I-10` / `I-10b` — the gamification ledger against a real database.
 *
 * These are the D2/D6 acceptance criteria from PLAN §5 written as tests: a
 * replayed webhook pays once, re-running the penalty settlement yields the
 * same balance, and a balance of 30 with three missed days lands on 0 rather
 * than −30. The arithmetic is unit-tested in `packages/core`; what is proven
 * here is that the *database* enforces it — which is the only place
 * idempotency under concurrency can actually be proven.
 */

// Must be set before `env/server.ts` is first imported (the dynamic imports
// below), otherwise the cron route would boot without a secret and every
// request would be a 401.
process.env.CRON_SECRET ??= 's11-gamification-test-secret';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { settleUserPenalties, getBalance, streakDays } = await import(
  '@amwal/core/gamification/ledger'
);
const { settleTransactionPoints } = await import(
  '../../src/lib/gamification/settle-hook'
);
const { handle: streakSweep } = await import(
  '../../src/routes/api/cron/streak'
);
const { createTestCaller } = await import('./test-utils');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

async function createUser(createdAt?: string): Promise<string> {
  const userId = `s11-gam-${ulid().toLowerCase()}`;
  await database.insert(schema.users).values({
    id: userId,
    name: 'Donor Gamifikasi',
    ...(createdAt ? { createdAt } : {}),
    updatedAt: now(),
  });
  return userId;
}

async function cleanupUser(userId: string): Promise<void> {
  await database
    .delete(schema.gamificationPointLedgers)
    .where(eq(schema.gamificationPointLedgers.userId, userId));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

function ledgerRows(userId: string) {
  return database
    .select({
      activityType: schema.gamificationPointLedgers.activityType,
      idempotencyKey: schema.gamificationPointLedgers.idempotencyKey,
      pointsEarned: schema.gamificationPointLedgers.pointsEarned,
    })
    .from(schema.gamificationPointLedgers)
    .where(eq(schema.gamificationPointLedgers.userId, userId));
}

function session(userId: string) {
  return createTestCaller({
    database,
    user: { role: 'WAKIF', userId },
  });
}

describe('gamification.summary & checkIn', () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createUser();
  });

  afterAll(async () => {
    await cleanupUser(userId);
    await database
      .delete(schema.educationContents)
      .where(eq(schema.educationContents.id, `konten-${userId}`));
  });

  test('anonymous callers are rejected with 401 (no session, no points)', async () => {
    await expect(
      call(
        router.gamification.summary,
        {},
        {
          context: await createTestCaller({ database }),
        }
      )
    ).rejects.toThrow(ORPCError);
  });

  test('a fresh account starts at zero with today still open', async () => {
    const summary = await call(
      router.gamification.summary,
      {},
      {
        context: await session(userId),
      }
    );

    expect(summary.saldo).toBe(0);
    expect(summary.sudahCheckInHariIni).toBe(false);
    expect(summary.streakHari).toBe(0);
  });

  test('check-in pays +50 exactly once per WIB day', async () => {
    const context = await session(userId);
    const first = await call(router.gamification.checkIn, {}, { context });
    const second = await call(router.gamification.checkIn, {}, { context });

    expect(first.awarded).toBe(true);
    expect(first.points).toBe(50);
    expect(first.saldo).toBe(50);
    expect(first.sudahCheckInHariIni).toBe(true);
    expect(first.streakHari).toBe(1);

    // A double tap is a value, not an error — the UI renders the real balance.
    expect(second.awarded).toBe(false);
    expect(second.points).toBe(0);
    expect(second.saldo).toBe(50);

    const rows = await ledgerRows(userId);
    const checkins = rows.filter((row) => row.activityType === 'CHECKIN');
    expect(checkins).toHaveLength(1);
    expect(checkins.at(0)?.pointsEarned).toBe(50);
    expect(checkins.at(0)?.idempotencyKey).toContain(`checkin:${userId}:`);
  });

  test('history returns the ledger newest-first with a cursor', async () => {
    const context = await session(userId);
    // Claims only count for real, published content (audit C3).
    await database.insert(schema.educationContents).values({
      id: `konten-${userId}`,
      judul: 'Konten Uji Riwayat',
      tipe: 'VIDEO',
      status: 'PUBLISHED',
    });
    // One more row, so "is there a next page?" is a real question.
    await call(
      router.gamification.claimWatch,
      { contentId: `konten-${userId}` },
      { context }
    );

    const firstPage = await call(
      router.gamification.history,
      { limit: 1 },
      { context }
    );

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeString();

    const secondPage = await call(
      router.gamification.history,
      { cursor: firstPage.nextCursor ?? undefined, limit: 1 },
      { context }
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items.at(0)?.id).not.toBe(firstPage.items.at(0)?.id);
    // Two rows in, two rows out — the check-in from the previous test is the
    // one the first page pushed onto the second.
    expect(
      [firstPage, secondPage]
        .flatMap((page) => page.items)
        .map((item) => item.activityType)
        .sort()
    ).toEqual(['CHECKIN', 'WATCH']);
  });

  test('20 parallel check-ins still write exactly one ledger row', async () => {
    const raceUserId = await createUser();

    try {
      const context = await session(raceUserId);
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          call(router.gamification.checkIn, {}, { context })
        )
      );

      const awarded = results.filter((result) => result.awarded);
      expect(awarded).toHaveLength(1);
      expect(results.every((result) => result.saldo === 50)).toBe(true);

      // The proof is in the database, not in the response: one row, one key.
      const rows = await ledgerRows(raceUserId);
      expect(rows.filter((row) => row.activityType === 'CHECKIN')).toHaveLength(
        1
      );
      expect(await getBalance(database, raceUserId)).toBe(50);
    } finally {
      await cleanupUser(raceUserId);
    }
  });
});

describe('gamification.claimQuiz', () => {
  let userId: string;
  let quizId: string;
  let unpassedQuizId: string;

  beforeAll(async () => {
    userId = await createUser();
    quizId = `QUIZ-${ulid()}`;
    unpassedQuizId = `QUIZ-${ulid()}`;
    await database.insert(schema.quizzes).values([
      { id: quizId, judul: 'Kuis Lulus' },
      { id: unpassedQuizId, judul: 'Kuis Gagal' },
    ]);
    await database.insert(schema.quizAttempts).values({
      id: `QA-${ulid()}`,
      quizId,
      skor: '80.00',
      userId,
    });
  });

  afterAll(async () => {
    await database
      .delete(schema.quizAttempts)
      .where(eq(schema.quizAttempts.userId, userId));
    for (const id of [quizId, unpassedQuizId]) {
      await database.delete(schema.quizzes).where(eq(schema.quizzes.id, id));
    }
    await cleanupUser(userId);
  });

  test('pays +100 for a passed quiz, then reports ALREADY_CLAIMED', async () => {
    const context = await session(userId);
    const first = await call(
      router.gamification.claimQuiz,
      { quizId },
      { context }
    );
    const second = await call(
      router.gamification.claimQuiz,
      { quizId },
      { context }
    );

    expect(first.status).toBe('CLAIMED');
    expect(first.points).toBe(100);
    expect(second.status).toBe('ALREADY_CLAIMED');
    expect(second.points).toBe(0);
    expect(second.saldo).toBe(first.saldo);
  });

  test('a quiz with no passed attempt is NOT_ELIGIBLE, not an error', async () => {
    const result = await call(
      router.gamification.claimQuiz,
      { quizId: unpassedQuizId },
      { context: await session(userId) }
    );

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.awarded).toBe(false);
  });
});

describe('gamification.submitQuizAttempt (Sprint 11.1, I-10b remediation)', () => {
  const ASNAF_QUIZ_ID = 'QUIZ-EDU-8-ASNAF';
  const ALL_CORRECT = {
    'asnaf-count': '8',
    'fakir-miskin': 'definisi',
    gharim: 'gharim',
    muallaf: 'ya',
    amil: 'amil',
  };

  let userId: string;

  beforeAll(async () => {
    userId = await createUser();
  });

  afterAll(async () => {
    await database
      .delete(schema.quizAttempts)
      .where(eq(schema.quizAttempts.userId, userId));
    await cleanupUser(userId);
  });

  test('grades server-side, writes an attempt, and unlocks a real claimQuiz', async () => {
    const context = await session(userId);

    const grade = await call(
      router.gamification.submitQuizAttempt,
      { quizId: ASNAF_QUIZ_ID, answers: ALL_CORRECT },
      { context }
    );
    expect(grade).toEqual({
      quizId: ASNAF_QUIZ_ID,
      correct: 5,
      total: 5,
      percentage: 100,
      passed: true,
    });

    const [attempt] = await database
      .select({ skor: schema.quizAttempts.skor })
      .from(schema.quizAttempts)
      .where(eq(schema.quizAttempts.userId, userId));
    expect(attempt?.skor).toBe('100.00');

    // Before this endpoint existed, nothing ever wrote a passing attempt —
    // claimQuiz always returned NOT_ELIGIBLE for this quiz. Prove the whole
    // chain now works end to end.
    const claim = await call(
      router.gamification.claimQuiz,
      { quizId: ASNAF_QUIZ_ID },
      { context }
    );
    expect(claim.status).toBe('CLAIMED');
    expect(claim.points).toBe(100);
  });

  test('a client cannot forge a passing score — wrong answers grade 0%', async () => {
    const wrongAnswerUserId = await createUser();
    try {
      const grade = await call(
        router.gamification.submitQuizAttempt,
        {
          quizId: ASNAF_QUIZ_ID,
          answers: { 'asnaf-count': '999', gharim: 'riqab' },
        },
        { context: await session(wrongAnswerUserId) }
      );
      expect(grade.percentage).toBe(0);
      expect(grade.passed).toBe(false);
    } finally {
      await database
        .delete(schema.quizAttempts)
        .where(eq(schema.quizAttempts.userId, wrongAnswerUserId));
      await cleanupUser(wrongAnswerUserId);
    }
  });

  test('rejects an unknown quizId instead of silently grading it', async () => {
    await expect(
      call(
        router.gamification.submitQuizAttempt,
        { quizId: 'QUIZ-DOES-NOT-EXIST', answers: ALL_CORRECT },
        { context: await session(userId) }
      )
    ).rejects.toThrow(ORPCError);
  });

  test('anonymous callers are rejected with 401', async () => {
    await expect(
      call(
        router.gamification.submitQuizAttempt,
        { quizId: ASNAF_QUIZ_ID, answers: ALL_CORRECT },
        { context: await createTestCaller({ database }) }
      )
    ).rejects.toThrow(ORPCError);
  });
});

describe('D2 — transaction points from the settlement hook', () => {
  let userId: string;
  let nadzirUserId: string;
  let nadzirProfileId: string;
  let programId: string;
  let orderId: string;
  let transactionId: string;

  beforeAll(async () => {
    const runId = ulid().toLowerCase();
    userId = `s11-d2-${runId}-user`;
    nadzirUserId = `s11-d2-${runId}-nadzir-user`;
    nadzirProfileId = `s11-d2-${runId}-nadzir`;
    programId = `s11-d2-${runId}-program`;
    orderId = `s11-d2-${runId}-order`;
    transactionId = `s11-d2-${runId}-txn`;

    await database.insert(schema.users).values([
      { id: userId, name: 'Wakif D2', updatedAt: now() },
      { id: nadzirUserId, name: 'Nadzir D2', updatedAt: now() },
    ]);
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      kategori: 'ORGANISASI',
      userId: nadzirUserId,
      updatedAt: now(),
    });
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      jenisWakaf: 'PRODUKTIF_KEKAL',
      judul: `Program D2 ${runId}`,
      nadzirProfileId,
      status: 'LIVE',
      targetDana: '100000000',
      updatedAt: now(),
    });
    await database.insert(schema.transactions).values({
      amount: '250000.00',
      disbursementDestination: 'Badan Pengelola Wakaf',
      id: transactionId,
      jenisTransaksi: 'WAKAF',
      statusPembayaran: 'LUNAS',
      wakifId: userId,
    });
    await database.insert(schema.waqfOrders).values({
      bentukWakaf: 'UANG',
      id: orderId,
      namaWakif: 'Wakif D2',
      nomorKwitansi: `KW-D2-${runId}`,
      status: 'TERVERIFIKASI',
      transactionId,
      waqfProgramId: programId,
      wakifId: userId,
    });
  });

  afterAll(async () => {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, programId));
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
    for (const id of [userId, nadzirUserId]) {
      await cleanupUser(id);
    }
  });

  test('a LUNAS donation pays +200 and +⌊nominal/1.000⌋ exactly once', async () => {
    const first = await settleTransactionPoints(database, 'WAQF', orderId);
    // The replayed webhook: same order, same transaction, second delivery.
    await settleTransactionPoints(database, 'WAQF', orderId);

    expect(first?.base).toBe(200);
    expect(first?.amount).toBe(250);
    expect(first?.awarded).toBe(true);

    const rows = await ledgerRows(userId);
    const settlementRows = rows.filter(
      (row) => row.activityType === 'TRANSACTION'
    );
    expect(settlementRows).toHaveLength(2);
    expect(settlementRows.map((row) => row.pointsEarned).sort()).toEqual([
      200, 250,
    ]);
    expect(await getBalance(database, userId)).toBe(450);
  });

  test('an order whose transaction is not LUNAS pays nothing', async () => {
    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'PENDING' })
      .where(eq(schema.transactions.id, transactionId));

    const result = await settleTransactionPoints(database, 'WAQF', orderId);
    expect(result).toBeNull();

    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'LUNAS' })
      .where(eq(schema.transactions.id, transactionId));
  });
});

describe('D6 — penalty settlement', () => {
  const today = '2026-10-01';
  let userId: string;

  beforeAll(async () => {
    // Registered well before the window, so the registration cutoff is not
    // what makes these assertions pass.
    userId = await createUser('2026-01-01 00:00:00.000');
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  test('a balance of 30 with three missed days lands on 0, never −30', async () => {
    await database.insert(schema.gamificationPointLedgers).values({
      activityType: 'TRANSACTION',
      id: `GPL-${ulid()}`,
      idempotencyKey: `test:d6-seed:${userId}`,
      pointsEarned: 30,
      userId,
    });

    const first = await settleUserPenalties(database, userId, today);
    expect(first.balance).toBe(0);

    const rows = (await ledgerRows(userId)).filter(
      (row) => row.activityType === 'PENALTY'
    );
    // Seven rows — including the five zero-amount ones. Those zeros are what
    // mark the day as settled, so a re-run cannot deduct a second time.
    expect(rows).toHaveLength(7);

    const second = await settleUserPenalties(database, userId, today);
    expect(second.balance).toBe(0);
    expect(second.settledDays).toBe(0);
    expect(
      (await ledgerRows(userId)).filter((row) => row.activityType === 'PENALTY')
    ).toHaveLength(7);
  });

  test('ten missed days only ever charge seven', async () => {
    const heavyUserId = await createUser('2026-01-01 00:00:00.000');

    try {
      await database.insert(schema.gamificationPointLedgers).values({
        activityType: 'TRANSACTION',
        id: `GPL-${ulid()}`,
        idempotencyKey: `test:d6-heavy:${heavyUserId}`,
        pointsEarned: 1000,
        userId: heavyUserId,
      });

      const settled = await settleUserPenalties(database, heavyUserId, today);

      expect(settled.balance).toBe(1000 - 7 * 20);
    } finally {
      await cleanupUser(heavyUserId);
    }
  });

  test('no penalty is charged for days before the account existed', async () => {
    const freshUserId = await createUser('2026-10-01 08:00:00.000');

    try {
      await database.insert(schema.gamificationPointLedgers).values({
        activityType: 'TRANSACTION',
        id: `GPL-${ulid()}`,
        idempotencyKey: `test:d6-fresh:${freshUserId}`,
        pointsEarned: 100,
        userId: freshUserId,
      });

      const settled = await settleUserPenalties(database, freshUserId, today);

      expect(settled.settledDays).toBe(0);
      expect(settled.balance).toBe(100);
    } finally {
      await cleanupUser(freshUserId);
    }
  });

  test('a streak survives an open day and breaks on a gap', () => {
    const checkins = new Set(['2026-09-30', '2026-09-29']);

    // Today is still open — the streak is not zeroed while the day runs.
    expect(streakDays(checkins, '2026-10-01')).toBe(2);
    // A gap breaks it.
    expect(streakDays(new Set(['2026-09-28']), '2026-10-01')).toBe(0);
  });
});

describe('POST /api/cron/streak', () => {
  const sweepUsers: string[] = [];

  beforeAll(async () => {
    // Two accounts, so a `limit=1` sweep is guaranteed to have a next page
    // regardless of what else is in the test database.
    sweepUsers.push(await createUser(), await createUser());
  });

  afterAll(async () => {
    for (const id of sweepUsers) {
      await cleanupUser(id);
    }
  });

  test('rejects a request without the cron secret', async () => {
    const response = await streakSweep({
      request: new Request('http://localhost/api/cron/streak', {
        method: 'POST',
      }),
    });

    expect(response.status).toBe(401);
  });

  test('rejects a request with the wrong secret', async () => {
    const response = await streakSweep({
      request: new Request('http://localhost/api/cron/streak', {
        headers: { 'x-cron-secret': 'nope' },
        method: 'POST',
      }),
    });

    expect(response.status).toBe(401);
  });

  test('sweeps a batch and reports the cursor', async () => {
    const response = await streakSweep({
      request: new Request('http://localhost/api/cron/streak?limit=1', {
        headers: {
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
        method: 'POST',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      processed: number;
      settled: number;
      nextCursor: string | null;
    };
    expect(body.processed).toBe(1);
    expect(body.settled).toBeLessThanOrEqual(1);
    expect(body.nextCursor).toBeString();
  });
});

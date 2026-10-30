import { describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** QA-08: tamu boleh bermain kuis 8 Asnaf; dinilai server, tidak menulis apa pun. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database = createDatabase(connectionUrl);

const ALL_CORRECT = {
  'asnaf-count': '8',
  'fakir-miskin': 'definisi',
  gharim: 'gharim',
  muallaf: 'ya',
  amil: 'amil',
};

describe('gamification.gradeQuiz (public)', () => {
  test('grades a guest server-side and writes no attempt, no points', async () => {
    const attemptsBefore = await database.select().from(schema.quizAttempts);
    const ledgerBefore = await database
      .select()
      .from(schema.gamificationPointLedgers);
    const context = await createTestCaller({ database, user: null });

    const passed = await call(
      router.gamification.gradeQuiz,
      { quizId: 'QUIZ-EDU-8-ASNAF', answers: ALL_CORRECT },
      { context }
    );
    expect(passed).toMatchObject({ correct: 5, total: 5, passed: true });

    const failed = await call(
      router.gamification.gradeQuiz,
      {
        quizId: 'QUIZ-EDU-8-ASNAF',
        answers: { ...ALL_CORRECT, amil: 'riqab' },
      },
      { context }
    );
    expect(failed.correct).toBe(4);

    expect((await database.select().from(schema.quizAttempts)).length).toBe(
      attemptsBefore.length
    );
    expect(
      (await database.select().from(schema.gamificationPointLedgers)).length
    ).toBe(ledgerBefore.length);
  });

  test('an unknown quiz is a 404, and saving an attempt still needs a session', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(
        router.gamification.gradeQuiz,
        { quizId: 'QUIZ-LAIN', answers: {} },
        { context }
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as ORPCError<string, unknown>).status).toBe(404);
    }
    try {
      await call(
        router.gamification.submitQuizAttempt,
        { quizId: 'QUIZ-EDU-8-ASNAF', answers: ALL_CORRECT },
        { context }
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });
});

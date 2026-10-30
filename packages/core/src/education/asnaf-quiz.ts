/**
 * Pure grading for the "8 Asnaf" education quiz (Sprint 11.1 remediation of
 * `I-10b`). Zone 0 — no DB, no oRPC.
 *
 * Before this module existed, `apps/web/src/components/education/
 * education-detail.tsx` computed the score in the browser and only ever
 * showed "+100 XP Berkah" as decoration — nothing was written to `quiz_attempts`, so
 * `gamification.claimQuiz` (which only reads a passing attempt, never
 * writes one) could never succeed. The answer key now lives here so the
 * oRPC handler grades the raw answers itself; a client can no longer just
 * call the endpoint with a forged 100% score.
 */

/** Stable id for the one hardcoded education quiz that exists today. */
export const ASNAF_QUIZ_ID = 'QUIZ-EDU-8-ASNAF';
export const ASNAF_QUIZ_TITLE = 'Kuis 8 Asnaf Penerima Zakat';

/**
 * question id -> correct option value. Mirrors `QUIZ_QUESTIONS` in
 * `education-detail.tsx` (the options/labels stay in the UI; only the
 * answer key needs to be trusted server-side).
 */
const ANSWER_KEY: Record<string, string> = {
  'asnaf-count': '8',
  'fakir-miskin': 'definisi',
  gharim: 'gharim',
  muallaf: 'ya',
  amil: 'amil',
};

const QUESTION_IDS = Object.keys(ANSWER_KEY);

/** Matches the PLAN §I-10b requirement ("lulus ≥80%") and the quiz's own UI copy. */
const PASS_PERCENTAGE = 80;

export interface AsnafQuizGrade {
  correct: number;
  total: number;
  percentage: number;
  passed: boolean;
}

/**
 * Grades a submitted answer set against the server-side key.
 *
 * A question id missing from `answers` simply counts as wrong — there is no
 * "ungraded" state, so a partial submission can never inflate the
 * percentage. Ids not in the key are ignored (forward-compatible with a
 * client that sends extra fields).
 */
export function gradeAsnafQuiz(
  answers: Record<string, string>
): AsnafQuizGrade {
  const total = QUESTION_IDS.length;
  let correct = 0;
  for (const id of QUESTION_IDS) {
    if (answers[id] === ANSWER_KEY[id]) {
      correct += 1;
    }
  }
  const percentage = Math.round((correct / total) * 100);
  return {
    correct,
    total,
    percentage,
    passed: percentage >= PASS_PERCENTAGE,
  };
}

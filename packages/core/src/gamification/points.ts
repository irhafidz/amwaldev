/**
 * Pure point-award arithmetic (Sprint 11, I-10 — Zone 0).
 *
 * D2: a LUNAS transaction awards two ledger rows with separate idempotency
 * keys — `txn:{transactionId}` (+200) and `txnamt:{transactionId}`
 * (+⌊nominal/1.000⌋). Splitting them means a replayed webhook can never award
 * either half twice. Points are non-monetary.
 */

export interface TransactionPoints {
  /** Flat award for a settled transaction. */
  base: number;
  /** Amount-proportional award, ⌊nominal rupiah / 1.000⌋. */
  amount: number;
}

const FLAT_SETTLEMENT_POINTS = 200;
const RUPIAH_PER_AMOUNT_POINT = 1000;
const DAILY_CHECKIN_POINTS = 50;
const REGISTRATION_POINTS = 1000;
const QUIZ_POINTS = 100;
const READ_POINTS = 50;
const WATCH_POINTS = 50;

/**
 * The fixed awards from the D2/D6 table. Settlement and affiliate awards are
 * computed (`transactionPoints`, `affiliateRewardPoints`); these are the ones
 * an activity is simply worth, kept next to their idempotency keys so a
 * procedure cannot pay a different amount than the contract documents.
 */
export const ACTIVITY_POINTS = {
  REGISTER: REGISTRATION_POINTS,
  CHECKIN: DAILY_CHECKIN_POINTS,
  QUIZ: QUIZ_POINTS,
  READ: READ_POINTS,
  WATCH: WATCH_POINTS,
} as const;

/** `register:{userId}` — once per account, no matter how often it is called. */
export function registerKey(userId: string): string {
  return `register:${userId}`;
}

/** `checkin:{userId}:{YYYY-MM-DD WIB}` — the date comes from the server. */
export function checkInKey(userId: string, wibDate: string): string {
  return `checkin:${userId}:${wibDate}`;
}

/** `quiz:{userId}:{quizId}` — once per quiz, not once per attempt. */
export function quizKey(userId: string, quizId: string): string {
  return `quiz:${userId}:${quizId}`;
}

/** `read:{userId}:{contentId}` — dwell is verified before this is called. */
export function readKey(userId: string, contentId: string): string {
  return `read:${userId}:${contentId}`;
}

/** `watch:{userId}:{contentId}` — the first item cut if scope must shrink. */
export function watchKey(userId: string, contentId: string): string {
  return `watch:${userId}:${contentId}`;
}

/**
 * D2 — points for a LUNAS transaction. `amountRupiah` is whole rupiah from
 * `transactions.amount`; fractional rupiah is rejected by the caller.
 */
export function transactionPoints(amountRupiah: number): TransactionPoints {
  if (!Number.isSafeInteger(amountRupiah) || amountRupiah < 0) {
    throw new Error('amountRupiah must be a non-negative whole rupiah amount');
  }
  return {
    base: FLAT_SETTLEMENT_POINTS,
    amount: Math.floor(amountRupiah / RUPIAH_PER_AMOUNT_POINT),
  };
}

/** D2 idempotency keys for the two settlement ledger rows. */
export function transactionPointKeys(transactionId: string): {
  base: string;
  amount: string;
} {
  return {
    base: `txn:${transactionId}`,
    amount: `txnamt:${transactionId}`,
  };
}

const AFFILIATE_FLOOR = 100;
const RUPIAH_PER_AFFILIATE_POINT = 10_000;
const AFFILIATE_CAP = 500;

/**
 * I-4 — referral reward for a converted LUNAS donation:
 * `min(100 + ⌊nominal/10.000⌋, 500)`. Not paid from ZISWAF funds.
 */
export function affiliateRewardPoints(amountRupiah: number): number {
  if (!Number.isSafeInteger(amountRupiah) || amountRupiah < 0) {
    throw new Error('amountRupiah must be a non-negative whole rupiah amount');
  }
  return Math.min(
    AFFILIATE_FLOOR + Math.floor(amountRupiah / RUPIAH_PER_AFFILIATE_POINT),
    AFFILIATE_CAP
  );
}

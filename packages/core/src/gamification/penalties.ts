/**
 * Pure penalty settlement arithmetic (Sprint 11, I-10 — Zone 0).
 *
 * D6: a user who does not check in is penalised −20 points per missed day,
 * looking back at most 7 days, and the balance is floored at 0. Zero-penalty
 * rows are still emitted — that is what marks a day "settled" so a re-run
 * always yields an identical balance.
 */

export interface Penalty {
  date: string;
  amount: number;
}

const DAILY_PENALTY = 20;
const MAX_LOOKBACK_DAYS = 7;

/**
 * Computes penalty rows for the trailing 7 days. Dates are `YYYY-MM-DD` in
 * WIB — the caller derives `today` from `wibParts()`; this function stays
 * timezone-agnostic and does pure calendar arithmetic.
 */
export function settlePenalties(
  balance: number,
  checkinDates: ReadonlySet<string>,
  today: string,
  /**
   * `YYYY-MM-DD` WIB date the account was created. Days before it are never
   * charged — a penalty cannot predate the account (backlog `I-10`, defensif).
   */
  registeredOn?: string
): Penalty[] {
  const penalties: Penalty[] = [];
  let remaining = balance;

  for (let i = 1; i <= MAX_LOOKBACK_DAYS; i++) {
    const date = daysAgo(today, i);
    if (checkinDates.has(date) || (registeredOn && date < registeredOn)) {
      continue;
    }

    const amount = Math.min(DAILY_PENALTY, remaining);
    penalties.push({ date, amount });
    remaining -= amount;
  }

  return penalties;
}

/** Subtracts `n` days from a `YYYY-MM-DD` date string, crossing month/year. */
function daysAgo(dateStr: string, n: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/** Idempotency key for a penalty row. */
export function penaltyKey(userId: string, date: string): string {
  return `penalty:${userId}:${date}`;
}

import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { GamificationActivityType } from '../contracts/gamification';
import { gamificationPointLedgers, users } from '../db/schema';
import type { Database } from '../db/types';
import { toWibDate } from '../time/wib';
import { penaltyKey, settlePenalties as planPenalties } from './penalties';

/**
 * Gamification ledger kernel (Sprint 11, `I-10` / `I-10b` — Zone 0).
 *
 * Two invariants carry the whole feature, and both live here rather than in a
 * procedure, because every caller must get them (§D2, §D6):
 *
 * 1. **Every award is one `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`.**
 *    A replayed webhook, a double-tapped check-in or a re-run sweep can never
 *    pay twice — the database decides, not a read-then-write check.
 * 2. **The balance is never negative.** Penalties are planned against the
 *    balance as it stands inside the same transaction that holds a per-user
 *    advisory lock, and zero-amount rows are still written: that row is what
 *    marks the day as settled, so re-running always yields the same balance.
 *
 * Point arithmetic itself stays pure (`./points`, `./penalties`); this module
 * only moves it in and out of the database.
 */

type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

/** Both a connection and a transaction can run these queries. */
export type GamificationDatabase = Database | DatabaseTransaction;

export interface AwardInput {
  userId: string;
  activityType: GamificationActivityType;
  /** One key per *activity*, never per invocation — see the contract file. */
  idempotencyKey: string;
  /** Signed; only penalties are negative, and the kernel computes them. */
  points: number;
  sourceRef?: string;
}

/** `true` when this call actually paid — `false` means it was already paid. */
export async function award(
  database: GamificationDatabase,
  input: AwardInput
): Promise<boolean> {
  const rows = await database
    .insert(gamificationPointLedgers)
    .values({
      id: `GPL-${ulid()}`,
      userId: input.userId,
      activityType: input.activityType,
      pointsEarned: input.points,
      idempotencyKey: input.idempotencyKey,
      sourceRef: input.sourceRef ?? null,
    })
    .onConflictDoNothing({
      target: gamificationPointLedgers.idempotencyKey,
    })
    .returning({ id: gamificationPointLedgers.id });

  return rows.length > 0;
}

/** READ/WATCH claims one user can collect per rolling 24 hours. */
export const DAILY_CONTENT_CLAIM_LIMIT = 10;

export type CappedAwardResult = 'AWARDED' | 'DUPLICATE' | 'LIMIT_REACHED';

/**
 * `award` for the content activities (READ/WATCH). A replay of an already paid
 * claim stays a `DUPLICATE` value; only a *new* claim past the daily limit is
 * refused, so farming fresh content ids cannot mint unbounded points.
 *
 * ponytail: count-then-insert is not atomic, so a burst of parallel claims can
 * overshoot the limit by a few rows. Take the per-user advisory lock (see
 * `settleUserPenalties`) if that ever matters.
 */
export async function awardContent(
  database: GamificationDatabase,
  input: AwardInput,
  limit = DAILY_CONTENT_CLAIM_LIMIT
): Promise<CappedAwardResult> {
  const [recent] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(gamificationPointLedgers)
    .where(
      and(
        eq(gamificationPointLedgers.userId, input.userId),
        or(
          eq(gamificationPointLedgers.activityType, 'READ'),
          eq(gamificationPointLedgers.activityType, 'WATCH')
        ),
        sql`${gamificationPointLedgers.createdAt} > CURRENT_TIMESTAMP - interval '24 hours'`
      )
    );

  if ((recent?.n ?? 0) >= limit) {
    const [existing] = await database
      .select({ id: gamificationPointLedgers.id })
      .from(gamificationPointLedgers)
      .where(eq(gamificationPointLedgers.idempotencyKey, input.idempotencyKey))
      .limit(1);
    return existing ? 'DUPLICATE' : 'LIMIT_REACHED';
  }

  return (await award(database, input)) ? 'AWARDED' : 'DUPLICATE';
}

/**
 * Sum of every ledger row for one user. `numeric`/`integer` sums come back as
 * strings from the driver, so the cast is explicit — and it is clamped at 0
 * because `pointsEarned` may never add up to a negative balance by design.
 */
export async function getBalance(
  database: GamificationDatabase,
  userId: string
): Promise<number> {
  const [row] = await database
    .select({
      total: sql<string>`coalesce(sum(${gamificationPointLedgers.pointsEarned}), 0)`,
    })
    .from(gamificationPointLedgers)
    .where(eq(gamificationPointLedgers.userId, userId));

  return Math.max(0, Number(row?.total ?? 0));
}

/** WIB calendar dates the user already checked in — the penalty input. */
export async function getCheckInDates(
  database: GamificationDatabase,
  userId: string
): Promise<Set<string>> {
  const rows = await database
    .select({ createdAt: gamificationPointLedgers.createdAt })
    .from(gamificationPointLedgers)
    .where(
      and(
        eq(gamificationPointLedgers.userId, userId),
        eq(gamificationPointLedgers.activityType, 'CHECKIN')
      )
    );

  return new Set(rows.map((row) => toWibDate(row.createdAt)));
}

/** Consecutive check-in days ending today (or yesterday, if today is still open). */
export function streakDays(
  checkinDates: ReadonlySet<string>,
  today: string
): number {
  let streak = 0;
  let cursor = today;

  // A streak is not broken until the day is over, so a missing "today" looks
  // back one day instead of zeroing the count.
  if (!checkinDates.has(cursor)) {
    cursor = previousDay(cursor);
  }

  while (checkinDates.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return streak;
}

function previousDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export interface LedgerPage {
  items: Array<{
    id: string;
    activityType: string;
    points: number;
    createdAt: string;
    sourceRef: string | null;
  }>;
  nextCursor: string | null;
}

/**
 * Newest-first page of one user's ledger. The cursor is the last row's id, and
 * the keyset predicate is `(createdAt, id)` — offset pagination would skip or
 * repeat rows whenever the sweep writes while a donor scrolls.
 */
export async function listLedger(
  database: GamificationDatabase,
  userId: string,
  options: { limit: number; cursor?: string }
): Promise<LedgerPage> {
  const cursorRow = options.cursor
    ? (
        await database
          .select({
            createdAt: gamificationPointLedgers.createdAt,
            id: gamificationPointLedgers.id,
          })
          .from(gamificationPointLedgers)
          .where(
            and(
              eq(gamificationPointLedgers.id, options.cursor),
              eq(gamificationPointLedgers.userId, userId)
            )
          )
          .limit(1)
      ).at(0)
    : undefined;

  if (options.cursor && !cursorRow) {
    return { items: [], nextCursor: null };
  }

  const rows = await database
    .select({
      id: gamificationPointLedgers.id,
      activityType: gamificationPointLedgers.activityType,
      points: gamificationPointLedgers.pointsEarned,
      createdAt: gamificationPointLedgers.createdAt,
      sourceRef: gamificationPointLedgers.sourceRef,
    })
    .from(gamificationPointLedgers)
    .where(
      cursorRow
        ? and(
            eq(gamificationPointLedgers.userId, userId),
            or(
              lt(gamificationPointLedgers.createdAt, cursorRow.createdAt),
              and(
                eq(gamificationPointLedgers.createdAt, cursorRow.createdAt),
                lt(gamificationPointLedgers.id, cursorRow.id)
              )
            )
          )
        : eq(gamificationPointLedgers.userId, userId)
    )
    .orderBy(
      desc(gamificationPointLedgers.createdAt),
      desc(gamificationPointLedgers.id)
    )
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const items = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  };
}

export interface PenaltySettlement {
  balance: number;
  /** Days whose penalty row was written by *this* call. */
  settledDays: number;
}

/**
 * D6 — settle the trailing 7 days of missed check-ins for one user.
 *
 * Called lazily by `summary`/`checkIn` and by the nightly sweep; both paths
 * run this same function so the two can never disagree. The advisory lock is
 * per user (`hashtext`), so two concurrent reads for the same donor serialise
 * while everybody else proceeds — and `transactions` is never locked.
 */
export function settleUserPenalties(
  database: Database,
  userId: string,
  today: string
): Promise<PenaltySettlement> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [account] = await tx
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const balance = await getBalance(tx, userId);
    const checkinDates = await getCheckInDates(tx, userId);
    const penalties = planPenalties(
      balance,
      checkinDates,
      today,
      account ? toWibDate(account.createdAt) : undefined
    );

    // One statement, not a loop: every planned day is written together, and
    // `ON CONFLICT DO NOTHING` makes the whole settlement safe to re-run.
    // A plan can legitimately be empty (a brand-new account has no days
    // before it), and Drizzle refuses `values([])` — hence the guard.
    const inserted =
      penalties.length === 0
        ? []
        : await tx
            .insert(gamificationPointLedgers)
            .values(
              penalties.map((penalty) => ({
                id: `GPL-${ulid()}`,
                userId,
                activityType: 'PENALTY',
                pointsEarned: -penalty.amount,
                idempotencyKey: penaltyKey(userId, penalty.date),
                sourceRef: penalty.date,
              }))
            )
            .onConflictDoNothing({
              target: gamificationPointLedgers.idempotencyKey,
            })
            .returning({ id: gamificationPointLedgers.id });

    return {
      balance: await getBalance(tx, userId),
      settledDays: inserted.length,
    };
  });
}

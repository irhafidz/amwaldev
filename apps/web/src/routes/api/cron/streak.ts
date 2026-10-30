import { timingSafeEqual } from 'node:crypto';
import { settleUserPenalties } from '@amwal/core/gamification/ledger';
import { toWibDate } from '@amwal/core/time/wib';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { asc, gt } from 'drizzle-orm';
import { env } from '@/env/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

/**
 * Nightly penalty sweep (`I-10b`) — `POST /api/cron/streak`.
 *
 * The sweep does not own a second implementation of D6: it calls
 * `settleUserPenalties()`, the exact function the lazy path in
 * `gamification.summary` calls. Two implementations of "how much is deducted"
 * is how a donor's balance starts depending on which one ran first.
 *
 * Guarded by `CRON_SECRET`; without the right secret nothing touches the
 * database at all. Safe to re-run: every penalty row is idempotency-keyed.
 */

/** Users per invocation unless the caller asks for less. */
const BATCH_SIZE = 500;
/** Concurrent settlements; each holds one user-scoped advisory lock. */
const CONCURRENCY = 25;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function authorized(request: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  // Header, not query string: URLs end up in access logs and referrers.
  const presented = request.headers.get('x-cron-secret');
  if (presented === null) {
    return false;
  }
  const actual = Buffer.from(presented);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function settleChunk(userIds: string[], today: string): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const chunk = userIds.slice(0, CONCURRENCY);
  const results = await Promise.allSettled(
    chunk.map((userId) => settleUserPenalties(db, userId, today))
  );
  const settled = results.filter(
    (result) => result.status === 'fulfilled'
  ).length;

  return settled + (await settleChunk(userIds.slice(CONCURRENCY), today));
}

export async function handle({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!authorized(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(
    BATCH_SIZE,
    Math.max(
      1,
      Number(url.searchParams.get('limit') ?? BATCH_SIZE) || BATCH_SIZE
    )
  );
  const cursor = url.searchParams.get('cursor');

  const batch = await db
    .select({ id: users.id })
    .from(users)
    .where(cursor ? gt(users.id, cursor) : undefined)
    .orderBy(asc(users.id))
    .limit(limit + 1);

  const hasMore = batch.length > limit;
  const page = hasMore ? batch.slice(0, limit) : batch;

  if (page.length === 0) {
    return jsonResponse({ processed: 0, nextCursor: null }, 200);
  }

  const settled = await settleChunk(
    page.map((row) => row.id),
    toWibDate(new Date())
  );

  return jsonResponse(
    {
      processed: page.length,
      settled,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    },
    200
  );
}

export const ServerRoute = createServerFileRoute('/api/cron/streak').methods({
  POST: handle,
});

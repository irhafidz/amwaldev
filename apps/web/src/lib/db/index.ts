import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/env/server';
// biome-ignore lint/performance/noNamespaceImport: the Drizzle schema bag needs every table export
import * as schema from './schema';

/**
 * Server-only Drizzle client for the fullstack `apps/web` (Putaran 17).
 *
 * Same driver (`postgres-js`) and `schema.ts`/`relations.ts` (byte-identical,
 * verified by sha256 at copy time — see docs/PUTARAN-17.md) as
 * `apps/server/src/db/index.ts`, so Batch 1+ ports read/write exactly the
 * same rows the same way. Import this ONLY from a `createServerFn` handler
 * or a `routes/api/*` server route — never from a route `component`.
 */
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Drizzle's postgres-js driver sends every query through `sql.unsafe(...)`,
 * which postgres.js runs as an unnamed statement: Parse+Describe, wait, then
 * Bind+Execute, i.e. two round trips per query. A named (prepared) statement is
 * parsed once per connection and then costs one. The pool-level `prepare: true`
 * option never reached this path, so it is applied here, to the pool and to the
 * transaction handles `begin()` passes to its callback.
 *
 * Measured against a 186 ms round trip: 378 ms -> 236 ms per query, and a
 * five-query procedure 1.9 s -> 0.96 s once the statements are prepared.
 */
// biome-ignore lint/suspicious/noExplicitAny: postgres.js overloads are not expressible without the library's internal types
function preferPrepared<T extends { unsafe: any }>(sql: T): T {
  const unsafe = sql.unsafe.bind(sql);
  sql.unsafe = (query: string, parameters?: unknown[], options?: object) =>
    unsafe(query, parameters, { prepare: true, ...options });
  return sql;
}

/**
 * `max: 10` (Audit Remote Supabase, Sept 2026) — the connection string in
 * `DATABASE_URL` is Supabase's *session* pooler (`*.pooler.supabase.com:5432`,
 * Supavisor session mode), which caps the **whole project** at a fixed
 * `pool_size` (15 on this project's plan) regardless of how many app
 * instances connect. `max: 20` on a single process could exhaust that
 * budget by itself and lock out every other consumer (another dev, a
 * migration script, the wa-bot service) with
 * `(EMAXCONNSESSION) max clients reached in session mode`. Session mode
 * does support prepared statements, so `prepare: true` stays correct here —
 * only the *transaction* pooler (port 6543) would need `prepare: false`.
 */
export function createDatabase(connectionUrl: string): Database {
  const client = postgres(connectionUrl, {
    max: 10,
    prepare: true,
    // `bun test` runs every file in one process and never closes the pools, so
    // ~70 files x 2 pools would exhaust Postgres' `max_connections`. Dropping
    // idle connections quickly keeps the suite under the limit; production
    // keeps the driver default.
    //
    // Tests also pin the session to UTC. The code reads naive `timestamp(3)`
    // values as UTC, so a developer machine running Postgres in Asia/Jakarta or
    // Asia/Bangkok made "per WIB day" tests (check-in, affiliate daily cap)
    // fail for part of the day.
    ...(process.env.NODE_ENV === 'test'
      ? { idle_timeout: 1, connection: { TimeZone: 'UTC' } }
      : {}),
  });

  preferPrepared(client);
  const begin = client.begin.bind(client) as (...args: unknown[]) => unknown;
  // biome-ignore lint/suspicious/noExplicitAny: same reason as above (begin has several overloads)
  (client as any).begin = (...args: unknown[]) => {
    const callback = args.pop() as (tx: never) => unknown;
    return begin(...args, (tx: { unsafe: unknown }) =>
      callback(preferPrepared(tx as { unsafe: never }) as never)
    );
  };

  return drizzle(client, { schema });
}

/**
 * The app's one pool, kept on `globalThis`. In dev, Vite re-evaluates this
 * module whenever a server file changes; without this every reload opened a
 * brand-new pool (each cold connection costs ~1.2 s to the VPS) and orphaned
 * the old one. Tests call `createDatabase` directly and keep their own pools.
 */
const globalDb = globalThis as typeof globalThis & { __amwalDb?: Database };
globalDb.__amwalDb ??= createDatabase(env.DATABASE_URL);

export const db: Database = globalDb.__amwalDb;

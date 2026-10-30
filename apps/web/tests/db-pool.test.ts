import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { assertTestDatabase } from './test-database-guard';

const connectionUrl = assertTestDatabase();
const { createDatabase } = await import('../src/lib/db');

async function preparedCount(
  run: (query: ReturnType<typeof sql>) => Promise<unknown>
): Promise<number> {
  const rows = (await run(
    sql`select count(*)::int as n from pg_prepared_statements`
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}

describe('createDatabase', () => {
  test('the default connection lives on globalThis, so module reloads reuse it', async () => {
    const { db } = await import('../src/lib/db');

    expect((globalThis as { __amwalDb?: unknown }).__amwalDb).toBe(db);
  });

  test('Drizzle queries become named (prepared) statements on the pool', async () => {
    const database = createDatabase(connectionUrl);
    // Same connection is reused for sequential queries.
    await database.execute(sql`select ${1}::int as one`);

    expect(
      await preparedCount((query) => database.execute(query))
    ).toBeGreaterThan(0);
  });

  test('and inside a transaction', async () => {
    const database = createDatabase(connectionUrl);

    const inside = await database.transaction(async (tx) => {
      await tx.execute(sql`select ${2}::int as two`);
      return await preparedCount((query) => tx.execute(query));
    });

    expect(inside).toBeGreaterThan(0);
  });
});

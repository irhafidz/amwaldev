import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Baselines drizzle's migration bookkeeping (`drizzle.__drizzle_migrations`)
 * for a database whose 0000–0003 schema exists but was never applied
 * through `drizzle-kit migrate` — e.g. restored from a Supabase dump. Without
 * this, `bun run db:migrate` tries to replay `0000_baseline` from scratch and
 * fails on `CREATE TYPE ... already exists`.
 *
 * Idempotent: each row is keyed by its migration file's sha256 hash with
 * `ON CONFLICT (hash) DO NOTHING`, so re-running is a no-op once baselined.
 *
 * Usage: DATABASE_URL=postgres://... bun scripts/baseline-migrations.ts
 */

const BASELINE_TAGS = [
  '0000_baseline',
  '0001_infaq_orders',
  '0002_admin_waqf_review',
  '0003_sharp_silver_sable',
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const migrationsDir = join(import.meta.dir, '..', 'apps', 'web', 'drizzle');
const journal: { entries: Array<{ tag: string; when: number }> } = JSON.parse(
  readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')
);

const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS __drizzle_migrations_hash_key
    ON drizzle.__drizzle_migrations (hash)
  `;

  for (const tag of BASELINE_TAGS) {
    const entry = journal.entries.find((e) => e.tag === tag);
    if (!entry) {
      throw new Error(`Migration "${tag}" not found in meta/_journal.json`);
    }

    const sqlFile = readFileSync(join(migrationsDir, `${tag}.sql`), 'utf8');
    const hash = createHash('sha256').update(sqlFile).digest('hex');

    const inserted = await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
      ON CONFLICT (hash) DO NOTHING
      RETURNING id
    `;

    console.log(
      inserted.length > 0
        ? `baselined ${tag} (${hash.slice(0, 8)})`
        : `skip ${tag} — already baselined`
    );
  }
} finally {
  await sql.end();
}

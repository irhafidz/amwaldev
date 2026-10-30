import { users, wilayah, zakatFitrahConfig } from '@amwal/core/db/schema';
import {
  SYSTEM_ANONYMOUS_EMAIL,
  SYSTEM_ANONYMOUS_USER_ID,
} from '@amwal/core/identity/guest';
import { sql } from 'drizzle-orm';
import { env } from '@/env/server';
import { db } from './index';

/**
 * `db/seeds/wilayah.sql` (repo root) is ~90k idempotent `INSERT ... ON
 * CONFLICT (kode) DO NOTHING` rows — master Kode Wilayah data, not
 * dev-account fixtures. Loading it through the ORM row-by-row would be
 * needlessly slow; `psql` loads the whole file in one round trip (~5s for
 * 90k rows against Supabase), so shell out to it instead of reinventing a
 * bulk-SQL runner. Skipped entirely if the table is already populated or
 * `psql` isn't on PATH — this step is optional, not seed-critical.
 */
const WILAYAH_SEED_PATH = `${import.meta.dir}/../../../../../db/seeds/wilayah.sql`;

async function seedWilayah(): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wilayah);
  if ((row?.count ?? 0) > 0) {
    report(`✓ wilayah                already seeded (${row?.count} baris)`);
    return;
  }

  const proc = Bun.spawn(
    [
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      env.DATABASE_URL,
      '-f',
      WILAYAH_SEED_PATH,
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    report(
      `⚠ wilayah                dilewati — psql gagal atau tidak tersedia (${stderr.trim().slice(0, 200) || `exit ${exitCode}`})`
    );
    return;
  }

  const [after] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wilayah);
  report(
    `✓ wilayah                ${after?.count ?? 0} baris dimuat dari wilayah.sql`
  );
}

/**
 * Idempotent development seeder — `bun run db:seed` from `apps/web`.
 *
 * Restored in Fase 1 of the Sprint 10 parity audit. The original
 * (`546886a`, S10-N-05) was deleted in `8702038` while its `package.json`
 * script stayed behind, so there was no supported way to get a test account.
 * Three things had to change on the way back in:
 *
 * 1. Schema now comes from `@amwal/core/db/schema`, not the deleted
 *    `./schema/auth` directory.
 * 2. Passwords are hashed with **bcrypt explicitly**, matching
 *    `lib/orpc/router/auth.ts`. The original used `Bun.password.hash()` with
 *    no options, which defaults to argon2id — the frozen Next.js app reads
 *    this same `users` table and cannot verify argon2, so those accounts
 *    would have authenticated here and nowhere else.
 * 3. `users.updated_at` is NOT NULL with no default; the original omitted it.
 *
 * The anonymous system row mirrors `ensureSystemAnonymousUser()` in
 * `@amwal/core/identity/guest` field for field — if the two drift, guest
 * checkout starts writing against a row this seeder overwrote.
 */

const BCRYPT_OPTIONS = { algorithm: 'bcrypt', cost: 10 } as const;

/** Development only. Never seeded against a production DATABASE_URL. */
const TEST_PASSWORD = 'Amwal123!';

const TEST_ACCOUNTS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Admin Test',
    email: 'admin@amwal.local',
    role: 'ADMIN',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Nadzir Test',
    email: 'nadzir@amwal.local',
    role: 'NADZIR',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Petugas Test',
    email: 'petugas@amwal.local',
    role: 'PETUGAS_LAPANGAN',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Wakif Test',
    email: 'wakif@amwal.local',
    role: 'WAKIF',
  },
] as const;

function report(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function seed(): Promise<void> {
  const now = new Date().toISOString();

  await db
    .insert(users)
    .values({
      id: SYSTEM_ANONYMOUS_USER_ID,
      email: SYSTEM_ANONYMOUS_EMAIL,
      name: 'Hamba Allah (Sistem)',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { updatedAt: now },
    });
  report(`✓ anonymous system user  ${SYSTEM_ANONYMOUS_USER_ID}`);

  const passwordHash = await Bun.password.hash(TEST_PASSWORD, BCRYPT_OPTIONS);

  for (const account of TEST_ACCOUNTS) {
    // Re-running refreshes the hash and role on purpose: a seeded account
    // whose password silently stopped matching is worse than no account.
    await db
      .insert(users)
      .values({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        passwordHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: account.name,
          email: account.email,
          role: account.role,
          passwordHash,
          updatedAt: now,
        },
      });
    report(`✓ ${account.role.padEnd(17)} ${account.email}`);
  }

  report(`\nSemua akun uji memakai kata sandi: ${TEST_PASSWORD}`);

  await db
    .insert(zakatFitrahConfig)
    .values({
      id: 'fitrah-default-2026',
      jenisBeras: 'Beras Standar',
      konversiHargaPerJiwa: '45000.00',
      referensiSk: 'Standar BAZNAS (2,5 kg beras)',
      tahunBerlaku: '1447H / 2026M',
      isActive: true,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: zakatFitrahConfig.id });
  report('✓ zakat fitrah config   Rp 45.000 / jiwa');

  await seedWilayah();
}

seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Seed gagal: ${message}\n`);
    process.exit(1);
  });

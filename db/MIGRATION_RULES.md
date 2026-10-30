# MIGRATION_RULES.md

**Read this before writing any migration.** It lives next to the schema, not in `/docs`,
so that nobody writes one without seeing it.

A **frozen Next.js / Prisma application is still reading this same Supabase database.**
Every rule below exists because breaking it breaks that app - usually somewhere unrelated,
and usually silently.

---

## The workflow - the only one

```bash
# Once, at project start
bun drizzle-kit pull        # read-only introspection -> schema.ts

# Every schema change, forever after
bun drizzle-kit generate    # -> drizzle/00NN_name.sql - COMMITTED and REVIEWED
bun drizzle-kit migrate     # the only way schema changes, local and staging alike
```

**`drizzle-kit push` is banned.** It is not in `package.json` and must never be added.
It is the direct equivalent of `prisma db push`, which is how the legacy repo ended up with
38 models and 2 migrations (finding AMW-01) - a database that could not be rebuilt from its
own repository.

---

## Schema drift: baselining `drizzle.__drizzle_migrations`

If a staging/production database's 0000-0003 schema was applied outside `drizzle-kit`
(restored from a dump, hand-run SQL, etc.), `drizzle.__drizzle_migrations` is empty even
though the tables already exist, and `bun run db:migrate` fails trying to replay
`0000_baseline` from scratch (`CREATE TYPE ... already exists`). Run
`DATABASE_URL=postgres://... bun scripts/baseline-migrations.ts` to insert the correct
bookkeeping rows for 0000-0003 (keyed by each migration file's sha256 hash, `ON CONFLICT
DO NOTHING`, safe to re-run) before running `db:migrate` normally to apply anything newer.

---

## The six rules

### Rule 1 - Additive operations only

Only these operations are allowed against the shared database:

- `CREATE TABLE`
- `ADD COLUMN`
- `CREATE INDEX`

Anything that removes, renames, or reshapes existing objects is forbidden. See Rule 3.

### Rule 2 - New columns are nullable or carry a DEFAULT

Prisma's generated `INSERT` statements do not mention your new column. Without a default,
every legacy insert into that table fails.

```sql
-- correct
ALTER TABLE waqf_orders ADD COLUMN referral_code text;
ALTER TABLE waqf_orders ADD COLUMN is_featured boolean NOT NULL DEFAULT false;

-- breaks the legacy app immediately
ALTER TABLE waqf_orders ADD COLUMN referral_code text NOT NULL;
```

### Rule 3 - Destructive and reshaping operations are forbidden

**Strictly forbidden:**

- `DROP TABLE`
- `DROP COLUMN`
- `RENAME TABLE`
- `RENAME COLUMN`
- narrowing `ALTER TYPE` (removing values)
- `SET NOT NULL` on an existing column
- changing an existing column's type

The pre-commit guard rejects staged SQL containing these patterns before a branch is made.
The check is only a safety net; it is not permission to hand-edit a generated migration.

### Rule 4 - Never run Prisma migration commands or `drizzle-kit push`

`prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, and `drizzle-kit push`
all compare a client schema against the live database. The legacy app and the Amwal
schema must both keep working; any tool that can propose dropping the other side's tables
is banned.

The legacy repo is tagged `frozen-nextjs-v1` and is not to be touched. If someone must run
something there, it is read-only or it does not happen.

### Rule 5 - `CREATE INDEX CONCURRENTLY` on populated tables

A plain `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock. On a table the Vercel app is
reading, that means user-visible timeouts.

```sql
CREATE INDEX CONCURRENTLY idx_waqf_orders_program ON waqf_orders (waqf_program_id);
```

Note: `CONCURRENTLY` cannot run inside a transaction block. Put it in its own migration file.

### Rule 6 - Enums: text + CHECK constraint for new modules

Do not alter existing enum types while the frozen Next.js app is live. Its generated client
validates enum values on read; a row using an unknown value makes it throw at read time.

For genuinely new categories and modules, use a **`text` column plus a `CHECK` constraint**
in a **new table**, which the legacy Prisma client never reads.

```sql
-- correct approach for new modules this sprint
CREATE TABLE infaq_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis text NOT NULL CHECK (jenis IN ('INFAQ', 'SEDEKAH')),
  nominal numeric(18,2) NOT NULL,
  ...
);

-- do NOT do this while the legacy app is live
ALTER TYPE "TransactionType" ADD VALUE 'SEDEKAH';
```

Normalise to a real enum only after the Next.js app is fully retired.

---

## Connection invariant - always port 5432

DDL requires session mode. The transaction pooler on `:6543` will fail or behave
unpredictably for schema changes. `drizzle.config.ts` must point at the `:5432` URL,
regardless of what the application runtime uses.

---

## Money columns

Every monetary column is `numeric(18,2)`. Never `real`, never `double precision`.
After `drizzle-kit pull`, verify:

```bash
grep -c "doublePrecision\|real(" src/db/schema.ts    # must be 0 for money columns
```

Drizzle returns `numeric` as a **string**. Parse it deliberately - a decimal library or
integer cents - never `parseFloat` on a value you intend to write back.

---

## Automated guards

```bash
# CI - pull request goes red if schema and migrations diverge
bun drizzle-kit check

# pre-commit - reject destructive SQL before it reaches a branch
# Implemented in scripts/guard-destructive-sql.mjs and wired in lefthook.yml
```

---

## Review checklist for every migration PR

- [ ] The generated `.sql` file is committed and has been **read by a human**
- [ ] Only additive operations appear in it
- [ ] Every new column is nullable or has a `DEFAULT`
- [ ] No new enum value is written to by application code in this same PR
- [ ] Indexes on populated tables use `CONCURRENTLY`, in their own migration file
- [ ] `drizzle-kit check` passes
- [ ] **Legacy app opened after applying the migration and confirmed still working**

The last item is not optional. It is the only check that catches Rule 6.

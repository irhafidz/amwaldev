# CODING_CONVENTIONS.md — oRPC + Drizzle Patterns

Copy these patterns verbatim. Consistency matters more than personal preference here:
a coding model that sees one pattern repeated produces that pattern; a model that sees three
variations invents a fourth.

> **Updated for Putaran 17.** This file used to document Hono route handlers.
> `apps/server` no longer exists — data endpoints are oRPC procedures inside
> `apps/web`, and framework-agnostic domain logic lives in `packages/core`.
> The *rules* below (validation in Indonesian, structural RBAC, pure domain
> functions with zero ORM imports, money as integers) are unchanged; only the
> transport they are expressed in changed.

---

## 1. Folder Structure

```
packages/core/src/        ← @amwal/core — framework-agnostic, ZERO app imports
  db/        schema.ts    ← single source of truth; DO NOT hand-edit
             relations.ts, types.ts
  waqf/      ledger.ts, withdrawal.ts   ← pure functions, ZERO ORM imports
  zakat/     calculator.ts, fitrah.ts, gold-price.ts
  payment/   service.ts, webhook.ts, signature.ts,
             mock.provider.ts, midtrans.provider.ts, types.ts
  qurban/    slots.ts
  auth/      tokens.ts, guard.ts, types.ts, cookie-names.ts
  certificate/, identity/, whatsapp/
  contracts/ waqf.ts, zakat.ts, qurban.ts, infaq.ts, amil.ts, admin-*.ts
             ← Zod input schemas, one file per domain

apps/web/src/
  lib/orpc/
    procedures.ts         ← publicProcedure / protectedProcedure /
                             roleProcedure / anyRoleProcedure / adminProcedure
    context.ts            ← createContext → { request, db, paymentProvider }
    client.ts             ← browser client, same-origin /rpc
    router/
      index.ts            ← the router object
      waqf.ts zakat.ts qurban.ts infaq.ts nadzir.ts amil.ts auth.ts
      admin/              ← one file per admin namespace
  lib/amwal-api/          ← thin UI adapters over the oRPC client
  lib/db/                 ← the db client singleton + re-export shims
  routes/
    rpc/$.ts              ← mounts RPCHandler at /rpc/*
    api/                  ← raw HTTP only: webhooks/payment.ts,
                             certificates.$id.ts, dev/mock-webhook.ts
  env/server.ts           ← the ONLY file allowed to read server process.env
  env/client.ts           ← VITE_* only; safe for the browser bundle
apps/web/drizzle/         ← generated SQL migrations; committed and reviewed
apps/web/tests/
db/MIGRATION_RULES.md
```

Path alias: `@/*` → `apps/web/src/*`. Shared kernel: `@amwal/core/<subpath>`.

**One file per domain, not per procedure.** ~60 procedures across 12+ domains;
a file per procedure would mean 60+ files. This deliberately departs from the
Better-T-Stack template's `-app/`/`-domain/` layering — recorded in
`PUTARAN-17.md` §J.5.

---

## 2. Procedure — The Canonical Pattern

```ts
// apps/web/src/lib/orpc/router/waqf.ts
import { createWaqfOrderSchema } from '@amwal/core/contracts/waqf';
import { createPayment } from '@amwal/core/payment/service';
import { roleProcedure } from '../procedures';

const createOrder = roleProcedure('WAKIF')
  .input(createWaqfOrderSchema)         // validated automatically; no safeParse
  .handler(async ({ input, context }) => {
    const user = context.user;          // SessionUser — the guard guarantees it

    const result = await createPayment(
      { module: 'WAKAF', ...input, userId: user.userId },
      { database: context.db, paymentProvider: context.paymentProvider }
    );

    return { data: result };
  });

export const waqf = { createOrder /* , … */ };
```

**Rules:**

- The Zod schema lives in `packages/core/src/contracts/<domain>.ts`, so the
  procedure and its tests validate the identical contract. (This is the one
  rule that changed from the Hono era, where schemas sat inline in the route
  file — the contract is now shared across a package boundary.)
- Validation messages are in **Bahasa Indonesia**; they reach users.
- Never re-verify the JWT inside a handler. The procedure guard already did it;
  `context.user` is typed non-nullable and that type is the contract.
- Never write `catch (error: any)`. Use `error instanceof Error` when you need `.message`.
- Dependencies (`db`, `paymentProvider`) come from `context`, never from a
  module-level singleton — that is what makes the procedure testable.

---

## 3. Response Shapes

Procedures **return** values and **throw** `ORPCError`; there is no `c.json`.

```ts
// Success — return the value; oRPC serialises it
return { data: payload };

// Validation error — .input(schema) produces BAD_REQUEST automatically.
// Do not hand-roll one.

// Auth — thrown by the procedure guard, not by your handler
throw new ORPCError('UNAUTHORIZED');                               // 401, no session
throw new ORPCError('FORBIDDEN', {                                 // 403, wrong role
  message: 'Forbidden: Insufficient privileges',
});

// Domain rejection — e.g. a waqf disbursement that would overdraw the principal
throw new ORPCError('UNPROCESSABLE_CONTENT', { message: '…' });    // 422

// Not implemented — NEVER return constant data instead.
throw new ORPCError('NOT_IMPLEMENTED');                            // 501
```

The three raw HTTP routes under `routes/api/**` still use `Response.json(body,
{ status })`, because their callers are external (Midtrans) or expect binary.

---

## 4. Mounting and Protection

Protection attaches to the **procedure builder** every leaf is constructed from.
There is no separate list of protected paths that can drift out of sync — that
drift was AMW-03.

```ts
// lib/orpc/procedures.ts
export const adminProcedure = roleProcedure('ADMIN');

// lib/orpc/router/admin/waqf.ts — every leaf here is protected by construction
const programsList = adminProcedure.handler(/* … */);
const reviewWithdrawal = adminProcedure.input(schema).handler(/* … */);

export const waqf = { programsList, reviewWithdrawal };
```

A leaf built from `adminProcedure` cannot be reached without the guard, because
the guard *is* the thing it was built from — there is no mount-time step to
forget.

> **Gap on this branch:** there is no `rbac.matrix.ts`. The Hono era had one
> plus a test asserting every mounted route was covered; it was removed as dead
> code (see `STATUS.md`, D6-4/D6-7) and the structural guards above replaced it.
> The audit task `S10-N-15` — a matrix of 4 roles × every namespace — is still
> open. Do not claim RBAC coverage is verified until it lands.

**`PETUGAS_LAPANGAN` must never appear in the `/api/admin` role list.** It has
`/api/petugas`. In the legacy repo it had admin access, which let a field officer overwrite
the gold price that determines everyone's nisab (AMW-07).

---

## 5. Drizzle

### Money

```ts
nominal: numeric('nominal', { precision: 18, scale: 2 }).notNull(),
```

Never `real`, never `doublePrecision`. Drizzle returns `numeric` as a **string** — parse it
deliberately with a decimal library or integer cents, never with `parseFloat` on a value you
are about to write back.

### Transactions

```ts
const result = await db.transaction(async (tx) => {
  const [order] = await tx.insert(waqfOrders).values({...}).returning();
  const [trx]   = await tx.insert(transactions).values({...}).returning();
  return { order, trx };
});
// External calls (payment provider, WhatsApp) happen AFTER the transaction commits,
// never inside it. A slow HTTP call inside a transaction holds database locks.
```

### Row locks

```ts
const slots = await tx.execute(sql`
  SELECT id, nomor_slot FROM qurban_animal_slots
  WHERE hewan_batch_id = ${batchId} AND status = 'TERSEDIA'
  ORDER BY nomor_slot LIMIT 1
  FOR UPDATE
`);
```

The row lock **and** the unique constraint `(hewan_batch_id, nomor_slot)` are both required.
Either one alone still oversells.

---

## 6. Pure Domain Functions

All fiqh arithmetic lives in `lib/ledger/` and `lib/zakat/` as **pure functions with no
database imports**. This is what makes vibe coding safe in the layer above: the risky
arithmetic is isolated, unit-testable without a database, and reviewable in isolation.

```ts
// lib/ledger/waqf.ts — no db import anywhere in this file
export function applyWithdrawal(
  ledger: LedgerState,
  amount: Decimal,
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL',
): LedgerState | LedgerError {
  if (jenisWakaf === 'PRODUKTIF_KEKAL') {
    if (amount.gt(ledger.totalHasilAvailable)) return { error: 'INSUFFICIENT_YIELD' };
    return {
      ...ledger,
      totalHasilAvailable: ledger.totalHasilAvailable.minus(amount),
      hasilInvestasiTersalurkan: ledger.hasilInvestasiTersalurkan.plus(amount),
      // pokokDanaTerkumpul is deliberately untouched — permanent by fiqh
    };
  }
  ...
}
```

The route handler calls this, then persists the returned state. It never does arithmetic
itself.

---

## 7. Environment Access

Environment access is **split by trust boundary**, because `apps/web` ships a
browser bundle: a single merged `env.ts` would put server secrets one careless
import away from the client.

```ts
// apps/web/src/env/server.ts — the only file permitted to read server process.env
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PAYMENT_PROVIDER: z.enum(['MOCK_SANDBOX','MIDTRANS_SANDBOX','MIDTRANS_PRODUCTION']),
    PAYMENT_SERVER_KEY: z.string().min(1),
    INTERNAL_SECRET: z.string().min(16),
    BAILEYS_SERVICE_URL: z.string().url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// apps/web/src/env/client.ts — VITE_* only; these DO reach the browser
```

`env/server.ts` may only be imported from a `createServerFn` body, an oRPC
procedure, or a `routes/api/*` server route. **Never from a route `component`**
— that would pull the secrets into the client bundle. Verified in Batch 0 by
building and grepping `.output/public/` for `DATABASE_URL`/`JWT_SECRET`: zero
hits.

A silent `|| 'fallback'` means production can run on a secret that is committed
to the repository, which is exactly what AMW-08 found.

---

## 8. Naming

- Database: `snake_case` tables and columns
- TypeScript: `camelCase`
- Files: `kebab-case.ts`
- Tests: `*.test.ts` beside the code, or under `tests/` for integration

---

## 9. Tests

```ts
import { describe, it, expect } from 'bun:test';

describe('applyWithdrawal', () => {
  it('never decreases principal for PRODUKTIF_KEKAL', () => { ... });
  it('rejects a withdrawal larger than available yield', () => { ... });
});
```

Zone 0 code: tests are written **before** the implementation, and cover the failure cases,
not only the happy path.
Zone 1 code: at least one contract test per endpoint.
Zone 2 code: visual verification is sufficient.

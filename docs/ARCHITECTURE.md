# ARCHITECTURE.md — Amwal V.1 on Bun

Supersedes the Next.js architecture in `amwalheti/docs/ARCHITECTURE.md`.
Decision rationale is in `DECISION_LOG.md` Putaran 13, 14, 15 and **17**.

> **Putaran 17 (12 Sep 2026) changed the two rows this document used to lead
> with.** There is no separate Hono backend and no `:3001` application
> container any more: `apps/server` was removed in Batch 6 and `apps/web`
> (TanStack Start) now serves oRPC, the HTTP routes, SSR and static assets
> from one process on port 3000. Zone 0 moved to `packages/core`. Execution
> record: `PUTARAN-17.md`.

---

## 1. Stack (locked)

| Layer | Choice | Rejected | Deciding reason |
|---|---|---|---|
| Runtime | **Bun 1.x** | Node 20 | Team decision, Putaran 13 |
| Application server | **TanStack Start (SSR via Nitro)** | Separate Hono service | Putaran 17: one process serves SSR, static assets, oRPC (`/rpc/*`) and the few raw HTTP routes (`/api/*`). The two-service split was ceremony once Vercel was off the table (Putaran 15 #1) |
| Shared kernel | **`packages/core` (`@amwal/core`)** | Keeping domain logic inside the app | Putaran 17 #2: satisfies the binding condition from Putaran 15 #6 — fiqh invariants must be testable with no frontend build. 24 tests run in ~120 ms with no DB and no bundler. A separate workspace makes the Zone 0 boundary a tooling constraint, not a convention |
| Data layer | **Drizzle ORM** | Prisma 7 | `drizzle-kit pull` generates the schema mechanically; `generate` emits reviewable SQL files, making AMW-01 drift structurally impossible. Single source of truth: `packages/core/src/db/schema.ts` |
| API Layer | **oRPC mounted in TanStack Start** | Hono RPC (`hc`), oRPC-inside-Hono | Putaran 14 solved the `hc` deep-instantiation bottleneck; Putaran 17 removed the Hono host underneath it. Payment webhooks and binary downloads stay raw HTTP routes |
| Validation | **Zod 4** | TypeBox | Already used throughout legacy repo; zero porting cost |
| Auth | **jose + bcrypt** | Better Auth, Lucia | Legacy JWT + rotating-refresh passed audit; avoids dual identity table conflict with existing `users.id` FKs (Putaran 14 #4, unchanged) |
| WhatsApp | **Separate Node service (`apps/wa-bot`)** | Baileys inside Bun | Native crypto deps, long-lived process, filesystem session state |
| Tests | **`bun test`** | Vitest | Built in, zero config, Jest-compatible API |

---

## 2. Deployment Topology

```
                    ┌──────────────────────────────┐
  Browser  ───────► │ VPS  8 vCPU / 24 GB          │
                    │ ┌──────────────────────────┐ │
                    │ │ caddy   :443  TLS        │ │  ← the only published port
                    │ ├──────────────────────────┤ │
                    │ │ web     :3000  Bun       │ │  ← TanStack Start:
                    │ │   SSR + static assets    │ │     SSR, /rpc/*, /api/*,
                    │ │   oRPC  /rpc/*           │ │     /health — one process
                    │ │   HTTP  /api/*, /health  │ │
                    │ ├──────────────────────────┤ │
                    │ │ wa-bot  :3001  Node      │ │  ← NO published port; internal only
                    │ │   volume: auth_session   │ │
                    │ └──────────────────────────┘ │
                    └──────────┬───────────────────┘
                               │ :5432 session mode
                    ┌──────────▼───────────────┐
                    │ Supabase Postgres        │  ← shared with the frozen Next.js app
                    └──────────────────────────┘
```

Caddy proxies the whole domain to `web:3000` in a single `reverse_proxy`
block — the former `@backend` matcher that split `/rpc/*`, `/api/*` and
`/health` off to `server:3001` was removed in Batch 6. `wa-bot` keeps port
3001 inside the Docker network; it is reachable only from `web`.

Two audit findings close as a side effect of leaving Vercel:

- **AMW-02** (anyone could fetch the WhatsApp QR and hijack the session): the `baileys`
  service publishes no port. It is unreachable from the internet — structurally, not by
  patching. The secret header stays as defence in depth.
- **AMW-16** (WA session lost on every redeploy): `auth_session` sits on a Docker named
  volume and survives container restarts.

A third becomes possible for the first time: the 30-day raw-KTP retention policy
(Putaran 2 #2) needs a scheduled job, which serverless made awkward. On the VPS it is a cron
container.

---

## 3. Database Connection

The legacy app uses the pgBouncer **transaction pooler** (`:6543?pgbouncer=true`) because
Vercel opens a connection per invocation. **The Bun process must not.**

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';

const client = postgres(env.DATABASE_URL, { max: 20, prepare: true }); // port 5432
export const db = drizzle(client, { schema });
```

Why session mode (`:5432`):

- `postgres-js` uses prepared statements by default; transaction-mode pgBouncer does not
  support them. On `:6543` you would have to set `prepare: false` and lose the benefit.
- DDL and `ALTER TYPE ... ADD VALUE` require session mode. **Migrations always target 5432.**
- A long-lived process pools connections in-process. pgBouncer adds failure modes and no
  benefit.

Budget: Supabase connection limits are shared with the still-running Next.js app.
Keep `max: 20` until the legacy app is retired.

---

## 4. Request Path

```
Browser
  └─ orpc client (credentials:'include')  →  cookie amwal_token
       └─ Caddy :443
            └─ web :3000  (TanStack Start)
                 └─ routes/rpc/$.ts   mounts RPCHandler at /rpc/*
                      ├─ createContext     builds { request, db, user? }
                      ├─ roleProcedure(…)  middleware attached at router mount
                      └─ handler           context.user is SessionUser, never null
```

RBAC is **structural**: the guard is attached to the procedure builder that every
leaf in a namespace is constructed from, so protection cannot drift away from the
routes it protects.

```ts
// lib/orpc/procedures.ts
export const adminProcedure = roleProcedure('ADMIN');

// lib/orpc/router/admin/waqf.ts — protected by construction
const withdrawalsList = adminProcedure
  .input(listWithdrawalsSchema)
  .handler(async ({ input, context }) => { /* context.user.role === 'ADMIN' */ });
```

This is the direct fix for AMW-03, where the legacy `proxy.ts` guarded the prefix
`/backoffice` while the actual URLs were `/admin` — a separate list that silently stopped
matching and told nobody.

---

## 5. Transaction Module Topology

Every transactional module shares one shape:

```
{module}_orders          ← the module anchor (online OR offline)
  ├─ transaction_id?     ← NULL when offline (cash/rice), set when digital
  └─ entered_by_*_id?    ← set when entered by Admin/Field Officer

transactions             ← payment-gateway anchor, shared by all modules
  └─ used by waqf_orders / zakat_orders / qurban_orders / infaq_orders
```

**Ordering rule (closes AMW-04):** the order row and its `Transaction` row are created in
**one database transaction, before the payment provider is called**. It is therefore
impossible for a webhook to arrive with no anchor waiting for it. In the legacy repo only
Waqf created a `Transaction`, so the Zakat and Qurban webhook branches searched for anchors
that could never exist.

One webhook endpoint serves all modules: `POST /api/webhooks/payment`, routed internally by
the `AMW-{MODULE}-{ulid}` order-ID prefix. **No per-module webhook handlers** — the legacy
repo grew four with three different signature implementations (AMW-12).

---

## 6. Payment Architecture

`PaymentProvider` is an interface with two implementations selected by
`env.PAYMENT_PROVIDER`. Mock and Midtrans differ only in **key and URL**; the database flow,
signature verification, and idempotency path are identical. Full specification in
`SPRINT_BACKLOG.md` §4.

**Idempotency is a conditional UPDATE inside the transaction**, never a status read taken
before the transaction opens:

```sql
UPDATE transactions SET status_pembayaran = 'LUNAS'
WHERE id = $1 AND status_pembayaran <> 'LUNAS' RETURNING *;
```

Zero rows returned means another delivery already won the race; stop and return 200.
The legacy guard read the status before opening its transaction, so two concurrent Midtrans
retries could both pass it and credit the ledger twice — on a waqf ledger that is a fiqh
defect, not an accounting rounding error.

### Custodial status in V.1

Split settlement is **not available** on the current Midtrans account. V.1 therefore routes
funds through the foundation account before disbursement — factually **custodial**, which
contradicts PRD §4.1's binding non-custodial principle. Recorded in Putaran 13.
`disbursement_destination` remains mandatory as a **recorded intent**, and the new
`manual_disbursements` table records each manual transfer with its proof and approver.
Public UI must not claim funds go directly to the Nadzir in V.1.

---

## 7. File Storage

Supabase Storage, buckets unchanged from the legacy design:

- `nadzir-documents` — KTP, BWI certificates. `ADMIN` only. Raw KTP files deleted after
  30 days (Putaran 2 #2; now enforced by a cron container, see §2).
- `program-banners` — public.
- `receipts` — `ADMIN` / `NADZIR` / `PETUGAS_LAPANGAN`.

---

## 8. What Is Deliberately Not Here

No message queue, no Redis, no microservices beyond the Baileys daemon, no GraphQL.
At this scale — one masjid pilot — each of those adds operational surface without removing
work. Revisit when there is a measured reason, not before.

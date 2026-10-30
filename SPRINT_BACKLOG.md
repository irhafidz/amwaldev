# Sprint Backlog — Sprint 10: Bun Greenfield Migration

**Target repo:** `amwal-bun` · **Legacy repo:** `amwalheti` — FROZEN after Day 1 morning
**Window:** Mon 7 Sep – Sat 12 Sep 2026 · **Checkpoint:** Fri 11 Sep evening (internal, not an ADB demo)
**Capacity:** 3 devs × 6 days = **18 person-days**
**Parent docs:** `Amwal Baseline Audit` (AMW-01…AMW-17), `Bun Migration Roadmap`

> **For AI agents:** do not load this whole file. Load `docs/AI_RULES.md`,
> `docs/CODING_CONVENTIONS.md`, and only the single task you are implementing.
> See `docs/README.md` for the context-loading policy.

> **Ticket text is frozen as written during the sprint (7–12 Sep 2026).**
> It still describes the Hono `apps/server` architecture, because that is what
> the tickets were written against. That architecture was replaced in
> Putaran 17 — `apps/server` is gone and every endpoint is an oRPC procedure in
> `apps/web`. Read the ticket for **intent and DoD**, then map it onto the
> current structure via `docs/CODING_CONVENTIONS.md`. For which tickets actually
> landed, see `STATUS.md` — not the checkboxes here, which were never updated
> after the sprint closed.
> **Audit konsolidasi 18 Sep 2026 (Claude Pro, HEAD `sprint-11` = `b1e440f`).** Berkas ini hanya
> memuat Sprint 10 dan Sprint 11/11.1 — **Sprint 1–9 tidak pernah dicatat di sini** (riwayatnya ada di
> `docs/DECISION_LOG.md` / Putaran 1–17). Teks tiket Sprint 10 tetap dibekukan; checkbox kriteria
> penerimaannya **tidak** diubah. Status nyata per tiket direkap di tabel berikut, diverifikasi ulang
> terhadap kode saat ini (melengkapi `STATUS.md`).

| Tiket S10 | Status 18-09 | Bukti |
|---|---|---|
| `B-01/02/03` Scaffold, baseline, guard migrasi | ✅ Selesai | `env/server.ts`; 5 migrasi `0000…0004`; `scripts/guard-destructive-sql.mjs`; tidak ada `db:push` |
| `B-04` VPS & Docker Compose | ✅ Selesai | `docker-compose.prod.yml` |
| `B-05/06/07` Provider, anchor-before-charge, idempotensi | ✅ Selesai | `payment/{service,webhook,mock.provider}.ts`; `tests/orpc/webhook.test.ts` |
| `B-08/09` Wakaf + ledger fiqih | ✅ Selesai | `core/waqf/ledger.ts`; `tests/waqf/ledger-fiqh.test.ts` |
| `B-10/11` Zakat | ✅ Selesai | `core/zakat/{calculator,gold-price}.ts` |
| `B-12` Infaq & Sedekah · `B-13` Admin wakaf | ✅ Selesai | `router/infaq.ts`, `router/admin/waqf.ts` |
| `B-14/15` Staging & deploy VPS | ⏳ Belum terverifikasi | tidak ada bukti deploy di repo |
| `N-01` AMW-02/03 di repo lama | ⚠️ **Regresi** | fallback secret hardcoded kembali di `apps/wa-bot` & `apps/web` (lihat Sprint 11.1 §Temuan keamanan) |
| `N-02` Auth core | ✅ Selesai | `core/auth/tokens.ts`; `tests/orpc/auth.test.ts` |
| `N-03` RBAC struktural | ✅ Selesai | `core/auth/rbac.matrix.ts` + `tests/auth/rbac-matrix.test.ts` (matriks kini ada) |
| `N-04` Google OAuth | ❌ Rusak | tombol menaut `/api/auth/google`, handler tidak ada |
| `N-05` Seed | ✅ Dipulihkan | `apps/web/src/lib/db/seed.ts` ada, `db:seed` menunjuknya |
| `N-06/07` Webhook konsolidasi + cabang wakaf | ✅ Selesai | `core/payment/webhook.ts` |
| `N-08` Sertifikat | ✅ Selesai | `core/certificate/generator.ts`; `routes/api/certificates.$id.ts` |
| `N-09` WhatsApp | ✅ Selesai | `core/whatsapp/*` (diperluas S-4) |
| `N-10/11` Qurban slot & wakalah | ✅ Selesai | `core/qurban/slots.ts` (reserve di transaksi anchor) |
| `N-12` Notifikasi in-app | ✅ Backend ada | `router/notifications.ts` |
| `N-13` Petugas lapangan | 🟡 Separuh | entri offline ada; setoran/rekap belum |
| `N-14` Ask-AI | ✅ Backend ada | `router/ask-ai.ts` |
| `N-15/16` Audit & DECISION_LOG | ✅ Selesai | `docs/DECISION_LOG.md` |
| `A-01…A-17` Frontend | ✅ Sebagian besar | lihat `STATUS.md`; `A-11` riwayat dipulihkan via `I-10c` |

---

## 1. Commitment Tiers

Every task is tagged **[A]**, **[B]**, or **[C]**.

| Tier | Meaning | DoD standard | May be called "done" outside the team? |
|---|---|---|---|
| **[A] Must ship** | Money, fiqh, identity. Failure here = sprint failure. | `bun test` green + execution evidence | Yes |
| **[B] Target** | Fully functional, lighter test coverage | Visual check + 1 happy-path test | Yes, with test-coverage caveat |
| **[C] Scaffold** | UI complete, backend stubbed | Visual check only | **NO.** Say "UI ready, backend pending" |

**Non-negotiable Tier C rule:** every Tier C screen renders a `PRATINJAU` (preview) badge,
and its endpoint returns **`501 Not Implemented`** when the logic does not exist.
No constant arrays rendered as if they were live data — that is findings AMW-10 and AMW-11
repeated verbatim.

**Module → tier mapping**

- **[A]** Auth+RBAC · Drizzle+Migrations · Payment Core · Waqf E2E · Zakat Orders · Qurban Slots+Orders
- **[B]** Infaq/Sedekah · Certificates · History · Profile · Notifications · Admin Waqf · Zakat Calculator
- **[C]** Gamification · Ask-AI · Education & Quiz · News · Nadzir Portal · Admin Analytics

**Pre-agreed sacrifice order if we fall behind:** C first, then B. **A never.**
Waqf E2E is the last thing to fall.

### Scope reality check (recorded, not negotiable away)

Infaq/Sedekah, Gamification, Ask-AI, and Education/Quiz **were never built** in Next.js —
only Prisma models exist, with zero routes or working UI. Infaq has no order table at all,
only a `TransactionType.INFAQ` enum value. These are **new features, not ports**; no source
code exists to migrate.

Foundation (Day 1–2) consumes ~6 person-days, leaving ~12 for 14 module areas. That is why
tiers exist. All requested modules are in scope; only the promised depth differs, and it is
stated up front instead of discovered on Friday.

This reverses **Putaran 6** and **Putaran 10 #2**. Task `S10-N-16` records it as
**Putaran 13** in the append-only decision log.

---

## 2. Confirmed Technical Parameters

| Parameter | Decision | Technical consequence |
|---|---|---|
| Database | **Same** Supabase instance as Next.js | Additive-only migrations mandatory. See §3. |
| DB connection | **Port 5432 (session mode)**, not 6543 | See §3.5 — pooler mode breaks prepared statements & DDL |
| Payment | Midtrans sandbox **unavailable** | Build `MockPaymentProvider` first. See §4. |
| Backend host | **Own VPS** (8 vCPU / 24 GB / 300 GB) | Docker Compose + Caddy. Baileys becomes internal-only. |
| Frontend stack | **TanStack Start + React 19** in `apps/web` (changed 8 Sep 2026) | SSR + API routes share one Bun process; Vite build emits `.output/` via Nitro, not a static-only `dist/`. Reconcile `ARCHITECTURE.md` before Day 3. |
| Split settlement | **Unavailable** | V.1 is **custodial** via foundation account. Must be logged in Putaran 13. |
| Friday target | Internal checkpoint | Day 6 = verification and tech debt, not demo polish. |
| Final authority | Dev team consensus | Scope-cut decision happens Thursday 20:00, not Saturday morning. |

### Custodial status must be stated honestly

PRD §4.1 calls non-custodial a **binding, non-negotiable** principle. With split settlement
unavailable, V.1 is factually **custodial**: funds transit the foundation account before
disbursement. This is acceptable but must not be left unsaid. Required:

1. Logged in Putaran 13 as a temporary downgrade, with reasoning.
2. `disbursement_destination` still populated — now a **recorded disbursement intent**,
   not a gateway instruction.
3. New table `manual_disbursements`: amount, date, transfer proof, `approved_by_id`.
   Without it, the transparency claim to ADB has no data behind it.
4. Public UI **must not** claim "funds go directly to the Nadzir" in V.1.

---

## 3. Shared Supabase Co-existence Rules

Next.js/Prisma on Vercel and Bun/Drizzle on the VPS read **one shared database**.
Safe only if all seven rules below hold.

### 3.1 Initial introspection is safe

```bash
bun drizzle-kit pull    # read-only; writes nothing to the database
```

Produces `db/schema.ts` + `db/relations.ts` from the existing 38 tables.
**Manual verification required:** every money column must land as `numeric(18,2)`,
never `double precision`. Money must not end up in floating point.

### 3.2 Six migration rules

| # | Rule | Why |
|---|---|---|
| 1 | **Only `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`** | Prisma ignores unknown tables safely |
| 2 | **New columns must be nullable or carry a `DEFAULT`** | Prisma `INSERT` omits them; without a default it fails |
| 3 | **Never `DROP`, `RENAME`, narrowing `ALTER TYPE`, or `SET NOT NULL`** | All break the running Prisma Client |
| 4 | **Never run `prisma migrate` / `db push` from the legacy repo** | Prisma sees Drizzle tables as drift and **offers to DROP them**. Biggest landmine here. |
| 5 | **`CREATE INDEX CONCURRENTLY`** on populated tables | A plain index locks the table; Vercel will time out |
| 6 | **New enum values: see §3.3** | Subtlest hazard on this list |

### 3.3 The invisible enum hazard

The schema has **29 Postgres enums**. If the Bun app adds a new enum value
(e.g. `TransactionType.SEDEKAH`) and writes a row using it, **Prisma Client throws when
reading that row** — the value is absent from its generated client. The failure surfaces
in the legacy app, on an unrelated page, and is very hard to trace.

Rules:

- `ALTER TYPE ... ADD VALUE` is safe to run (additive).
- **Do not write rows using new enum values** while anyone still reads the Next.js app.
- For Infaq/Sedekah this sprint: use a new `infaq_orders` table with a `jenis` column of
  type **`text` + `CHECK` constraint**. Do not extend the legacy enums. Normalise to a
  real enum only after Next.js is fully retired.
- Postgres note: a value added by `ADD VALUE` cannot be used in the same transaction.
  Split into two migrations if needed.

### 3.4 Automated guards

```bash
bun drizzle-kit check                                    # CI: red if schema/migrations diverge
grep -iE '\b(DROP|RENAME|SET NOT NULL)\b' drizzle/*.sql && exit 1   # pre-commit
```

### 3.5 Connection mode: use 5432, not 6543

Next.js uses the pgBouncer **transaction pooler** on `:6543?pgbouncer=true` because Vercel
serverless opens a connection per invocation. The Bun VPS process is long-lived and must
use **session mode on `:5432`**:

- `postgres-js` (Drizzle's driver) uses prepared statements by default, which
  **transaction-mode pgBouncer does not support**. On 6543 you must set `prepare: false`.
- DDL and `ALTER TYPE ... ADD VALUE` require session mode. **Migrations must always
  target 5432.**
- A long-lived process pools in-app; pgBouncer adds nothing but failure modes.

```ts
// db/index.ts
const client = postgres(env.DATABASE_URL, { max: 20, prepare: true }); // :5432
```

---

## 4. Mock Payment Adapter

**Principle:** the only difference between mock and Midtrans is the **key and the URL**.
Database flow, signature verification, idempotency, and the webhook handler are
**byte-for-byte identical**. Switching to real Midtrans later = change one env var,
zero logic changes.

### 4.1 Contract

```ts
// lib/payment/types.ts
export interface PaymentProvider {
  readonly name: 'MOCK_SANDBOX' | 'MIDTRANS_SANDBOX' | 'MIDTRANS_PRODUCTION';
  createCharge(input: ChargeInput): Promise<ChargeResult>;   // { redirectUrl, providerRef }
  verifySignature(body: WebhookBody): boolean;
  mapStatus(body: WebhookBody): 'LUNAS' | 'PENDING' | 'GAGAL';
}
```

### 4.2 Provider selection

```ts
// lib/payment/index.ts
export const payment: PaymentProvider =
  env.PAYMENT_PROVIDER === 'MOCK_SANDBOX' ? mockProvider : midtransProvider;
```

```ts
// env.ts — mock is forbidden in production, enforced at boot
PAYMENT_PROVIDER: z.enum(['MOCK_SANDBOX','MIDTRANS_SANDBOX','MIDTRANS_PRODUCTION'])
  .refine(v => !(v === 'MOCK_SANDBOX' && process.env.NODE_ENV === 'production'),
          'MOCK_SANDBOX is forbidden in production'),
```

### 4.3 The key design point: the mock signs with the same formula

`MockProvider.createCharge()` makes **no network call**. It returns a URL to an internal
simulator page:

```
/dev/payment-simulator?ref=AMW-WAKAF-01J8XYZ&amount=500000
```

That page (Tier C, rendered only when `PAYMENT_PROVIDER=MOCK_SANDBOX`) shows four buttons —
**Success · Pending · Failed · Expire** — each of which POSTs to the **real production
webhook endpoint** `/api/webhooks/payment`, with a Midtrans-shaped body and a
`signature_key` computed by the identical formula:

```ts
signature_key = sha512(order_id + status_code + gross_amount + env.PAYMENT_SERVER_KEY)
```

Only the value of `PAYMENT_SERVER_KEY` differs — a local random string under mock, the real
Midtrans server key later. **The webhook verification code neither knows nor cares which is
active.** That is what makes the later switch risk-free.

### 4.4 Testable today, without a Midtrans account

- Valid signature → 200, ledger mutates.
- Invalid signature → **403, zero data mutation**.
- Identical notification delivered twice → ledger increments **exactly once**.
- Concurrent notifications → still exactly once.
- Out-of-order (`settlement` before `pending`) → final status stays `LUNAS`.

These five are the hardest cases to exercise against a real sandbox and the easiest against
a mock. The missing Midtrans account is **not a blocker** — for these five days it is an
advantage.

---

# DAY 1 — Monday 7 September
### Theme: Foundation + closing the legacy repo's open holes
### Gate: `drizzle-kit migrate` against an empty DB produces 38 identical tables

## 🟢 Bara — Backend Core & Data Layer

### `S10-B-01` — Repo scaffold & fail-fast environment · **[A]** · `[Zone 0]`
Initialise `amwal-bun`: Hono + TypeScript, folders `routes/ lib/ db/ tests/`.
Write `env.ts` with a Zod parse over every required variable (`JWT_SECRET` min 32,
`ENCRYPTION_KEY` min 32, `INTERNAL_SECRET`, `DATABASE_URL`, `PAYMENT_PROVIDER`,
`PAYMENT_SERVER_KEY`).

- [ ] `bun run dev` listens on 3001; `GET /health` → `200 {"ok":true}`
- [ ] Remove one var from `.env` → **process dies at boot**, message names the variable
- [ ] `grep -rn "process.env" src/ | grep -v "env.ts"` → **zero hits** (closes the AMW-08 class)

### `S10-B-02` — Drizzle introspection & baseline migration · **[A]** · `[Zone 0]`
`drizzle-kit pull` from Supabase (**port 5432**), verify, create the baseline migration.

- [ ] `db/schema.ts` contains **38 tables + 29 enums**
- [ ] All money columns are `numeric(18,2)` — prove with `grep -c "numeric" db/schema.ts`
- [ ] Empty local DB + `drizzle-kit migrate` → `\dt` lists 38 tables
- [ ] `drizzle-kit check` passes

### `S10-B-03` — Additive-only migration guards · **[A]** · `[Zone 1]`
Implement §3.4. Write `db/MIGRATION_RULES.md` containing the six rules from §3.2.

- [ ] A test migration containing `DROP TABLE` → **pre-commit rejects the commit**
- [ ] `package.json` contains **no script** invoking `drizzle-kit push`

### `S10-B-04` — VPS bootstrap & Docker Compose · **[B]** · `[Zone 1]`
`docker-compose.yml`: `api` (Bun), `baileys` (Node), `caddy` (automatic TLS).

- [ ] **`baileys` exposes NO `ports:`** — internal Docker network only.
      This makes AMW-02 structurally impossible rather than merely patched.
- [ ] `auth_session` on a **named volume** — closes AMW-16; the WA session survives redeploys
- [ ] `docker compose up` on the VPS → `https://<api-domain>/health` → 200 with valid TLS

## 🔵 Naufal — Auth, RBAC & Security

### `S10-N-01` — Close AMW-02 & AMW-03 in the legacy repo, THEN freeze · **[A]** · `[Zone 0]`
**Absolute priority; do this before anything else.** The legacy repo stays live on Vercel
as a reference — freezing the repo does not freeze its holes.

- [ ] Baileys: **global** secret middleware before all routes (not per-route),
      `cors({origin:[...]})`, remove the hardcoded secret fallback
- [ ] `curl https://<baileys>/qr` with no header → **401**
- [ ] `proxy.ts` matcher corrected to `/admin/:path*`, `/nadzir/:path*`, `/amil/:path*`
- [ ] Delete `session?.role || 'ADMIN'` from `(backoffice)/layout.tsx`
- [ ] Open `/admin` on staging without a session → **redirects to `/login`**
- [ ] `git tag frozen-nextjs-v1` + push. **The legacy repo is not touched again after this.**

### `S10-N-02` — Port auth core · **[A]** · `[Zone 0]`
Copy the logic from `amwalheti/app/api/auth/*` — it **passed audit; do not redesign it**.
Only the framework idiom changes, plus `bcryptjs` → `Bun.password`.

- [ ] Access token JWT, 20 min, payload carries `{ userId, role }`
- [ ] Refresh token **hashed** at rest, rotated on every use; reuse of a revoked token
      → **revoke every session for that user**
- [ ] Cookies `httpOnly` + `sameSite=lax` + `secure` in production
- [ ] `bun test auth` — at least 6 cases including the reuse scenario

### `S10-N-03` — Structural RBAC · **[A]** · `[Zone 0]`
Middleware attaches at the router mount point, never a separate prefix list (root cause of AMW-03).

- [ ] `rbac.matrix.ts` is the single source of truth for role-per-namespace
- [ ] **`PETUGAS_LAPANGAN` removed from `/api/admin`** — closes AMW-07
- [ ] Inside protected handlers, `c.get('user')` is typed `SessionUser`, not `| null`
- [ ] Matrix test: 4 roles × every namespace, results match `rbac.matrix.ts`

## 🟡 Awan — Frontend Foundation

### `S10-A-01` — TanStack Start scaffold & design tokens from Hi-Fi · **[B]** · `[Zone 2]`
**TanStack Start** + React 19 + Tailwind v4 + TanStack Router (existing `apps/web`
scaffold — Awan lane decision 8 Sep 2026). Extract tokens from the Hi-Fi: primary green,
type scale, radii, spacing.

- [x] `bun run dev` runs with working hot reload
- [x] `tokens.css` holds the Hi-Fi palette, **not** Tailwind defaults
- [x] A token gallery page renders every token (`/dev/tokens`)
- [ ] Compare token gallery side by side against the Hi-Fi (human visual sign-off)

> **Awan status (8 Sep 2026, branch `awan`):** foundation implemented by AI agent.
> `bun run dev` regenerates the route tree and serves HMR; `tokens.css` now holds the
> legacy Hi-Fi values; `/dev/tokens` renders the semantic palette, type scale, and radius.
> **Pending:** human side-by-side colour verification against the Figma file (hex values are
> still estimates per `docs/DESIGN_SYSTEM.md`).

### `S10-A-02` — Port the base UI kit · **[B]** · `[Zone 2]`
Port from `amwalheti/components/ui/`: Button, Input, Toast, ConfirmationModal, Card, Badge,
BottomNav. Replace `next/*` imports with TanStack Router / plain `<img>`.

- [x] A component gallery renders every variant
- [x] Zero `next/*` imports — prove with `grep -rn "from 'next" src/` → empty
- [x] `PRATINJAU` badge exists as a component (used by every Tier C screen)

> **Awan status (8 Sep 2026):** implemented by AI agent — `/dev/components` renders Button, Input, Card,
> Badge, Toast, ConfirmationModal, BottomNav, and PRATINJAU variants; grep for
> `from 'next` returns empty; badge lives in `components/ui/pratinjau-badge.tsx`.
> **Pending:** visual side-by-side sign-off against the Hi-Fi.

### `S10-A-03` — Type-safe API client · **[B]** · `[Zone 1]`
Typed fetch wrapper for the REST API (replaces the planned Hono `hc` adapter until the
frontend/backend boundary is settled): `credentials: 'include'`, silent refresh with a
**dedup mutex** (port the legacy pattern — it is correct), 401 → redirect to login.

- [x] API calls carry cookies automatically
- [x] Simulate an expired access token → one refresh, request retried, **user sees nothing**
- [x] 10 parallel requests during expiry → **exactly 1 refresh call** (proves the mutex)

> **Awan status (8 Sep 2026):** implemented with tests — `tests/api-client.test.ts` proves
> 10 parallel 401s trigger exactly one refresh and the retried request succeeds.
> `bun test` → 23 pass, 0 fail. Auth endpoints themselves remain Naufal's S10-N-02…05.

---

# DAY 2 — Tuesday 8 September
### Theme: Payment engine & application shell
### Gate: two identical webhooks → ledger increments exactly once

## 🟢 Bara

### `S10-B-05` — PaymentProvider contract & MockProvider · **[A]** · `[Zone 0]`
Implement all of §4.

- [ ] `MockProvider` and `MidtransProvider` satisfy the same interface
- [ ] `MOCK_SANDBOX` + `NODE_ENV=production` → **process refuses to start**
- [ ] `bun test payment/signature` — valid passes; flip one character → rejected

### `S10-B-06` — `createPayment()` with anchor-before-charge · **[A]** · `[Zone 0]`
Order + `Transaction` created in **one DB transaction**, provider called only after commit.
Closes half of AMW-04.

- [ ] Order IDs follow `AMW-{MODULE}-{ulid}`
- [ ] `disbursementDestination` **always populated** — the type rejects an empty string
- [ ] Provider throws → **order and Transaction both roll back**; no orphan rows
- [ ] Test: Waqf, Zakat, and Qurban orders each produce a `Transaction` row

### `S10-B-07` — Race-safe webhook idempotency · **[A]** · `[Zone 0]`
The guard is a **conditional `UPDATE` inside the transaction**, not a status read taken
before the transaction opens. The legacy repo uses the latter and is race-prone.

```sql
UPDATE transactions SET status_pembayaran = 'LUNAS'
WHERE id = $1 AND status_pembayaran <> 'LUNAS' RETURNING *;
-- 0 rows = already processed; stop silently with 200
```

- [ ] **Parallel test: 10 identical simultaneous webhooks → ledger increments exactly once**
- [ ] Out-of-order (`settlement` before `pending`) → final status stays `LUNAS`
- [ ] Webhook for an unknown `order_id` → 404, zero mutation

## 🔵 Naufal

### `S10-N-04` — Manual Google OAuth · **[A]** · `[Zone 0]`
Port from legacy. Exchange the Google ID token for our own JWT + refresh
(PRD §4.5 — one session source of truth, no NextAuth).

- [ ] CSRF state validation **always on**; no mock path reachable in production
- [ ] Guest matching restricted to `passwordHash IS NULL AND oauthProvider IS NULL` (Putaran 8 #3)
- [ ] Test: a guest email colliding with a registered account → **isolated into a new guest
      account**, never merged into the existing one

### `S10-N-05` — Seed & system data · **[A]** · `[Zone 1]`
- [ ] `SYSTEM_ANONYMOUS_USER_ID = '00000000-...-0001'` created via **upsert** (idempotent)
- [ ] Seed run twice consecutively → **no error, no duplicates**
- [ ] 4 test accounts, one per role

### `S10-N-06` — Consolidated webhook handler · **[A]** · `[Zone 0]`
One endpoint `POST /api/webhooks/payment`, routed internally by order-ID prefix.
**No per-module handlers** — the legacy repo has four, and that is AMW-12.

- [ ] Excluded from auth middleware (signature-based)
- [ ] Invalid signature → **403 before a single query runs**
- [ ] WhatsApp dispatch **outside** the DB transaction, best-effort, 5 s timeout

## 🟡 Awan

### `S10-A-04` — App shell & navigation · **[B]** · `[Zone 2]`
Layout, 4-tab bottom nav (Home/Waqf/History/Education) per Hi-Fi, splash, client guards.

- [x] Navigation matches the attached IA (User) diagram
- [x] Client guards are UX only — **the server decides**; no authorisation logic in the client

> **Awan status (8 Sep 2026):** `components/user-shell.tsx` + `components/bottom-nav.tsx`
> provide the 430 px mobile frame and 4 tabs (`/dashboard`, `/wakaf`, `/riwayat`,
> `/edukasi`); session is loaded on the server before route guards run.
> **Pending:** splash screen; data/API routes are placeholder until S10-A-07+ and Naufal's
> backend lane is ready.

### `S10-A-05` — Auth screens · **[B]** · `[Zone 2]`
Login, Register, Onboarding, Google button — Hi-Fi section 1.

- [ ] Successful login → `httpOnly` cookie set (verify in DevTools → Application → Cookies)
- [x] **`grep -rn "localStorage" src/` yields no token storage** (the old AMW-03 class)
- [x] Validation errors render in Bahasa Indonesia

> **Awan status (8 Sep 2026):** UI implemented — `/auth/login`, `/auth/register`, `/onboarding`
> in Bahasa Indonesia with Google entry, plus Indonesian client-side validation; no
> localStorage token storage. **Blocked:** the httpOnly-cookie proof needs Naufal's
> `/api/auth/login|register|refresh|logout` endpoints (S10-N-02…05).

### `S10-A-06` — Payment simulator page · **[C]** · `[Zone 2]`
UI for §4.3. Rendered only when `VITE_PAYMENT_PROVIDER=MOCK_SANDBOX`.

- [x] Four buttons fire real webhooks with correct signatures
- [x] Prominent `PRATINJAU` badge — impossible to mistake for a production flow

> **Awan status (8 Sep 2026):** UI implemented — `/dev/payment-simulator` has four buttons,
> computes Midtrans `signature_key` client-side from the **mock** key, POSTs to
> `/api/webhooks/payment`, and always renders the PRATINJAU badge. **End-to-end proof**
> still requires `VITE_PAYMENT_PROVIDER=MOCK_SANDBOX` plus Bara's ledger mutation in the
> webhook handler.

---

# DAY 3 — Wednesday 9 September
### Theme: Waqf, write path
### Gate: a waqf donation via mock increases `pokokDanaTerkumpul` by exactly the amount

> **Status (9 Sep 2026):** merged into `main` as `99d8186`; Bara's waqf routes + ledger
> tests landed and the Awan UI is implemented on branch `awan` (`06461e6`). Gate was
> reproduced locally with order → webhook → ledger (`pokokDanaTerkumpul` +100,000).

## 🟢 Bara

### `S10-B-08` — Waqf: programs & orders · **[A]** · `[Zone 1]`
`WaqfProgram` CRUD; `POST /api/wakaf/orders` → `createPayment()`.

- [x] Guest checkout works (Putaran 8 #1: shared anonymous user, not random dummy accounts)
- [x] `isAnonymous: true` → public shows "Hamba Allah"; internal audit still stores identity
- [x] `curl` an order → receive `redirectUrl`; DB holds a matched order + Transaction pair

### `S10-B-09` — Pure waqf ledger functions · **[A]** · `[Zone 0]`
**The strictest Zone 0 work in this sprint.** Fiqh arithmetic as pure functions with no ORM
contact — this is what makes vibe coding safe around it.

- [x] `HABIS_PAKAI` → decrements `pokokDanaTerkumpul`
- [x] `PRODUKTIF_KEKAL` → decrements `totalHasilAvailable`; **principal untouched, 100%**
- [x] **Property test:** for any sequence of operations on a `PRODUKTIF_KEKAL` program,
      `pokokDanaTerkumpul` never decreases. This is a fiqh invariant, not a unit test.
- [x] A withdrawal exceeding available yield is rejected, never produces a negative balance

## 🔵 Naufal

### `S10-N-07` — Waqf webhook branch · **[A]** · `[Zone 0]`
- [ ] `LUNAS` → order `TERVERIFIKASI` + ledger increment, one DB transaction
- [ ] `GAGAL` → order `GAGAL`, **ledger untouched**
- [ ] Mock E2E test: order → simulator → webhook → ledger, fully automated

### `S10-N-08` — Digital certificates · **[B]** · `[Zone 1]`
Port the jsPDF generator, triggered on `LUNAS`. Auto internal number, manual BWI number field.

- [ ] PDF downloads with name/`Hamba Allah`, amount, date, internal number
- [ ] Generation failure **does not** fail the payment transaction

### `S10-N-09` — WhatsApp client & templates · **[B]** · `[Zone 1]`
- [ ] Baileys service killed → webhook still 200, ledger still correct
- [ ] Templates separated from send logic (reusable for Zakat/Qurban/Infaq)

## 🟡 Awan

### `S10-A-07` — Home & dashboard · **[B]** · `[Zone 2]`
Hi-Fi section 2: hero carousel, category grid, featured programs, news.
The XP banner renders with a `PRATINJAU` badge (Gamification is Tier C).

- [x] Programs load from real Postgres, **not a constant array**
- [x] Empty and error states handled

> **Awan status (9 Sep 2026):** implemented in `apps/web` — dashboard renders real
> `GET /api/wakaf/programs?active=true`, with loading/error/empty states; XP & news remain
> explicitly PRATINJAU. Commit `06461e6`.

### `S10-A-08` — Waqf catalog & program detail · **[B]** · `[Zone 2]`
Hi-Fi section 4: program cards, progress, Nadzir profile, legal documents, transparency, share.

- [x] Progress percentage matches `pokokDanaTerkumpul / targetDana`
- [x] Web Share API + WhatsApp/clipboard fallback (port of Task 5.1c)

> **Awan status (9 Sep 2026):** `/wakaf` catalog + `/wakaf/$programId` detail implemented;
> progress uses the principal ledger and Nazhir data returned by the enriched waqf read
> routes added for the UI. Commit `06461e6`.

### `S10-A-09` — Waqf donation form · **[B]** · `[Zone 2]`
- [x] Preset + custom amounts, anonymous checkbox, guest form
- [x] Submit → redirect to simulator → return to status page

> **Awan status (9 Sep 2026):** donation form posts to `POST /api/wakaf/orders`, follows the
> mock `redirectUrl`, and returns to `/wakaf/status?orderId=…`. Order → webhook → status
> loop reproduced with real Postgres. Commit `06461e6`.

---

# DAY 4 — Thursday 10 September
### Theme: Waqf wired end to end; Zakat & Qurban begin
### Gate: **Waqf E2E green. This gate cannot be skipped.**
### 🔴 Thursday 20:00 — scope-cut meeting. Any Tier C not yet started is cancelled.

> **Status (9 Sep 2026):** Awan UI for the Day 4 screens is implemented ahead of the
> calendar date on branch `awan` (`06461e6`). Full gate still needs Naufal's auth endpoints
> (`S10-N-02…05`) and certificate generator (`S10-N-08`) before the recorded browser flow
> can pass.

## 🟢 Bara

### `S10-B-10` — Zakat calculator & live gold price · **[B]** · `[Zone 1]`
- [x] Maal & Fitrah calculators; nisab 85 g gold; rate 2.5%
- [ ] `GET /api/zakat/gold-price/live` with 6-hour cache + history fallback + admin manual override
- [x] Provider down → returns last cache with `isStale: true` (not an error)
- [x] Fitrah reads `zakat_fitrah_config`; **no hardcoded figures**

> **Status (9 Sep 2026):** pure calculators, gold-price cache/stale fallback and fitrah
> config landed in `99d8186`; `bun test` for calculator + gold-price passed locally
> (8/8). Admin manual-override endpoint is still outstanding, so the task is not fully
> ticked.

### `S10-B-11` — Zakat orders + webhook branch · **[A]** · `[Zone 1]`
The module that **never created a `Transaction` row** in the legacy repo — the core of AMW-04.

- [ ] A digital zakat order produces a `Transaction` row (prove with a query)
- [ ] TUNAI/BERAS methods → `transactionId` NULL; offline entry still works
- [ ] Webhook `LUNAS` → order verified + `FundPool` increments

> **Status (9 Sep 2026):** implementation merged in `99d8186` with tests on Bara's lane;
> the DB-backed integration tests were not re-run here because they require a dedicated
> `amwal_bun_s10_b06_test` database. Checkboxes stay open until that evidence is re-run.

## 🔵 Naufal

### `S10-N-10` — Qurban: row-locked slots · **[A]** · `[Zone 0]`
Port the pattern from `lib/qurban.ts` — it is correct; do not innovate on it.

- [ ] `SELECT ... FOR UPDATE` + unique constraint `(hewan_batch_id, nomor_slot)`
- [ ] **Concurrency test: 10 buyers race for 1 remaining slot → exactly 1 wins, 9 rejected cleanly**
- [ ] Slots auto-release on `expire`/`cancel`

### `S10-N-11` — Qurban orders + wakalah contract · **[A]** · `[Zone 1]`
- [ ] `akadWakalahAccepted !== true` → **400 before payment is processed**
- [ ] `akadWakalahText` + `acceptedAt` persisted as legal evidence
- [ ] Qurban orders produce a `Transaction` row (the second AMW-04 hole)

## 🟡 Awan

### `S10-A-10` — Waqf E2E in the browser · **[A]** · `[Zone 2]`
**Awan's most important task this sprint.** Walk the entire chain as a real user.

- [ ] Catalog → detail → donate → simulator → status → history → certificate download
- [ ] **Screen-record the whole flow.** The recording is the Day 4 gate evidence,
      not the sentence "it works".

> **Awan status (9 Sep 2026):** catalog → detail → donate → simulator → status is
> implemented and the ledger mutation was reproduced by API E2E (`06461e6`). History and
> certificate download remain blocked on auth + `S10-N-08`; the screen recording has not
> been produced yet.

### `S10-A-11` — Transaction history · **[B]** · `[Zone 2]`
Hi-Fi section 11: list, filters, detail, certificate download.

- [ ] Status filters work; history shows only the user's own transactions
- [ ] Attempt to open another user's transaction ID → **403** (negative test required)

> **Awan status (9 Sep 2026):** history list/detail UI with status filters is implemented
> and wired to the intended `/api/transactions` contract (`06461e6`). The list and 403
> enforcement cannot be proven until Naufal's auth endpoints are mounted on the server.

### `S10-A-12` — Zakat calculator UI · **[B]** · `[Zone 2]`
Hi-Fi section 3.

- [x] Computed results match the `S10-B-10` backend tests
- [x] Stale gold price → warning badge shown to the user (Putaran 8 #7)

> **Awan status (9 Sep 2026):** `/zakat/kalkulator` implemented; results come from
> `POST /api/zakat/calculate` (same pure functions as the backend tests), and the stale
> gold-price badge is shown when the API reports `isStale: true`. Commit `06461e6`.

---

# DAY 5 — Friday 11 September
### Theme: Infaq, back office, Tier C scaffolds
### Evening gate: internal checkpoint — run every Tier A flow back to back

> **Status (9 Sep 2026):** Awan Day 5 UI slices implemented ahead of schedule on branch
> `awan` (`b9f72ed`). Qurban read endpoints return real empty-state data (DB currently has
> 0 batches), and Tier C endpoints return 501.

## 🟢 Bara

### `S10-B-12` — Infaq & Sedekah · **[B]** · `[Zone 1]`
**New feature, not a port.** New `infaq_orders` table — follow §3.3: `jenis` as `text` +
`CHECK`; **do not** extend legacy enums while Next.js is still read.

- [ ] Additive migration passes `drizzle-kit check`
- [ ] Infaq orders use the **exact same** `createPayment()` — zero new payment logic
- [ ] Open the legacy Next.js app after this migration → **still normal**, no enum errors

### `S10-B-13` — Admin Waqf dashboard · **[B]** · `[Zone 1]`
- [ ] Program verification, `WaqfYieldEntry` entry, escrow tranche approve/reject
- [ ] Rejection **requires** `admin_notes` — validated server-side, not only in the UI
- [ ] Every mutation endpoint guarded by `requireRole('ADMIN')` from middleware

## 🔵 Naufal

### `S10-N-12` — In-app notifications · **[B]** · `[Zone 1]`
- [ ] `GET /api/notifications`, `PATCH /api/notifications/[id]/read`
- [ ] Auto-triggered on: payment settled, withdrawal rejected, deposit verified

### `S10-N-13` — Field officer: offline entry & deposits · **[B]** · `[Zone 1]`
The four screens from Putaran 6 section B.

- [ ] Cash-on-hand = total received − total deposited and verified
- [ ] Distribution verification stores `lokasi_lat`, `lokasi_lng`, `jumlah_penerima`
- [ ] `PETUGAS_LAPANGAN` **cannot** reach `/api/admin` (AMW-07 regression test)

### `S10-N-14` — Ask-AI (DeepSeek) · **[C]** · `[Zone 1]`
Simple chat, **no RAG**. Fiqh system prompt; history persisted to `chatbot_messages`.

- [ ] Per-user rate limit — an unmetered LLM endpoint is AMW-06 repeated
- [ ] Authentication required. **No anonymous LLM endpoint, ever.**
- [ ] `PRATINJAU` badge + disclaimer: answers are not a fatwa
- [ ] API key server-side only. `grep -rn "DEEPSEEK" src/client/` → **empty**

## 🟡 Awan

### `S10-A-13` — Qurban screens · **[B]** · `[Zone 2]`
Hi-Fi section 6: animal catalog, package detail, slot picker, wakalah modal.

- [ ] Taken slots render disabled in real time
- [ ] The wakalah modal **cannot be bypassed** — pay button disabled until accepted

> **Awan status (9 Sep 2026):** `/qurban` catalog + `/qurban/$batchId` slot picker and
> wakalah modal implemented (`b9f72ed`); disabled-slot and modal-bypass logic is in code
> but not data-proven because the shared DB currently has 0 qurban batches. `POST
> /api/qurban/orders` row-lock (S10-N-10/11) still belongs to Naufal.

### `S10-A-14` — Infaq, Profile, Settings, Notifications · **[B]** · `[Zone 2]`
Hi-Fi sections 5, 9, 10.

- [ ] Syariah contract catalog + infaq payment form
- [ ] Profile, my documents, change password, settings
- [ ] Notification centre with unread counter

> **Awan status (9 Sep 2026):** infaq contract catalog + payment form and profile /
> settings / notification screens are implemented with loading-error-empty handling
> (`b9f72ed`). Live profile/notification/infaq endpoints and unread counts remain blocked
> on auth, S10-N-12, and S10-B-12.

### `S10-A-15` — Tier C scaffolds · **[C]** · `[Zone 2]`
Gamification (XP, badges, check-in), Education & Quiz, News, Ask-AI, Nadzir Portal.
**Full UI from the Hi-Fi, stubbed backend.**

- [x] Every screen renders the `PRATINJAU` badge
- [x] Stub endpoints return **`501 Not Implemented`**, never constant data
- [x] `grep -rn "const mock\|const dummy\|DATA_SIMULASI" src/` → **zero hits.**
      This is exactly AMW-10 and AMW-11; we do not repeat them.

> **Awan status (9 Sep 2026):** Edukasi, Berita, Gamifikasi, Tanya AI, and Portal Nadzir
> scaffolds implemented (`b9f72ed`); each screen shows PRATINJAU and calls a 501 endpoint.

---

# DAY 6 — Saturday 12 September
### Theme: Verification, deployment, honest status
### Gate: every piece of evidence is reproducible by someone else from a clean repo

> **Status (9 Sep 2026):** Awan's honest status file (`STATUS.md`) created on branch
> `awan` (`b9f72ed`). Full verification/reproducibility gate still requires Bara + Naufal's
> deployment, staging, and RBAC audit tasks.

## 🟢 Bara

### `S10-B-14` — Staging migration deploy & AMW-01 proof · **[A]** · `[Zone 0]`
- [ ] A **clean** staging database rebuilt **only** from committed migration files
- [ ] Resulting schema matches `drizzle-kit pull` against production Supabase
- [ ] `RUNBOOK.md` written from the steps **actually executed**, not from memory

### `S10-B-15` — VPS deploy & smoke test · **[A]** · `[Zone 1]`
- [ ] `docker compose up -d` → api + baileys + caddy healthy, valid TLS
- [ ] `curl` the Baileys QR endpoint from outside → **completely unreachable**
- [ ] Restart the Baileys container → **WA session survives** (AMW-16 proof)

## 🔵 Naufal

### `S10-N-15` — Security & fiqh audit · **[A]** · `[Zone 0]`
- [ ] 4 roles × every namespace matrix executed; results pasted into the PR
- [ ] Every Hono route compared against `rbac.matrix.ts` — **zero routes without middleware**
- [ ] Remove one env var → process refuses to start (AMW-08 proof)
- [ ] Fiqh invariant re-verified: `PRODUKTIF_KEKAL` principal never decreases
- [ ] NIK stored encrypted — a raw DB query **shows no readable NIK**

### `S10-N-16` — DECISION_LOG Putaran 13 · **[A]** · `[Zone 0]`
Record the official scope change. Append-only; never edit prior entries.

- [ ] The Bun migration decision and its reasoning
- [ ] **Reversal of Putaran 6**: Infaq, Gamification, Education/Quiz, Chatbot return to scope
- [ ] **V.1 is custodial** — split settlement unavailable, plus the mitigation plan
- [ ] Which modules are Tier A/B/C, and what is deliberately **not** finished

## 🟡 Awan

### `S10-A-16` — Negative tests & edge states · **[A]** · `[Zone 2]`
- [ ] Every screen handles empty, loading, and error states
- [ ] Access an admin page as `WAKIF` → rejected **by the server**, not hidden with CSS
- [ ] Test at mobile viewport — this Hi-Fi is mobile-first

### `S10-A-17` — Honest status file · **[A]** · `[Zone 2]`
`STATUS.md` at repo root: what is genuinely done, what is scaffold, what has not started.

- [x] Every Tier C module listed explicitly as **"UI ready, backend pending"**
- [x] Not a single "tested manually" used as evidence
- [x] This file is what Monday's meeting reads — not the impression left by a screen that looks finished

> **Awan status (9 Sep 2026):** `STATUS.md` created at repo root with evidence commands,
> scaffold labels, and blocked items. Commit `b9f72ed`.

---

## 5. Daily Verification Gates

A failed gate means the next day **starts there**, not on new tasks.
This is what stops hidden debt from accumulating until Friday.

| Day | Gate | How to prove it | Owner |
|---|---|---|---|
| **1** | Migrations & auth stand up | Empty DB → `drizzle-kit migrate` → 38 tables; `bun test auth` green; legacy `/admin` redirects to login | Bara + Naufal |
| **2** | Idempotency proven | 10 parallel identical webhooks → ledger increments exactly once | Bara |
| **3** | Waqf ledger correct | `bun test ledger` green, including the principal-invariant property test | Bara + Naufal |
| **4** | **Waqf E2E alive** | Screen recording of the full catalog → certificate flow | Awan |
| **5** | Three modules share one payment engine | DB query: Waqf, Zakat, Qurban, Infaq orders all carry a `Transaction` | Bara |
| **6** | Rebuildable from zero | Clean staging from committed files; RBAC matrix passes | Bara + Naufal |

### Evidence rule (kills fake DoD)

A task may be ticked only when it produces an **artefact someone else can re-run**: a passing
test, a `curl` command with its output, a SQL query with its result, or a screen recording.
The following are **not accepted as evidence**:

> ~~"tested manually"~~ · ~~"works on my machine"~~ · ~~"covered by the regression suite"~~

The third phrase appears in `DECISION_LOG.md` Putaran 8 #5, on a project with no test runner
at all. Fixing that is part of this sprint — not just the code.

---

## 6. Workload Summary

| Dev | Tier A | Tier B | Tier C | Total |
|---|---|---|---|---|
| 🟢 Bara | 8 | 6 | 0 | 15 |
| 🔵 Naufal | 10 | 5 | 1 | 16 |
| 🟡 Awan | 4 | 10 | 3 | 17 |

Awan carries the largest Tier B/C load by design: Zone 2 is where DeepSeek accelerates most,
while Bara's and Naufal's Tier A work is precisely the zone that **must not** be touched by
vibe coding without a contract and tests written first.

---

*Sprint 10 — 6 September 2026. Continues the Amwal Baseline Audit and Bun Migration Roadmap.*
*Finding IDs AMW-01…AMW-17 are consistent with the audit document.*


---
---

# SPRINT 11 — "FULL FEATURE & STAKEHOLDER ALIGNMENT" (3 HARI KERJA)

**Branch induk:** `sprint-11` · **Basis:** `main` (Putaran 17) + fitur `pankop` + migrasi `0003` yang dipulihkan
**Jendela agent:** Senin–Rabu (3 hari aktif) · **Kamis:** code freeze, audit manual & smoke test oleh Bara, Naufal, Awan
**Pelaksana:** 10 agent AI — 3 lane × 3 agent + Claude Pro (anchor, lead architecture, reviewer, audit gate)
**Lingkungan eksternal:** sandbox **live** Mayar dan Supabase Storage

> **Sumber kebenaran:** `docs/sprint-11/PLAN.md`. Bagian ini adalah daftar tiket untuk
> pelacakan harian. **Batas kepemilikan berkas per agent (PLAN §3) dan aturan hotspot
> (PLAN §4) wajib dibaca sebelum menulis kode** — tabel di bawah hanya menyebut modulnya.
>
> Teks tiket Sprint 10 di atas dibekukan dan tidak diubah. Pola tiket Sprint 11 memakai ID
> dari PLAN (`I-x`, `S-x`) agar trailer commit `Ticket: I-x` konsisten dengan dokumen rencana.

---

## S11.1 Roster agent

| Lane | Agent | Slug commit & branch | DB uji |
|---|---|---|---|
| Anchor | Claude Pro | `claude-pro` | `amwal_bun_s11_claude_pro_test` |
| 🟢 Bara | Claude Code Bara | `claude-bara` | `amwal_bun_s11_claude_bara_test` |
| 🟢 Bara | Codex Bara | `codex-bara` | `amwal_bun_s11_codex_bara_test` |
| 🟢 Bara | Antigravity Bara | `antigravity-bara` | `amwal_bun_s11_antigravity_bara_test` |
| 🔵 Naufal | Claude Code Naufal | `claude-naufal` | `amwal_bun_s11_claude_naufal_test` |
| 🔵 Naufal | Codex Naufal | `codex-naufal` | `amwal_bun_s11_codex_naufal_test` |
| 🔵 Naufal | Antigravity Naufal | `antigravity-naufal` | `amwal_bun_s11_antigravity_naufal_test` |
| 🟡 Awan | Claude Code Awan | `claude-awan` | `amwal_bun_s11_claude_awan_test` |
| 🟡 Awan | Codex Awan | `codex-awan` | `amwal_bun_s11_codex_awan_test` |
| 🟡 Awan | Antigravity Awan | `antigravity-awan` | `amwal_bun_s11_antigravity_awan_test` |

Branch kerja: `s11/<slug>/<tiket>` dari `sprint-11`. Setiap nama DB lolos guard
`^amwal_bun_[a-z0-9_]+_test$` (`apps/web/tests/test-database-guard.ts`).

---

## S11.2 Prasyarat — sudah selesai sebelum agent dilepas

- [x] **P1** — URL Supabase pooler produksi dihapus dari `apps/web/.env` (berkas tidak ter-track; setiap mesin agent wajib memeriksa miliknya sendiri)
- [x] **P2** — Migrasi `0003_sharp_silver_sable` dipulihkan byte-identik dari `cbee823` (`7db0c67`); `drizzle-kit check` bersih, `generate` no-op
- [x] **P3** — Guard DB uji dipusatkan dan dilonggarkan ke pola per-agent; dua lubang lama ditutup (`a4fd0ad`)
- [x] **P4** — Hook pre-commit hanya memformat berkas yang di-stage (`lefthook.yml`)

---

## S11.3 Keputusan terkonfirmasi

| # | Keputusan | Status |
|---|---|---|
| D1 | ID 12 digit `MM BB YY SS NNNN`; modul 60 Wakaf · 70 Zakat · 80 Infaq · 85 Sedekah · 90 Qurban; sequence 0001–9999 reset per cakupan bulanan; bulan & tahun di zona Asia/Jakarta | **Dikonfirmasi** |
| D1 | Sub-program: konstanta pemetaan dengan **default `'00'`** untuk semua modul sampai YMI menyerahkan tabel resmi; mengubahnya tidak memerlukan migrasi | **Dikonfirmasi** |
| D2 | `poin = 200 + ⌊nominal / 1.000⌋` untuk transaksi LUNAS; poin non-moneter, tidak dapat diuangkan | **Dikonfirmasi** |
| D3 | Template akad di database, versi append-only, dapat diperbarui admin tanpa deploy; persetujuan tersimpan per transaksi dengan `body_sha256` | **Dikonfirmasi** |
| D4 | Layout mengacu `amwalheti`; jam `HH:mm:ss WIB`; rute publik `/verifikasi/$nomor` | **Dikonfirmasi** |
| D5 | Mayar **fail-closed**: body webhook tidak dipercaya; status & nominal diambil ulang dari API Mayar memakai API key server | **Dikonfirmasi** |
| D5 | Storage: bucket privat `amwal-receipts`, upload hanya lewat server, simpan object key, signed URL 10 menit | **Dikonfirmasi** |
| D5 | **Kredensial:** project Supabase sandbox terisolasi (bukan project `.env.production`). `SUPABASE_SERVICE_ROLE_KEY` hanya di lingkungan **Antigravity Bara** & **Claude Pro**; `MAYAR_API_KEY` hanya di **Claude Code Bara** & **Claude Pro**. Tidak pernah ditulis ke berkas ter-track, log, commit, atau berkas status agent | **Dikonfirmasi** |
| D6 | Saldo poin tidak pernah < 0; penalti −20/hari tanpa check-in, maksimal 7 hari ke belakang per penyelesaian | **Dikonfirmasi** |

---

## S11.4 Work Breakdown Structure harian

Setiap agent bekerja **tiga hari penuh** dengan fase yang sama untuk semua:

| Fase | Hari | Isi |
|---|---|---|
| **Kontrak** | Senin | Skema Zod, fungsi murni + unit test tanpa DB, stub router, kebutuhan DDL, fixture, inventaris |
| **Backend** | Selasa | Prosedur oRPC, query Drizzle, transaksi atomik, tes integrasi & tes negatif |
| **Integrasi** | Rabu | Komponen TanStack Start, penyambungan oRPC, loading/empty/error state, polish, tes akhir |

**Aturan yang berlaku untuk semua sub-task di bawah:**
- Batas berkas mengikuti **`docs/sprint-11/PLAN.md` §3** — satu berkas, satu pemilik. Sub-task yang butuh berkas
  agent lain ditulis sebagai **titik serah terima** (§S11.4.0), bukan dikerjakan lintas berkas.
- Jendela merge **12:00** dan **16:30**. Artefak yang dijanjikan "≤ 12:00" harus sudah ter-merge di jendela itu.
- Setiap sub-task ditandai tiketnya, mis. `[I-1]`, dan trailer commit `Ticket: I-1` wajib sama.
- Checklist **Defensif** adalah bagian dari DoD, bukan pekerjaan opsional.
- **`docs/sprint-11/CONTRACT-CHANGES.md` hanya ditulis Claude Pro.** Agent lain mengajukan temuan, permintaan dependensi, atau perubahan kontrak lewat berkas statusnya sendiri (`docs/sprint-11/status/<slug>.md`); Claude Pro menyalin yang disetujui di jendela merge berikutnya.

### S11.4.0 Titik serah terima antar-agent

Satu-satunya cara agent saling menunggu. Keterlambatan di sini dilaporkan di berkas status agent, bukan dikejar lintas berkas.

| Batas | Dari | Ke | Artefak |
|---|---|---|---|
| Sen 10:00 | Claude Code Bara | Codex Bara · Codex Awan · Claude Code Naufal | Signature beku `wibParts()` |
| Sen 10:00 | Antigravity Bara · Claude Code Naufal · Antigravity Naufal · Claude Code Awan · Antigravity Awan | Claude Pro | Kebutuhan DDL fitur untuk `0004` |
| Sen 10:00 | Claude Code Awan | Claude Pro | Inventaris redaksi akad yang **sudah tampil di UI** (seed versi 1) |
| Sen 11:30 | Pemilik router fitur | Claude Pro | Stub `router/<fitur>.ts` + stub `lib/{gamification,affiliate}/settle-hook.ts` |
| Sen 12:00 | Claude Pro | Semua | `0004` teraplikasi · router ter-mount · `components/ui/skeleton.tsx` |
| Sen 13:00 | Claude Pro | Semua | Kontrak beku: `PaymentProvider` v2, Zod per fitur, parameter `akadAcceptance` & `attribution` di `createPayment`, signature `applyProviderEvent` |
| Sel 12:00 | Claude Code Naufal | Codex Naufal | Kernel `award()` & `settlePenalties()` |
| Sel 16:30 | Claude Pro | Claude Code Bara | `applyProviderEvent()` di `webhook.ts` (dipakai job rekonsiliasi) |
| Sel 16:30 | Claude Code Awan · Antigravity Naufal | Claude Code Bara | `recordAkadAcceptance()` · `recordAttribution()` |
| Sel 16:30 | Codex Awan | Claude Code Awan | Pustaka `components/share/**` |
| Sel 16:30 | Antigravity Naufal | Codex Awan | Prosedur `affiliate.myCode` (untuk `?ref=` di tautan bagikan) |
| Rab 12:00 | Codex Awan | Antigravity Awan | `/poin` sudah tidak memakai `GamificationScaffold` |

---

### 🔷 Claude Pro — Anchor · `S-3` · fondasi kontrak · review

**Senin — Kontrak**
- [ ] 09:00 cabang `s11/<slug>/<tiket>` untuk kesembilan agent dari `sprint-11` · 🔎 _Audit 18-09:_ tidak dipakai — integrasi berjalan lewat cabang lane `bara`/`awan`/`naufal` + PR ke `sprint-11`
- [x] ≤ 12:00 migrasi konsolidasi `0004` dari kebutuhan DDL pukul 10:00: `transaction_id_counters` (CHECK 1–9999), `idempotency_key UNIQUE` + `source_ref` ledger poin, `akad_templates` + `akad_acceptances` + seed versi 1, `affiliate_codes` / `affiliate_attributions` / `affiliate_clicks`, kolom CMS (`slug`, `body`, `status` text+CHECK, `published_at`, `cover_url`), tabel lampiran kuitansi `[S-3 fondasi]` · 🔎 _Audit 18-09:_ `apps/web/drizzle/0004_consolidated_sprint11.sql` (counter CHECK ≤ 9999, akad, afiliasi, CMS, `program_receipt_attachments`)
- [ ] Migrasi manual `CREATE INDEX CONCURRENTLY` untuk kolom waktu, di luar transaksi migrasi Drizzle `[S-3]` · 🔎 _Audit 18-09:_ **PENDING** — tidak ada migrasi `CONCURRENTLY`; hanya disebut di `db/MIGRATION_RULES.md` (`S-3` belum dikerjakan)
- [x] ≤ 12:00 `components/ui/skeleton.tsx`; mount semua router stub, RBAC, export wildcard core, env opsional, item sidebar, `lib/payment/on-settled.ts`; `recharts` · 🔎 _Audit 18-09:_ `components/ui/skeleton.tsx`, `recharts` terpasang, router ter-mount. Deviasi: tidak ada `lib/payment/on-settled.ts` — slot `onSettled` inline di `routes/api/webhooks/payment.ts`
- [x] ≤ 13:00 `PaymentProvider` v2 di `types.ts`; bekukan kontrak Zod milik tiap agent; signature `applyProviderEvent` `[I-11]` · 🔎 _Audit 18-09:_ `packages/core/src/payment/types.ts` (`PaymentProviderV2`, `resolveWebhook`, `reconcileTransaction`)
- [ ] 17:00 jalankan gate Senin · 🔎 _Audit 18-09:_ bukti gate harian tidak tercatat; digantikan gate audit 18-09 (lihat Sprint 11.1)

**Selasa — Backend**
- [x] `webhook.ts` agnostik provider: handler memanggil `resolveWebhook()`; normalisasi status keluar dari webhook `[I-11]` · 🔎 _Audit 18-09:_ `packages/core/src/payment/webhook.ts:551` memanggil `resolveWebhook()` bila tersedia
- [x] Ekstrak `applyProviderEvent(tx, event)` — satu jalur perubahan status untuk webhook **dan** rekonsiliasi `[I-11]` · 🔎 _Audit 18-09:_ dipakai webhook **dan** `payment/reconciliation.ts`
- [x] Jendela `0005` 12:00 (hanya bila ada kebutuhan DDL susulan yang disetujui) · 🔎 _Audit 18-09:_ tidak diperlukan — tidak ada DDL susulan, tidak ada `0005`
- [x] 13:00 salin keputusan Mayar dari `docs/sprint-11/status/claude-bara.md` ke `CONTRACT-CHANGES.md`; lakukan hal yang sama untuk ajuan agent lain di setiap jendela merge `[I-11]` · 🔎 _Audit 18-09:_ `docs/sprint-11/CONTRACT-CHANGES.md` memuat keputusan Mayar
- [ ] Review PR kernel Zone 0 (`I-10`, `I-1`); tes idempotensi webhook lama tetap hijau **tanpa diubah** · 🔎 _Audit 18-09:_ tes idempotensi webhook lama hijau (416/416); jejak review manusia belum tercatat

**Rabu — Integrasi & rilis**
- [ ] Review & merge berkelanjutan; tolak PR yang menyentuh berkas di luar §3 · 🔎 _Audit 18-09:_ berjalan (PR #27, #30, #31, #32 ter-merge); tidak ditutup sampai freeze
- [ ] Seluruh gate di DB `amwal_bun_s11_claude_pro_test`; audit `git diff --name-only origin/main...sprint-11` · 🔎 _Audit 18-09:_ gate 18-09 dijalankan di `amwal_bun_bara_test`, bukan DB Claude Pro
- [ ] 17:00 code freeze · 18:00 PR `sprint-11 → main` berisi ringkasan hasil gate · 🔎 _Audit 18-09:_ **PENDING** — PR `sprint-11 → main` belum dibuka

**Defensif**
- [ ] `0004` diterapkan dua kali di DB kosong → tetap bersih (seed memakai `ON CONFLICT DO NOTHING`) · 🔎 _Audit 18-09:_ tidak ada bukti terekam
- [ ] PR Zone 0 milik sendiri di-review Claude Code Bara, bukan oleh diri sendiri · 🔎 _Audit 18-09:_ tidak ada bukti terekam
- [x] Tidak ada provider toast lokal; `components/ui/skeleton.tsx` punya `aria-busy` & teks alternatif untuk pembaca layar · 🔎 _Audit 18-09:_ `skeleton.tsx` memuat `aria-busy`

---

### 🟢 Claude Code Bara — `I-1` · `I-11`

**Senin — Kontrak**
- [x] ≤ 10:00 signature beku `wibParts(date) → { year, month, day, hour, minute, second }` di `core/time/wib.ts`; implementasi + tes batas: 23:59:59 dan 00:00:00 WIB, 17:00 UTC hari sebelumnya, pergantian tahun `[I-1]` · 🔎 _Audit 18-09:_ `packages/core/src/time/wib.ts` + `tests/time-wib.test.ts` — **Bara**
- [x] Regex kanonik ID v2, `formatOrderId()` / `parseOrderId()` murni; `moduleCode()` menurunkan 85/80 dari `infaq_orders.jenis`; konstanta sub-program default `'00'` `[I-1]` · 🔎 _Audit 18-09:_ `packages/core/src/payment/order-id.ts` + `tests/order-id-v2.test.ts` — **Bara**
- [x] Setelah `0004` (≥ 12:00): `nextOrderSequence(tx, scopeKey)` upsert atomik + tes 20 panggilan paralel → 20 nomor unik berurutan, nomor ke-10.000 ditolak CHECK database `[I-1]` · 🔎 _Audit 18-09:_ `payment/order-sequence.ts` + `tests/order-sequence.test.ts` (paralel & ke-10.000) — **Bara**
- [x] Spike sandbox Mayar: buat payment request, bayar, catat bentuk respons & webhook **asli** di berkas status `docs/sprint-11/status/claude-bara.md` (Claude Pro yang menyalinnya ke `CONTRACT-CHANGES.md`); daftarkan satu URL webhook sandbox `[I-11]` · 🔎 _Audit 18-09:_ `docs/sprint-11/status/claude-bara.md` (status SELESAI, webhook sandbox terdaftar) — **Bara**

**Selasa — Backend**
- [x] `createPayment()` memakai ID v2 + counter di dalam transaksi anchor `[I-1]` · 🔎 _Audit 18-09:_ `payment/service.ts:232` di dalam transaksi anchor — **Bara**
- [x] `moduleFromOrderId()` mengenali v2 **dan** format lama `AMW-…` / `INF-…` `[I-1]` · 🔎 _Audit 18-09:_ `order-id.ts` (v2 + `AMW-…`/`INF-…`) — **Bara**
- [x] Midtrans & Mock dibungkus ke kontrak v2 bersama Claude Pro; tidak dihapus `[I-11]` · 🔎 _Audit 18-09:_ `resolveWebhook` di `midtrans.provider.ts` & `mock.provider.ts`
- [x] `MayarPaymentProvider.createTransaction` + `resolveWebhook`: token constant-time → hanya `payment.received` → re-fetch detail → status & nominal dari re-fetch → nominal ≠ anchor ditolak & dicatat → korelasi `providerRef` `[I-11]` · 🔎 _Audit 18-09:_ `payment/mayar.provider.ts`; `tests/payment/mayar-provider.test.ts`, `apps/web/tests/orpc/mayar-webhook.test.ts` — **Bara**
- [x] 13:00 keputusan Mayar jalan / flag-only ditulis di `docs/sprint-11/status/claude-bara.md` untuk dicatat Claude Pro `[I-11]` · 🔎 _Audit 18-09:_ tercatat di `claude-bara.md` & `CONTRACT-CHANGES.md`

**Rabu — Integrasi**
- [ ] Panggil `recordAkadAcceptance()` dan `recordAttribution()` di dalam transaksi anchor `createPayment` `[I-6][I-4]` · 🔎 _Audit 18-09:_ **SEBAGIAN** — `recordAttribution` di dalam anchor (`service.ts:256`); `recordAkadAcceptance` masih dipanggil router **setelah** `createPayment` dengan `context.db` (non-atomik)
- [x] `POST /api/cron/payments-reconcile` (`CRON_SECRET`): PENDING Mayar > 15 menit diperiksa ulang lewat API dan diterapkan via `applyProviderEvent` `[I-11]` · 🔎 _Audit 18-09:_ `routes/api/cron/payments-reconcile.ts` + `core/payment/reconciliation.ts`; `tests/orpc/payments-reconcile.test.ts` — Claude Pro di lane Bara (PR #30)
- [ ] Simulator pembayaran menampilkan & menerima ID v2; E2E sandbox sampai LUNAS `[I-1][I-11]` · 🔎 _Audit 18-09:_ **SEBAGIAN** — `/dev/payment-simulator` menerima ID v2 (`tests/orpc/payment-simulator.test.ts`); E2E sandbox Mayar → LUNAS belum ada bukti terekam
- [x] Tes negatif lengkap: token salah, nominal dimanipulasi, webhook ganda, event di luar urutan `[I-11]` · 🔎 _Audit 18-09:_ token salah, nominal ≠ anchor, webhook ganda (ledger tepat sekali), timeout 504 — `mayar-webhook.test.ts`

**Defensif**
- [x] **Timeout re-fetch Mayar:** `AbortSignal.timeout(8000)`; retry maksimal 2× dengan backoff hanya untuk error jaringan/5xx, **tidak** untuk 4xx · 🔎 _Audit 18-09:_ `AbortSignal.timeout` per percobaan, retry 2× (500/1000 ms), 4xx tidak di-retry — diuji
- [x] **Failover fail-closed:** re-fetch gagal → webhook dijawab 5xx tanpa mengubah ledger (bisa diulang); status **tidak pernah** diturunkan ke GAGAL karena timeout. Karena kebijakan retry Mayar tidak terdokumentasi, job rekonsiliasi adalah jaring pengamannya — bukan harapan bahwa Mayar mengirim ulang · 🔎 _Audit 18-09:_ "returns 504 on re-fetch timeout and never marks GAGAL"
- [x] Rekonsiliasi dan webhook memakai `applyProviderEvent` yang sama sehingga keduanya idempoten terhadap satu sama lain · 🔎 _Audit 18-09:_ `reconciliation.ts:92`
- [x] ID tidak pernah di-cast ke `number`; sequence habis → `ORDER_SEQUENCE_EXHAUSTED`, bukan berputar · 🔎 _Audit 18-09:_ `ORDER_SEQUENCE_EXHAUSTED` di `packages/core/src`

---

### 🟢 Codex Bara — `I-7` · `I-8` (zakat, qurban, infaq, sedekah)

**Senin — Kontrak**
- [x] `core/analytics/period.ts`: `{ year, month? }` → rentang `[start, end)` WIB terhadap signature `wibParts` pukul 10:00; tolak `month` tanpa `year`, bulan di luar 1–12 `[I-8]` · 🔎 _Audit 18-09:_ `tests/analytics-period.test.ts`
- [x] Agregasi murni + tes: bucket seri waktu (bucket kosong diisi 0), donatur unik vs jumlah transaksi, akumulasi kumulatif, komposisi per modul `[I-7]` · 🔎 _Audit 18-09:_ `core/analytics/aggregation.ts` + `tests/analytics-aggregation.test.ts`
- [x] Kontrak `contracts/admin-analytics.ts`; stub `router/admin/analytics.ts` ≤ 11:30 `[I-7]`

**Selasa — Backend**
- [x] Prosedur `admin.analytics.{trend, accumulation, composition}` di balik `adminProcedure`, query memakai index waktu `[I-7]` · 🔎 _Audit 18-09:_ `router/admin/analytics.ts`; `tests/orpc/admin-analytics.test.ts`
- [x] Input `{ year, month? }`: tahun di `admin.zakat` & `admin.qurban`; bulan+tahun di `admin.infaq` dengan pemisahan `INFAQ_*` vs `SEDEKAH_*` `[I-8]` · 🔎 _Audit 18-09:_ `tests/orpc/admin-period-filters.test.ts`
- [x] Tes: batas 1 Jan 00:30 WIB, periode tanpa data → seri nol (bukan error), non-ADMIN → 403 `[I-7][I-8]` · 🔎 _Audit 18-09:_ `admin-analytics.test.ts` + `admin-period-filters.test.ts`

**Rabu — Integrasi**
- [ ] Tiga grafik inti `recharts`: tren donatur vs transaksi, akumulasi dana per periode, komposisi modul `[I-7]` · 🔎 _Audit 18-09:_ **PENDING** — `overview-view.tsx` (restorasi 1:1 PR-28) hanya punya `PieChart` berdata contoh; tidak mengonsumsi `admin.analytics`
- [ ] Integrasi `overview-view.tsx` dan filter di halaman `routes/admin/ziswaf/**` `[I-7][I-8]` · 🔎 _Audit 18-09:_ **PENDING** — lihat butir di atas
- [ ] Filter tersimpan di search params URL (dapat dibagikan & dimuat ulang) `[I-8]` · 🔎 _Audit 18-09:_ **PENDING** — tidak ada `validateSearch` periode di `routes/admin/**`

**Defensif**
- [ ] **Skeleton** memakai `components/ui/skeleton.tsx` selama grafik & tabel dimuat; tidak ada lompatan layout saat data tiba · 🔎 _Audit 18-09:_ menunggu integrasi grafik
- [ ] Empty state "Belum ada transaksi pada periode ini"; error state dengan tombol coba lagi · 🔎 _Audit 18-09:_ menunggu integrasi grafik
- [ ] Nominal tetap string numeric sampai titik plotting; label sumbu & tooltip format Rupiah · 🔎 _Audit 18-09:_ menunggu integrasi grafik
- [x] **Tidak ada** analitik RFMD/segmentasi

---

### 🟢 Antigravity Bara — `S-2` · `I-2` · `I-8` (wakaf)

**Senin — Kontrak**
- [x] `core/storage/supabase.ts` fail-closed: `upload`, `createSignedUrl` (10 menit), `remove`; error selalu dilempar, tidak pernah URL palsu `[S-2]` · 🔎 _Audit 18-09:_ `packages/core/src/storage/supabase.ts`
- [x] Builder object key `amwal-receipts/<programId>/<ulid>.<ext>` + pendeteksi tipe berkas dari **magic bytes** (fungsi murni + tes) `[S-2][I-2]` · 🔎 _Audit 18-09:_ `core/storage/mime.ts` + `tests/storage-mime.test.ts`
- [ ] Uji upload nyata ke bucket privat sandbox dan baca lewat signed URL (bukti gate Senin) `[S-2]` · 🔎 _Audit 18-09:_ tidak ada bukti terekam
- [x] ≤ 10:00 kebutuhan DDL tabel lampiran kuitansi ke Claude Pro `[I-2]` · 🔎 _Audit 18-09:_ `program_receipt_attachments` di `0004`

**Selasa — Backend**
- [x] `routes/api/uploads/receipts.ts` khusus ADMIN; object key disimpan, signed URL tidak pernah disimpan `[I-2]` · 🔎 _Audit 18-09:_ `tests/orpc/receipts-upload.test.ts` (401/403)
- [x] `admin.waqf.addProgress` menolak kuitansi tanpa minimal satu foto barang/pembuat/progres `[I-2]` · 🔎 _Audit 18-09:_ invarian bukti foto `router/admin/waqf.ts:205`
- [x] Filter bulan+tahun di `admin.waqf` `[I-8]`
- [x] Tes negatif upload: ukuran berlebih, tipe palsu, tanpa foto, non-ADMIN `[I-2]` · 🔎 _Audit 18-09:_ 413 streaming, magic bytes palsu/SVG/HTML, 401/403

**Rabu — Integrasi**
- [ ] UI audit kuitansi: dropzone, pratinjau, progress, pesan penolakan per jenis (ukuran / tipe / jaringan), coba lagi `[I-2]` · 🔎 _Audit 18-09:_ **SEBAGIAN** — `components/receipts/receipt-dropzone.tsx` + `tests/components/receipt-dropzone.test.tsx` ada tetapi **belum di-mount** di halaman mana pun (Bara, Sprint 11.1)
- [ ] Filter bulan+tahun wakaf di `wakaf-programs-view.tsx` `[I-8]` · 🔎 _Audit 18-09:_ **PENDING** — tidak ada kontrol filter periode di view
- [ ] Skeleton daftar kuitansi `[I-2]` · 🔎 _Audit 18-09:_ belum terverifikasi

**Defensif**
- [x] **Ukuran:** batas 5 MB ditegakkan sambil membaca stream (hitung byte, hentikan di byte ke-5 MB+1) — `Content-Length` tidak dipercaya · 🔎 _Audit 18-09:_ `receipts.ts:97`, diuji 413
- [x] **MIME asli dari magic bytes**, abaikan `Content-Type` dan ekstensi: JPEG `FF D8 FF` · PNG `89 50 4E 47 0D 0A 1A 0A` · WebP `RIFF····WEBP` · PDF `25 50 44 46 2D`; SVG & HTML selalu ditolak · 🔎 _Audit 18-09:_ diuji
- [x] Nama berkas asli tidak pernah masuk object key (path traversal) · 🔎 _Audit 18-09:_ key berbasis `ulid`; nama asli hanya kolom metadata
- [x] Upload berhasil tetapi simpan ke DB gagal → objek dihapus (kompensasi), tidak ada berkas yatim · 🔎 _Audit 18-09:_ tes "Orphan File Compensation"
- [ ] Signed URL kedaluwarsa (403) → minta ulang otomatis sekali sebelum menampilkan error · 🔎 _Audit 18-09:_ belum terverifikasi

---

### 🔵 Claude Code Naufal — `I-10` · pemeliharaan `S-1`

> **Status per 18 Sep 2026 — kernel diambil alih lane Codex Awan (`codex/awan`) atas persetujuan pemilik sprint**,
> karena prosedur `I-10b` tidak bisa berdiri tanpa `award()`/`settlePenalties()`. Yang mendarat:
> `packages/core/src/gamification/ledger.ts`, `ACTIVITY_POINTS` + builder kunci di `points.ts`, parameter
> `registeredOn` di `penalties.ts`, dan helper WIB bersama di `core/time/wib.ts`. Sisa yang **tidak** dikerjakan:
> notifikasi perolehan poin (Rabu). Bukti: 10 uji murni + 16 uji integrasi hijau; D6/200-Webhook terverifikasi di DB.

**Senin — Kontrak**
- [x] `core/gamification/points.ts` murni: `transactionPoints(amount)` = 200 + ⌊amount/1.000⌋; tolak nominal pecahan/negatif `[I-10]`
- [x] Perencana penalti murni → daftar hari & potongan: floor 0, maksimal 7 hari, lewati hari sebelum tanggal daftar `[I-10]`
      — dinamai `settlePenalties()` (bukan `penaltyPlan`) dan menerima `registeredOn` opsional yang ditambahkan pada pengambilalihan ini.
- [x] Builder kunci idempotensi untuk semua aturan poin (`registerKey`/`checkInKey`/`quizKey`/`readKey`/`watchKey` + `penaltyKey`); uji murni: saldo tidak pernah < 0, perhitungan ulang identik `[I-10]`
- [x] Kebutuhan DDL ledger ke Claude Pro (mendarat di `0004`) · `lib/gamification/settle-hook.ts` dibuat nyata, bukan stub no-op `[I-10]`

**Selasa — Backend**
- [x] `award(tx, …)` dengan `ON CONFLICT (idempotency_key) DO NOTHING` `[I-10]`
- [x] `settleUserPenalties(userId, today)`: `pg_advisory_xact_lock(hashtext(userId))` + insert set-based; baris bernilai 0 tetap ditulis sebagai penanda `[I-10]`
- [x] Settle-hook transaksi (D2) di slot `onSettled`; slot gagal tidak menggagalkan webhook `[I-10]`
      — dipanggil dari `routes/api/webhooks/payment.ts` **di dalam try/catch webhook**, dan hanya setelah transaksi settlement commit.
- [x] Tes DB: webhook LUNAS 2× → poin tepat sekali; settle 2× → saldo identik; saldo 30 + 3 hari bolos → 0; 10 hari bolos → hanya 7 dihitung `[I-10]`

**Rabu — Integrasi**
- [ ] Notifikasi perolehan poin & penalti memakai modul notifikasi `pankop`; tampil di `components/user-area/**` `[I-10]`
      — **tidak dikerjakan** (di luar lingkup pengambilalihan yang disetujui).
- [x] Uji konkurensi: 20 check-in paralel untuk user yang sama → tepat satu baris `[I-10]`
- [x] Settle penalti batch besar (sweep 500 + cursor, konkurensi 25) tanpa lock tabel `transactions`; tes fitur `pankop` tetap hijau `[S-1]`

**Defensif**
- [x] Kunci per-user, bukan kunci tabel — check-in user A tidak pernah menunggu user B
- [x] Batas hari penalti memakai tanggal WIB (`toWibDate`), bukan tanggal server UTC
- [x] Penalti tidak pernah menagih hari sebelum akun dibuat (diuji: akun yang dibuat hari ini → 0 hari diselesaikan)

---

### 🔵 Codex Naufal — `I-10b`

> **Status per 18 Sep 2026 — diambil alih lane Codex Awan (`codex/awan`) atas persetujuan pemilik sprint.**
> Alasan: `/poin` sudah selesai di sisi UI tetapi tidak bisa menampilkan data riil selama prosedurnya tidak ada,
> dan badge `PRATINJAU` hanya boleh dicabut setelah backend riil. Kernel `I-10` (`core/gamification/**`) ikut
> dikerjakan karena prosedurnya tidak bisa berdiri tanpa `award()`/`settlePenalties()`. Bukti: 16 uji integrasi
> hijau (`apps/web/tests/orpc/gamification.test.ts`), termasuk **20 check-in paralel → tepat satu baris ledger**.
> Rincian & berkas lintas-lane yang tersentuh: `docs/sprint-11/status/codex-awan.md`.

**Senin — Kontrak**
- [x] `contracts/gamification.ts`: request/response `checkIn`, `summary`, `history` (paginasi cursor), `claimRead`, `claimQuiz`, `claimWatch` `[I-10b]`
      — **`readBegin` tidak ada**: ia menuntut tabel sesi baca (waktu server) yang belum ada di skema; DDL-nya harus lewat jendela `0005` Claude Pro, bukan ditambahkan diam-diam. Dinyatakan sebagai gap, bukan diklaim selesai.
- [x] Kode hasil klaim yang konsisten: `CLAIMED`, `ALREADY_CLAIMED`, `NOT_ELIGIBLE`, `DWELL_TOO_SHORT` `[I-10b]`
      — `DWELL_TOO_SHORT` terdefinisi tetapi belum pernah terpicu: `claimReadSchema` sudah menolak < 30 detik sebelum handler berjalan.
- [x] `router/gamification.ts` berisi prosedur nyata (bukan stub); fixture tes (user, kuis lulus/gagal, program + order wakaf) `[I-10b]`

**Selasa — Backend**
- [x] Prosedur tersambung ke kernel asli `award()` / `settleUserPenalties()` `[I-10b]`
- [x] Hook +1000 di `router/auth.ts` saat daftar, kunci `register:{userId}` `[I-10b]`
      — ditulis **di dalam transaksi yang sama** dengan baris `users`, jadi "akun ada" dan "bonus ada" tidak pernah berbeda; diuji di `auth.test.ts`.
- [ ] Klaim baca: `readBegin` mencatat waktu **server**; `claimRead` ditolak bila selisih < 30 detik `[I-10b]`
      — **belum dikerjakan, dan tidak diklaim:** dwell masih dari klien. Menyelesaikannya butuh tabel sesi baca (DDL), lihat catatan `readBegin` di atas.
- [x] Klaim kuis hanya bila ada `quiz_attempts` lulus milik user; tes 401 anonim `[I-10b]`

**Rabu — Integrasi**
- [x] `POST /api/cron/streak` (`CRON_SECRET`, batch 500, cursor, aman diulang) memanggil fungsi yang sama dengan penyelesaian malas `[I-10b]`
      — `CRON_SECRET` ditambahkan ke `env/server.ts` (opsional) dan `.env.example`; tanpa secret yang benar rute menjawab 401 sebelum menyentuh DB.
- [x] Tes E2E prosedur yang dipakai `/poin` (Codex Awan) `[I-10b]`
      — 16 uji integrasi: D2 dari hook settlement, D6 (saldo 30 → 0, 10 hari → 7, potong sebelum tanggal daftar), check-in sekali per hari, 20 check-in paralel, riwayat + cursor, klaim kuis, gerbang cron.

**Defensif**
- [x] **Double-click di server:** klaim kedua mengembalikan `ALREADY_CLAIMED` dengan saldo terkini — **bukan error** — agar UI yang terlanjur mengirim dua kali tetap menampilkan hasil yang benar
- [ ] Waktu dwell tidak pernah diambil dari klien — **belum**, lihat butir `readBegin`
- [x] Cron tanpa `CRON_SECRET` yang benar → 401 tanpa menyentuh DB

---

### 🔵 Antigravity Naufal — `I-4`

**Senin — Kontrak**
- [x] `core/affiliate/code.ts`: kode referral opak acak (bukan turunan `USER_ID`), resolusi kode → user `[I-4]` · 🔎 _Audit 18-09:_ `core/affiliate/{code,get-or-create-code}.ts` — Claude Pro di lane Bara (PR #30)
- [ ] `hashClick(ip, userAgent, day)` = HMAC-SHA256 dengan `AFFILIATE_CLICK_SALT` + tanggal WIB (fungsi murni + tes) `[I-4]` · 🔎 _Audit 18-09:_ **PENDING** — tidak ada `hashClick` / `AFFILIATE_CLICK_SALT`
- [x] Aturan eligibilitas murni + tes berbasis tabel: self-referral, email/HP sama, akun anonim sistem, zakat & qurban, < Rp10.000, > 10 konversi/hari, > 1 per pasangan/24 jam; `min(100 + ⌊nominal/10.000⌋, 500)` `[I-4]` · 🔎 _Audit 18-09:_ `core/affiliate/eligibility.ts` + `tests/affiliate/eligibility.test.ts`
- [x] ≤ 10:00 kebutuhan DDL afiliasi · ≤ 11:30 stub `router/affiliate.ts` + `lib/affiliate/settle-hook.ts` `[I-4]` · 🔎 _Audit 18-09:_ tabel afiliasi di `0004`; `router/affiliate.ts`

**Selasa — Backend**
- [ ] `routes/r/$kode`: catat klik (dedup harian), set cookie `amwal_ref` httpOnly SameSite=Lax 30 hari **first-touch**, redirect 302 `[I-4]` · 🔎 _Audit 18-09:_ **SEBAGIAN** — cookie first-touch + 302 aman ✓ (`tests/routes/referral-redirect.test.ts`); klik **tidak dicatat** (`affiliate_clicks` tak pernah diisi → `totalClicks` selalu 0)
- [x] `recordAttribution(tx, …)` untuk dipanggil di `createPayment`; prosedur `affiliate.myCode` & `affiliate.stats` `[I-4]` · 🔎 _Audit 18-09:_ di dalam anchor `service.ts:256`; `affiliate.myCode`/`dashboard`; `tests/orpc/affiliate.test.ts`
- [ ] Settle-hook reward kunci `affiliate:{transactionId}`; tes seluruh penolakan eligibilitas di DB `[I-4]` · 🔎 _Audit 18-09:_ **PENDING** — reward belum dikreditkan saat LUNAS (potong scope #2)

**Rabu — Integrasi**
- [x] Dasbor referral `components/affiliate/**`: kode, salin tautan, konversi & poin, skeleton, empty state `[I-4]` · 🔎 _Audit 18-09:_ deviasi lokasi: `routes/afiliasi.tsx` (kode, salin tautan, skeleton, empty) + `tests/routes/afiliasi.test.tsx` — **Bara**
- [ ] Tes E2E: klik tautan → donasi wakaf → LUNAS → reward sekali; donasi zakat lewat tautan yang sama → tanpa reward `[I-4]` · 🔎 _Audit 18-09:_ **PENDING** — bergantung pada settle-hook reward

**Defensif**
- [x] **Open redirect:** `/r/$kode` hanya meneruskan ke path internal yang di-whitelist; kode tidak dikenal → beranda tanpa cookie · 🔎 _Audit 18-09:_ `SAFE_RELATIVE_PATH` di `lib/affiliate/referral-redirect.ts`
- [ ] Permintaan `HEAD`, prefetch (`Purpose: prefetch` / `Sec-Purpose`) dan user-agent bot tidak dicatat sebagai klik · 🔎 _Audit 18-09:_ **PENDING** — klik belum dicatat sama sekali
- [x] Cookie tidak ditimpa klik berikutnya (first-touch); klik **tidak pernah** memberi poin · 🔎 _Audit 18-09:_ `routes/r/$kode.ts:52`; klik tidak memberi poin
- [ ] Toast salin memakai `useToast()` global · 🔎 _Audit 18-09:_ belum terverifikasi (`afiliasi.tsx` memakai `navigator.clipboard`)

---

### 🟡 Claude Code Awan — `I-6` · penempatan `I-3`

**Senin — Kontrak**
- [x] ≤ 10:00 **inventaris redaksi akad yang sudah tampil di UI** (berkas, baris, teks persis per modul) → Claude Pro untuk seed versi 1; modul tanpa redaksi ditandai nonaktif `[I-6]`
- [x] `contracts/akad.ts`: modul, `publishVersion`, `activate`, input persetujuan (`templateId`, `version`, `bodySha256`) `[I-6]`
- [x] `sha256Body()` murni dengan normalisasi (`\r\n` → `\n`, trim) + tes `[I-6]`
- [x] ≤ 11:30 stub `router/akad.ts` & `router/admin/akad.ts` `[I-6]`

**Selasa — Backend**
- [x] `core/akad`: `getActive`, `publishVersion` (versi = max+1 dalam transaksi), `activate` (tukar versi aktif dalam satu transaksi), `recordAkadAcceptance(tx, …)` `[I-6]`
- [x] Prosedur `akad.active` & `admin.akad.*`; router `waqf/zakat/qurban/infaq.createOrder` menerima & meneruskan versi akad `[I-6]`
- [x] Tes: aktivasi versi baru tidak mengubah `body_sha256` persetujuan lama `[I-6]`

**Rabu — Integrasi**
- [x] Checkbox akad dinamis di form wakaf, zakat, infaq, qurban (teks dari `akad.active`) `[I-6]`
- [ ] Tempatkan komponen bagikan di halaman program wakaf/zakat/infaq/qurban `[I-3]` · 🔎 _Audit 18-09:_ **KOREKSI** — `ShareProgramButton` hanya dipakai `wakaf-share-button.tsx`; belum ada di zakat/infaq/qurban
- [x] UI admin akad: daftar versi, terbitkan, aktifkan dengan konfirmasi — *butir potong scope #5* `[I-6]`

**Defensif**
- [x] **Versi basi:** versi yang dikirim klien ≠ versi aktif → 409, form memuat ulang teks terbaru
- [x] Modul tanpa akad aktif → checkbox tidak tampil dan tidak diwajibkan (bukan form yang terkunci)
- [x] Tombol submit donasi dikunci selama permintaan berjalan (cegah order ganda)
- [x] Skeleton teks akad selama dimuat; checkbox tidak bisa dicentang sebelum teks tampil

---

### 🟡 Codex Awan — `I-5` · `I-3` (pustaka) · `I-10c` · `I-10b` (ambil alih) · riwayat

> **Status per 18 Sep 2026** (`codex/awan`, rebase di atas `sprint-11` @ `f1de5bd`).
> Rincian, bukti, dan berkas di luar matriks yang tersentuh: `docs/sprint-11/status/codex-awan.md`.
>
> | Tiket | Status | Catatan |
> |---|---|---|
> | `I-5` | ✅ **Selesai** | 18/18 uji hijau; PDF membuktikan `01 Oktober 2026, 00:30:00 WIB` untuk transaksi `2026-09-30 17:30 UTC` |
> | `I-3` | 🟡 **Pustaka selesai** | Penempatan di halaman zakat/infaq/qurban milik Claude Code Awan; wakaf sudah lewat pembungkus lama |
> | `I-10c` | ✅ **Selesai** | Saldo, rentetan, check-in, dan riwayat dibaca dari `gamification_point_ledgers` sungguhan; badge `PRATINJAU` **dicabut** |
> | `I-10b` | ✅ **Selesai (ambil alih)** | Enam prosedur nyata + `POST /api/cron/streak`; diambil alih lane ini atas persetujuan pemilik sprint karena `/poin` bergantung padanya. Rincian di §Codex Naufal |
> | `I-10` (kernel) | ✅ **Selesai (ambil alih)** | `award()`/`settleUserPenalties()` idempoten di `core/gamification/ledger.ts`; sisa yang tidak dikerjakan: notifikasi perolehan poin |

**Senin — Kontrak**
- [x] Generator sertifikat: `DD MMMM YYYY, HH:mm:ss WIB`; tes batas 00:30 WIB dan 23:59:59 WIB `[I-5]`
      — lewat `Intl` dengan `timeZone: 'Asia/Jakarta'` di `core/certificate/display.ts`, bukan `wibParts` (butuh nama bulan Indonesia). Timestamp Postgres tanpa offset dibaca sebagai UTC (`toInstant`), kalau tidak bug-nya hanya berpindah.
- [x] Kunci paritas layout dengan `amwalheti/lib/certificate-generator.ts` (tes teks halaman PDF) `[I-5]`
      — stream teks jsPDF tanpa kompresi dipakai sebagai jangkar: letterhead, judul, nomor, nominal, baris akad, blok tanda tangan, UU No. 41/2004, dan tanggal-jam WIB.
- [x] Basis QR dari `PUBLIC_APP_URL`; kontrak `certificate.verify`; `router/certificate.ts` `[I-5]`
      — kontrak sudah beku, jadi router langsung berisi prosedur nyata (bukan stub `NOT_IMPLEMENTED`). QR fail-closed: basis kosong/bukan http(s) → PDF tidak diterbitkan.

**Selasa — Backend**
- [x] Prosedur publik `certificate.verify({ nomor })`: nomor, status valid, jenis & judul program, tanggal-jam; nama disamarkan bila anonim; tanpa nominal `[I-5]`
      — **lebih ketat dari tiket:** nomor sertifikat berurutan sehingga halaman ini enumerable, jadi nama donatur non-anonim pun tampil sebagai **inisial**. Output tervalidasi Zod; uji membandingkan daftar kunci, bukan sekadar membaca kode.
- [x] Logika bagikan murni + tes: `buildShareMessage({ judul, deskripsi, url, refCode? })` — deskripsi dipangkas ≤ 160 karakter tanpa memotong kata, `?ref=` digabung dengan query yang sudah ada `[I-3]`
- [x] Serahkan `components/share/**` (8/8 uji murni) `[I-3]`
      — **deviasi:** `useShare()` tidak dibuat sebagai hook tersendiri; deteksi kemampuan browser ada di dalam `ShareProgramButton` (`navigator.share` **dan** `navigator.canShare(payload)`, plus `AbortError` yang tidak memicu fallback). Satu berkas lebih sedikit, perilakunya sama.

**Rabu — Integrasi**
- [x] Halaman `/verifikasi/$nomor`: valid, tidak valid, dan gagal memuat `[I-5]`
      — empat keadaan: memuat, sah, tidak sah, dan **nomor tidak ditemukan**; publik tanpa sesi, nominal tidak pernah dirender.
- [x] Komponen bagikan final + ganti isi `wakaf-share-button.tsx` agar memakai pustaka baru `[I-3]`
- [x] `/poin`: saldo, riwayat, tombol check-in dari **data riil**; hapus pemakaian `GamificationScaffold` ≤ 12:00 `[I-10c]`
      — selesai setelah `I-10b` mendarat: layar membaca `gamification.summary`/`history`/`checkIn` sungguhan, cast sementara di `points-api.ts` dihapus, tipe respons di-`infer` dari kontrak, cabang "belum tersedia" dibuang, dan badge `PRATINJAU` **dicabut**.
- [x] Riwayat transaksi `components/history/**`: skeleton, empty, error + coba lagi `[I-10c]`
      — daftar memakai skeleton kartu (tinggi baris diketahui, tidak ada lompatan layout saat data tiba); detail memakai skeleton blok dan kini punya tombol **Coba lagi** pada keadaan error. **Catatan kepemilikan:** `components/history/**` tidak terdaftar di matriks §3 mana pun — butir ini dikerjakan karena backlog menugaskannya ke lane ini; mohon dikonfirmasi di jendela merge.

**Defensif**
- [x] **Web Share API:** dipakai hanya bila `navigator.share` dan `navigator.canShare` tersedia; `AbortError` (pengguna membatalkan) **tidak** memicu fallback maupun toast error
- [x] **Fallback desktop:** salin pesan + tautan ke clipboard → toast global "Pesan & tautan disalin"; bila Clipboard API tidak tersedia atau ditolak (bukan secure context) → modal berisi teks yang bisa disalin manual
- [ ] **Check-in:** tombol dinonaktifkan selama request berjalan + debounce; respons `ALREADY_CLAIMED` ditampilkan sebagai "Sudah check-in hari ini", bukan error
      — selesai: tombol terkunci selama request, debounce 700 ms (`Date.now()` + `useRef`), dan server mengembalikan `awarded: false` (klaim ulang) yang dirender sebagai "Hari ini sudah pernah check-in" — bukan error. Dibuktikan 20 check-in paralel → **tepat satu baris ledger**.
- [x] Nomor sertifikat berurutan (`CERT-AMW-YYYY-NNNN`) mudah dienumerasi → halaman verifikasi hanya menampilkan inisial nama; catat risiko ini untuk audit Kamis
- [x] Skeleton untuk saldo poin dan list riwayat

**Bukti eksekusi**
- `packages/core`: **149 pass / 0 fail** (21 berkas) · `apps/web`: **185 pass / 0 fail** (32 berkas) di `amwal_bun_s11_codex_awan_test`.
- `check-types` 3/3 hijau · `biome check` bersih · `vite build` (SSR + klien) sukses · `routeTree.gen.ts` diregenerasi memuat `/verifikasi/$nomor` dan `/api/cron/streak`.
- Uji baru: `apps/web/tests/orpc/gamification.test.ts` (16 uji: D2 dari hook settlement, D6, check-in, 20 paralel, riwayat+cursor, klaim kuis, gerbang cron) dan `packages/core/tests/gamification/ledger-pure.test.ts` (10 uji murni).
- **Berkas milik agent lain yang tersentuh (aditif, minta dicatat di jendela merge):** `apps/web/src/env/server.ts` (+`PUBLIC_APP_URL`, +`CRON_SECRET`), `apps/web/src/lib/orpc/router/index.ts` (+`certificate`), `apps/web/src/routes/api/certificates.$id.ts` (satu argumen), `packages/core/package.json` (+`./gamification/ledger`), `packages/core/src/time/wib.ts` (+`parseInstant`/`toWibDate`), slot `onSettled` di `apps/web/src/routes/api/webhooks/payment.ts`, `apps/web/.env.example` (dokumentasi `CRON_SECRET`), dan `apps/web/tests/orpc/auth.test.ts` (cleanup ledger + asersi bonus pendaftaran).
- **Gap yang dinyatakan:** verifikasi dwell sisi server (`readBegin`) belum ada — menuntut tabel sesi baca (DDL jendela `0005`); notifikasi perolehan poin (`I-10` Rabu) tidak dikerjakan.

---

### 🟡 Antigravity Awan — `I-9` · UI klaim konten · penutupan stub

**Senin — Kontrak**
- [x] `contracts/cms.ts`: create/update/publish admin, list/detail publik berpaginasi, status `DRAFT | PUBLISHED | ARCHIVED` `[I-9]`
- [x] `slugify()` murni (transliterasi, sufiks unik) dan sanitizer isi artikel (Markdown → HTML aman) + tes XSS `[I-9]`
- [x] ≤ 10:00 kebutuhan DDL kolom CMS · ≤ 11:30 stub `router/cms.ts` & `router/admin/cms.ts` `[I-9]`
- [x] **Inventaris Tier C — tanpa menghapus apa pun:** konsumen tiap export `components/tier-c/tier-c-scaffolds.tsx` dan urutan pencabutannya, ditulis di berkas status `[I-9]`

**Selasa — Backend**
- [x] Prosedur admin: draft → terbit (`published_at` diset saat terbit), slug bentrok → sufiks, arsip `[I-9]`
- [x] Prosedur publik hanya mengembalikan `PUBLISHED`, paginasi cursor `[I-9]`
- [x] Tes: draft tidak terlihat publik, payload XSS tersanitasi, slug bentrok, non-ADMIN → 403 `[I-9]`

**Rabu — Integrasi**
- [x] Editor admin (form, pratinjau, konfirmasi terbit) di `news` / `education-management-view` `[I-9]`
- [ ] Halaman `/berita` dan `/edukasi`: list + detail, skeleton, empty state, slug tidak dikenal → 404 `[I-9]` · 🔎 _Audit 18-09:_ **KOREKSI** — list memakai `orpc.cms.list` ✓, tetapi `/berita` tanpa rute detail dan `/edukasi/$slug` merender artikel 8 Asnaf statis **tanpa membaca slug** (slug tak dikenal tidak 404)
- [ ] Tombol klaim baca (aktif setelah 30 detik) dan klaim kuis bila konten punya kuis `[I-10b]` · 🔎 _Audit 18-09:_ **KOREKSI** — tidak ada pemanggilan `claimRead`/`claimQuiz` di `components/`/`routes/`
- [x] Cabut `NewsScaffold` & `EducationScaffold` setelah halaman baru ter-merge; `GamificationScaffold` hanya setelah `/poin` Codex Awan ter-merge (16:30); `AskAiScaffold` **tetap** `[I-9]`
- [x] Setelah gate 17:00: `STATUS.md` dan `docs/DECISION_LOG.md` Putaran 18 dari hasil gate `[I-9]`

**Defensif**
- [x] **Klaim kuis & baca:** tombol dinonaktifkan selama request + debounce; `ALREADY_CLAIMED` ditampilkan sebagai status, bukan error
- [x] UI pengerjaan kuis penuh **di luar lingkup Sprint 11** — tombol klaim kuis hanya tampil bila ada percobaan lulus
- [x] Isi artikel tidak pernah dirender lewat `dangerouslySetInnerHTML` tanpa sanitizer
- [x] Tidak ada export Tier C yang dicabut sebelum konsumen terakhirnya pindah

---

## S11.5 Matriks tugas harian

Setiap dev manusia menyalin tiga baris agent-nya setiap pagi. Rincian dan checklist defensif ada di §S11.4.

| Agent | Tugas Senin | Tugas Selasa | Tugas Rabu |
|---|---|---|---|
| **Claude Pro** | `0004` + seed ≤ 12:00 · index concurrently `[S-3]` · `components/ui/skeleton.tsx` · mount router, RBAC, env, export, sidebar · `PaymentProvider` v2 & kontrak beku ≤ 13:00 · gate 17:00 | `webhook.ts` agnostik provider · `applyProviderEvent()` · jendela `0005` 12:00 · review PR Zone 0 | Review & merge · audit kepemilikan diff · semua gate · freeze 17:00 · PR `sprint-11 → main` 18:00 |
| **Claude Code Bara** | `wibParts()` beku ≤ 10:00 · regex & formatter ID v2, kode 85/80, sub-program `'00'` · counter atomik (20 paralel, ke-10.000 ditolak) · spike sandbox Mayar `[I-1][I-11]` | ID v2 di `createPayment` · `moduleFromOrderId` dua format · Midtrans/Mock ke v2 · adapter Mayar + re-fetch dengan timeout & retry · keputusan Mayar 13:00 `[I-1][I-11]` | Panggil pencatat akad & atribusi di transaksi anchor · job rekonsiliasi PENDING · simulator ID v2 · tes negatif & E2E sandbox `[I-11]` |
| **Codex Bara** | `core/analytics/period.ts` WIB · agregasi murni seri/akumulasi/komposisi · kontrak & stub `admin.analytics` `[I-7][I-8]` | Prosedur `admin.analytics.*` · filter tahun zakat & qurban, bulan+tahun infaq/sedekah · tes batas & 403 `[I-7][I-8]` | Tiga grafik `recharts` · integrasi overview & ziswaf · filter di URL · skeleton, empty, error `[I-7][I-8]` |
| **Antigravity Bara** | Helper storage fail-closed · object key & deteksi magic bytes · upload nyata ke bucket privat · DDL lampiran ≤ 10:00 `[S-2]` | Rute upload ADMIN · batas 5 MB saat streaming · kuitansi wajib foto · filter bulan+tahun wakaf · tes negatif `[I-2][I-8]` | UI audit kuitansi (dropzone, pratinjau, pesan penolakan) · filter wakaf · skeleton · refresh signed URL `[I-2]` |
| **Claude Code Naufal** | `transactionPoints()` (D2) · `penaltyPlan()` (D6) · kunci idempotensi · property test · DDL ≤ 10:00 · stub settle-hook `[I-10]` | `award()` idempoten · `settlePenalties()` advisory lock · settle-hook D2 · tes DB D2/D6 · kernel siap 12:00 `[I-10]` | Notifikasi poin & penalti · uji 20 check-in paralel · settle 500 user · tes `pankop` tetap hijau `[I-10][S-1]` |
| **Codex Naufal** | Kontrak Zod klaim & check-in · kode hasil klaim · stub `router/gamification.ts` · fixture `[I-10b]` | Prosedur di atas kernel · +1000 saat daftar · `readBegin`/`claimRead` waktu server · klaim kuis · tes 401 `[I-10b]` | `POST /api/cron/streak` · E2E prosedur untuk `/poin` & klaim konten · `ALREADY_CLAIMED` bukan error `[I-10b]` |
| **Antigravity Naufal** | Kode referral opak · `hashClick` HMAC harian · aturan eligibilitas murni + tes tabel · DDL & stub ≤ 11:30 `[I-4]` | `/r/$kode` cookie first-touch · `recordAttribution()` · `affiliate.myCode/stats` · settle-hook reward · tes penolakan `[I-4]` | Dasbor referral · E2E klik → donasi → reward · tahan open redirect & prefetch/bot `[I-4]` |
| **Claude Code Awan** | Inventaris redaksi akad UI ≤ 10:00 · kontrak akad · `sha256Body()` · stub router akad `[I-6]` | `core/akad` publish/activate/record · prosedur publik & admin · `createOrder` meneruskan versi akad · tes `body_sha256` `[I-6]` | Checkbox akad di 4 form · tempatkan tombol bagikan · UI admin akad · 409 versi basi · kunci submit ganda `[I-6][I-3]` |
| **Codex Awan** | Sertifikat `HH:mm:ss WIB` + tes batas · paritas layout · QR dari `PUBLIC_APP_URL` · `router/certificate.ts` `[I-5]` | `certificate.verify` data minimal · `buildShareMessage()` (tanpa hook `useShare`) · serahkan `components/share` `[I-5][I-3]` | `/verifikasi/$nomor` · komponen bagikan + fallback clipboard/toast · `/poin` + check-in anti double-click · skeleton riwayat `[I-5][I-3][I-10c]` · **mengambil alih `I-10b` + kernel `I-10`** (gamifikasi end-to-end, badge `PRATINJAU` dicabut) `[I-10b]` |
| **Antigravity Awan** | Kontrak CMS · `slugify()` & sanitizer + tes XSS · DDL & stub ≤ 11:30 · inventaris Tier C **tanpa hapus** `[I-9]` | Prosedur admin draft → terbit · prosedur publik `PUBLISHED` · tes draft, XSS, slug, 403 `[I-9]` | Editor admin · `/berita` & `/edukasi` · tombol klaim baca/kuis anti double-click · cabut scaffold berurutan · `STATUS.md` & `DECISION_LOG` `[I-9]` |

### Peta tiket → pemilik

| Tiket | Judul | Pemilik | Status (audit 18-09) |
|---|---|---|---|
| `S-1` | Fitur `pankop` di atas monolit | Claude Code Naufal | ✅ Sudah |
| `S-2` | Fondasi Storage privat | Antigravity Bara | ✅ Selesai (backend) — upload nyata ke bucket belum terbukti |
| `S-3` | Index kolom waktu | Claude Pro | ⏳ **PENDING** — index `CONCURRENTLY` belum ada |
| `I-1` | ID transaksi 12 digit | Claude Code Bara | ✅ Selesai — Bara |
| `I-10` | Kernel ledger poin | Claude Code Naufal → **diambil alih Codex Awan** | ✅ Selesai |
| `I-11` | Adapter Mayar + rekonsiliasi | Claude Code Bara · Claude Pro | ✅ Selesai (sandbox) — Bara · Claude Pro (PR #30) |
| `I-2` | Kuitansi + foto wajib | Antigravity Bara | 🟡 Backend ✅ · UI dropzone belum di-mount · tanpa OCR |
| `I-3` | Tombol bagikan | Codex Awan · Claude Code Awan | 🟡 Pustaka ✅ · penempatan hanya wakaf |
| `I-4` | Afiliasi + anti-abuse | Antigravity Naufal | 🟡 Atribusi + dasbor ✅ · klik & reward PENDING |
| `I-5` | Sertifikat & verifikasi | Codex Awan | ✅ Selesai — Codex Awan (PR #31) |
| `I-6` | Template akad dinamis | Claude Code Awan | ✅ Selesai (Rabu) — catatan: persetujuan dicatat di luar transaksi anchor |
| `I-7` | Grafik admin | Codex Bara | 🟡 Backend ✅ · grafik UI PENDING |
| `I-8` | Filter waktu | Codex Bara · Antigravity Bara | 🟡 Backend ✅ · filter UI/URL PENDING |
| `I-9` | CMS artikel & berita | Antigravity Awan | 🟡 CMS admin + list ✅ · detail per-slug PENDING |
| `I-10b` | Prosedur gamifikasi & sweep | Codex Naufal → **diambil alih Codex Awan** | ✅ Selesai |
| `I-10c` | UI poin & check-in | Codex Awan | ✅ Selesai — Codex Awan |

> **Catatan status — lane Awan (Codex), 18 Sep 2026:** `I-5` **selesai** · `I-3` **pustaka selesai**
> (penempatan di halaman zakat/infaq/qurban menunggu Claude Code Awan) · `I-10c` **selesai dengan data
> riil** — `I-10b` (prosedur gamifikasi, Codex Naufal) **diambil alih lane ini atas persetujuan pemilik
> sprint**, sehingga badge `PRATINJAU` sudah dicabut dari `/poin` dan layar membaca
> `gamification_point_ledgers` sungguhan. Rincian & bukti: `docs/sprint-11/status/codex-awan.md`.

**Dikeluarkan:** Portal Nadzir (Tier C) → Sprint 12 · Analitik RFMD/segmentasi → pasca-MVP.

> **Catatan PR #17 (`pankop → main`):** berisi tepat 18 commit `pankop` dengan head `9e7de80`,
> tanpa pekerjaan baru. Journal-nya masih mereferensikan `0003_sharp_silver_sable` **tanpa** berkas
> SQL maupun snapshot, sehingga merge apa adanya akan memasang migrasi rusak di `main`. Seluruh isinya
> sudah ada di `sprint-11` beserta perbaikan `7db0c67`. **Jangan di-merge apa adanya.**

---

## S11.6 Gate harian (17:00 WIB)

| Hari | Gate | Jika gagal |
|---|---|---|
| **Senin** | `0004` bersih di DB kosong & salinan staging · `check-types` 3/3 · `biome check` bersih · semua tes lama hijau · setiap router baru menjawab `NOT_IMPLEMENTED` · tes matriks RBAC hijau · 20 order paralel → 20 nomor unik · nomor ke-10.000 ditolak · satu berkas terbaca dari bucket privat | Selasa pagi hanya untuk fondasi |
| **Selasa** | Kriteria `I-10` (D2, D6) lulus · penolakan afiliasi lulus · sertifikat 00:30 WIB benar · `body_sha256` persetujuan lama tidak berubah · tes idempotensi webhook lama hijau tanpa diubah · keputusan Mayar tercatat | Potong scope butir 1–2 sebelum Rabu 09:00 |
| **Rabu** | **Code freeze.** Semua fitur didemokan end-to-end dengan akun `db:seed` & data riil · seluruh tes hijau di DB Claude Pro · tidak ada berkas di luar matriks kepemilikan · `STATUS.md` mencerminkan hasil gate | Item belum lulus dicatat "Pending"; tidak ada perpanjangan ke Kamis |

**Urutan potong scope:** (1) poin tonton video → (2) reward afiliasi (atribusi tetap) → (3) grafik di luar tiga grafik inti → (4) Mayar produksi (sandbox tetap, Midtrans jalur demo) → (5) UI admin akad (prosedur & seed tetap).

### Kamis — audit manusia (tanpa agent)

- [ ] Audit Zone 0 (`webhook.ts`, `types.ts`, `order-id.ts`, `service.ts`, `0004`) — **Bara**
- [ ] Audit poin, afiliasi, akad — **Naufal**
- [ ] Audit CMS, sertifikat, halaman verifikasi, a11y halaman publik — **Awan**
- [ ] E2E: donasi wakaf via Mayar sandbox → LUNAS → poin → sertifikat `HH:mm:ss WIB` → QR membuka `/verifikasi/$nomor`
- [ ] E2E: kuitansi tanpa foto ditolak; dengan foto tersimpan di bucket privat
- [ ] E2E: versi akad baru tidak mengubah persetujuan lama
- [ ] Load test: 50 order paralel pada cakupan ID sama → tanpa duplikat & tanpa deadlock
- [ ] Deploy `sprint-11` ke staging · `0004` + index concurrently · smoke test
- [ ] PR `sprint-11 → main` di-merge hanya bila semua butir di atas lulus

---

## Sprint 11.1 — Konsolidasi & remediasi (audit 18 Sep 2026)

**Basis audit:** `sprint-11` HEAD `b1e440f` (= `bara`), PR #30 ter-merge; PR Awan #27 (CMS), #31 (sertifikat &
gamifikasi), #32 (akad) utuh. **Auditor:** Claude Pro (lead architect & release auditor).

### Gate teknis (dijalankan ulang 18-09)

| Gate | Hasil | Catatan |
|---|---|---|
| `bun run check-types` | ✅ 3/3 | |
| `packages/core` `bun test` | ✅ 158/158 (22 berkas) | |
| `apps/web` `bun test` | ✅ 258/258 (45 berkas) | DB `amwal_bun_bara_test` (guard pola lulus) |
| **Total** | ✅ **416/416 (67 berkas)** | klaim tim terverifikasi |
| `biome check` | ✅ 0 error pada ekspor LF | di working tree Windows (`core.autocrlf=true`) muncul 189 diagnostik **format CRLF** saja — rekomendasi: tambah `.gitattributes` `* text=auto eol=lf` |

### Rincian tiket

#### `I-1` — ID transaksi 12 digit · **Bara** · ✅ SELESAI
- [x] Format kanonik **numerik 12 digit** `MM BB YY SS NNNN`, mis. `600926000001` (modul 60 Wakaf · 70 Zakat · 80 Infaq · 85 Sedekah · 90 Qurban) — `packages/core/src/payment/order-id.ts`
- [x] Counter atomik `nextOrderSequence` di transaksi anchor; habis → `ORDER_SEQUENCE_EXHAUSTED` — `order-sequence.ts`
- [x] Format lama `AMW-…`/`INF-…` tetap dikenali — `moduleFromOrderId()`
- [x] Tes: `tests/order-id-v2.test.ts`, `tests/order-sequence.test.ts`, `tests/time-wib.test.ts`
- 🔎 **Koreksi klaim:** tidak ada format alfanumerik `MW-XXXX-XXXX-XX` di kode mana pun; yang diimplementasikan (dan diuji) adalah 12 digit numerik sesuai PLAN.

#### `I-11` — Adapter Mayar v2 + rekonsiliasi · **Bara** (adapter) · **Claude Pro di lane Bara** (cron, PR #30) · ✅ SELESAI (sandbox)
- [x] Webhook defensif: token constant-time → hanya `payment.received` → **re-fetch** → status & nominal dari re-fetch → nominal ≠ anchor ditolak — `payment/mayar.provider.ts`
- [x] Timeout per percobaan, retry 2× (500/1000 ms) hanya untuk jaringan/5xx; timeout → 504, **tidak pernah** GAGAL
- [x] `POST /api/cron/payments-reconcile` — Bearer `CRON_SECRET` dibandingkan `timingSafeEqual`; memakai `applyProviderEvent` yang sama dengan webhook — `routes/api/cron/payments-reconcile.ts`, `core/payment/reconciliation.ts`
- [x] `/dev/payment-simulator` menerima ID v2 dan legacy
- [x] Tes: `tests/payment/mayar-provider.test.ts`, `apps/web/tests/orpc/{mayar-webhook,payments-reconcile,payment-simulator}.test.ts`
- [ ] E2E sandbox Mayar → LUNAS terekam sebagai bukti gate
- 🔎 Catatan: `CRON_SECRET` di skema env kini opsional (cron menolak bila tidak diset — fail-closed tetap terjaga).

#### `I-2` — Kuitansi + foto wajib · **Antigravity Bara** (backend) · **Bara** (dropzone, 11.1) · 🟡 SEBAGIAN
- [x] Upload ADMIN, batas 5 MB saat streaming, magic bytes, key `ulid`, kompensasi objek yatim — `routes/api/uploads/receipts.ts`, `tests/orpc/receipts-upload.test.ts`
- [x] `admin.waqf.addProgress` mewajibkan bukti foto
- [x] Komponen mandiri `apps/web/src/components/receipts/{receipt-dropzone.tsx,types.ts,index.ts}` + `tests/components/receipt-dropzone.test.tsx`
- [ ] Dropzone **di-mount** pada halaman admin (saat ini tidak diimpor halaman mana pun)
- [ ] **OCR** — tidak ada implementasi; hanya teks "(tanpa OCR)" di `approvals-view.tsx` dan subjudul sidebar
- [ ] Refresh signed URL otomatis & skeleton daftar kuitansi

#### `I-9` — CMS edukasi & berita · **Antigravity Awan** (CMS, PR #27) · **Bara** (halaman edukasi 1:1 Figma) · 🟡 SEBAGIAN
- [x] CRUD admin draft → terbit → arsip, slug unik, sanitizer XSS — `router/admin/cms.ts`, `components/admin/{education,news}-management-view.tsx`, `components/admin/sanitize-rich-html.ts` + `tests/sanitize-rich-html.test.ts`
- [x] List publik `/edukasi` & `/berita` dari `orpc.cms.list`
- [x] Detail edukasi 1:1 Figma: 3 slide artikel 8 Asnaf (`ARTICLE_PAGES = [[1,2],[3,4,5,6],[7,8]]`) — `components/education/education-detail.tsx` (commit `4af14e3`)
- [ ] `/edukasi/$slug` membaca slug dan menampilkan artikel CMS; slug tak dikenal → 404 (saat ini semua slug merender konten statis yang sama)
- [ ] Rute detail `/berita/$slug`

#### `I-10b` — Kuis & XP Berkah · **Codex Awan** (prosedur, PR #31) · **Bara** (UI kuis) · 🟡 SEBAGIAN
- [x] Prosedur gamifikasi nyata (`checkIn`, `summary`, `history`, `claim*`), cron streak, `/poin` data riil — Codex Awan
- [x] UI kuis 5 soal, evaluasi real-time, lulus ≥ 80 % — `education-detail.tsx` (`QUIZ_QUESTIONS`, `percentage >= 80`)
- [ ] Perpindahan ke tab kuis **otomatis** (saat ini tombol "Mulai Kuis" / `onStartQuiz`)
- [ ] **XP Berkah benar-benar dikreditkan** — "+100 XP" hanya tampilan; kuis dinilai di klien, tidak menulis `quiz_attempts`, sehingga `gamification.claimQuiz` tidak pernah bisa lolos
- [ ] `readBegin` waktu server untuk klaim baca

#### `S-4` — Gateway WhatsApp Baileys · **Bara** · 🟡 FUNGSIONAL — ⛔ **BLOCKER KEAMANAN**
- [x] Microservice `apps/wa-bot` (Hono + Baileys) di port `3005`, diakses `apps/web` lewat `/api/wa/*` — `apps/web/src/lib/orpc/router/admin/{wa,settings}.ts`
- [x] Pairing QR dinamis di `/admin/pengaturan` + fallback lokal zero-config
- [x] Kuitansi WA otomatis saat PAID/SETTLED dari webhook & simulator — `core/whatsapp/{notify,service,templates}.ts`, `routes/api/{webhooks/payment,dev/mock-webhook}.ts`; `tests/orpc/wa-gateway.test.ts` (commit `860d4b2`)
- 🔎 **Koreksi klaim "non-blocking":** `onSettled` meng-`await` notifikasi WA secara berurutan dalam try/catch — **terisolasi dari kegagalan** (webhook tetap 200), tetapi latensi WA menambah waktu respons webhook.
- [ ] **Perbaiki autentikasi `apps/wa-bot/src/index.ts` `isAuthorized` (wajib sebelum produksi):**
  - bypass `localhost` berbasis header `Host` berlaku **juga di produksi** (Host bisa dipalsukan);
  - secret hardcoded `amwal-dev-wa-secret` & `rahasia-amwal-internal` **selalu diterima**;
  - secret masuk log plaintext (`console.log('[WA-BOT AUTH]', …)`);
  - `apps/web` `env/server.ts` memberi default `INTERNAL_SECRET` → fail-fast hilang (regresi `S10-N-01` / AMW-02).

### Temuan lintas tiket (di luar 6 tiket 11.1)

| Tiket | Temuan | Tindak lanjut |
|---|---|---|
| `S-3` | Index `CONCURRENTLY` belum ada | kerjakan sebelum deploy produksi |
| `I-3` | Tombol bagikan hanya di wakaf | pasang di zakat/infaq/qurban |
| `I-4` | Klik tidak dicatat, reward tidak dikreditkan | `hashClick` + settle-hook reward |
| `I-6` | `recordAkadAcceptance` di luar transaksi anchor | pindahkan ke dalam `createPayment` |
| `I-7`/`I-8` | Grafik & filter periode UI hilang setelah restorasi 1:1 PR-28 | sambungkan `admin.analytics` + search params |

*Sprint 11 — disusun 14 September 2026. Rencana lengkap, kepemilikan berkas, dan desain teknis: `docs/sprint-11/PLAN.md`.*

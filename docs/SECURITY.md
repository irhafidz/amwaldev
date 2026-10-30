# SECURITY.md — Non-Negotiable Invariants

Every item here is mandatory. Code that violates one — written by a human or an AI agent —
is a **critical bug**, not a nice-to-have.

Each invariant carries the finding ID from the Baseline Audit that produced it, so nobody
has to guess why the rule exists.

---

## 1. Configuration — Fail Loud, Never Fall Back

> **Origin: AMW-08.** The legacy repo had four `process.env.X || 'hardcoded-literal'`
> fallbacks. Worse, `ENCRYPTION_KEY` was never defined anywhere, so citizen ID numbers were
> encrypted with a key derived from `JWT_SECRET` — meaning a routine JWT secret rotation
> would have made every stored NIK permanently undecryptable.

- [ ] `env.ts` is the **only** file that reads `process.env`
- [ ] A missing or too-short variable **kills the process at boot**, naming the variable
- [ ] `ENCRYPTION_KEY` is defined, ≥32 chars, **independent of `JWT_SECRET`**, and documented
      in `RUNBOOK.md`
- [ ] No literal fallback secret exists anywhere in the repository
- [ ] CI check: `grep -rn "process.env" src/ | grep -v "env.ts"` returns nothing

---

## 2. Auth & Session

> The legacy implementation was audited and found **correct**. Port it; do not redesign it.

- [ ] Access token: JWT in an `httpOnly` cookie, 3-hour lifetime (raised from 20 minutes, QA Test#1), payload carries
      `{ userId, role }`
- [ ] Refresh token: separate `httpOnly` cookie; only its **hash** is stored in
      `refresh_tokens`
- [ ] Refresh tokens **rotate**: every use sets `revoked_at` on the old one and issues a new pair
- [ ] Reuse of an already-revoked token → **revoke every refresh token for that user**
      (theft mitigation)
- [ ] Cookies: `httpOnly` + `sameSite=lax` + `secure` in production
- [ ] No token in `localStorage`, `sessionStorage`, or a response body — ever
- [ ] Google OAuth exchanges the Google ID token for **our own** JWT+refresh. No third-party
      session library runs in parallel (PRD §4.5)
- [ ] OAuth CSRF `state` validation is always active; no mock path is reachable in production

---

## 3. RBAC — Structural, Not a List

> **Origin: AMW-03 and AMW-07.** The legacy proxy guarded the prefix `/backoffice` while the
> real URLs were `/admin` — a separate list that silently stopped matching. The layout then
> defaulted to `role = session?.role || 'ADMIN'`, rendering the admin shell to anonymous
> visitors. Separately, `/api/admin` admitted `PETUGAS_LAPANGAN`, letting a field officer
> overwrite the gold price that sets everyone's nisab.

- [ ] Middleware attaches at the **router mount point**, never via a separate path list
- [ ] `rbac.matrix.ts` is the single source of truth; a test asserts every mounted route is
      covered by it
- [ ] `PETUGAS_LAPANGAN` has **no access** to `/api/admin`
- [ ] Inside protected handlers `c.get('user')` is typed `SessionUser`, never `| null`
- [ ] **No `|| 'ADMIN'` or equivalent default-role fallback exists anywhere**
- [ ] Client-side guards are UX only. The server is always the authority
- [ ] Verification: 4 roles × every namespace, results matching `rbac.matrix.ts`

---

## 4. Payments

> **Origin: AMW-04 and AMW-12.** The legacy repo had no outbound payment call at all, only
> Waqf created a `Transaction` row, and four webhook handlers coexisted with three different
> signature implementations.

- [ ] Order row and `Transaction` row are created in **one database transaction, before**
      the payment provider is called. A webhook can never arrive without an anchor
- [ ] Exactly **one** webhook endpoint: `POST /api/webhooks/payment`
- [ ] Signature verified **before any query runs**; invalid → `403` with zero mutation
- [ ] Signature comparison uses a **constant-time** compare, not `===`
- [ ] Idempotency is a **conditional `UPDATE` inside the transaction**, never a status read
      taken beforehand:
      `UPDATE transactions SET status='LUNAS' WHERE id=$1 AND status<>'LUNAS' RETURNING *`
- [ ] Verified by a **parallel** test: 10 simultaneous identical webhooks → ledger
      increments exactly once
- [ ] `disbursement_destination` is populated on every `transactions` row
- [ ] WhatsApp dispatch happens **outside** the database transaction, best-effort, 5-second
      timeout. Its failure never rolls back a settlement
- [ ] `MOCK_SANDBOX` provider **refuses to start** when `NODE_ENV=production`

---

## 5. Fiqh Invariants (Enforced in Code, Not Only in Documentation)

- [ ] For `jenis_wakaf = PRODUKTIF_KEKAL`, `pokok_dana_terkumpul` **never decreases** by any
      code path. Verified by a property test over arbitrary operation sequences, not a
      single unit test
- [ ] Withdrawal branches explicitly: `HABIS_PAKAI` decrements principal;
      `PRODUKTIF_KEKAL` decrements `total_hasil_available` and increments
      `hasil_investasi_tersalurkan`
- [ ] No withdrawal can produce a negative balance
- [ ] Qurban slots require **both** `SELECT ... FOR UPDATE` and the unique constraint
      `(hewan_batch_id, nomor_slot)`. Verified by a concurrency test
- [ ] Qurban orders reject with `400` unless `akad_wakalah_accepted_at` is set **before**
      payment is processed
- [ ] Zakat nisab uses 85 g of gold and a 2.5% rate from named constants; zakat fitrah reads
      `zakat_fitrah_config`. No hardcoded figures anywhere
- [ ] No fund disbursement or Nadzir legality approval completes without a human ADMIN
      filling `approved_by_id` / `verified_by_*_id`

---

## 6. Sensitive Data

- [ ] `nadzir_documents.ocr_extracted_nik` and `mustahiq_profiles.nik` are AES-256 encrypted
      at rest. A raw `SELECT` shows no readable NIK
- [ ] Raw KTP image files are deleted 30 days after verification (Putaran 2 #2), enforced by
      a scheduled job — not by intention
- [ ] Mustahik data is **never** publicly exposed. Recipient lists are internal audit only
- [ ] Anonymous donations (`is_anonymous = true`) hide the donor from public views while
      preserving full identity in the internal audit trail
- [ ] Guest matching is restricted to `passwordHash IS NULL AND oauthProvider IS NULL`.
      A guest email colliding with a registered account is isolated into a new guest account,
      never merged (Putaran 8 #3 — account-hijacking mitigation)

---

## 7. Internal Services

> **Origin: AMW-02.** The Baileys service authenticated only `POST /send-message`.
> `GET /qr` and `GET /status` were open, with `cors()` accepting every origin. Anyone who
> found the Railway URL could scan that QR and take over the institution's WhatsApp sender.

- [ ] The Baileys container publishes **no port**; it is reachable only on the internal
      Docker network
- [ ] The secret-header middleware is **global, registered before every route**, so routes
      added later are protected by default rather than by remembering
- [ ] `cors({ origin: [...] })` with an explicit allow-list. Never bare `cors()`
- [ ] The admin QR panel proxies through the Bun API server-side; the browser never holds
      the internal secret

---

## 8. LLM Endpoints

> **Origin: AMW-06.** `POST /api/gemini/analyze` forwarded arbitrary prompts using the
> project API key with no session check at all, and was not in any middleware matcher.

- [ ] Every LLM endpoint requires authentication
- [ ] Every LLM endpoint has a per-user rate limit
- [ ] API keys are server-side only. `grep -rn "DEEPSEEK\|GEMINI" src/client/` returns nothing
- [ ] Ask-AI responses carry a visible disclaimer: not a fatwa

---

## 9. Database Co-existence

> The frozen Next.js app reads the same Supabase database. See `../db/MIGRATION_RULES.md`.

- [ ] Migrations are additive only: no `DROP`, `RENAME`, narrowing `ALTER TYPE`, or
      `SET NOT NULL`
- [ ] No `prisma migrate` / `db push` is ever run from the legacy repo — Prisma treats the
      Drizzle tables as drift and offers to drop them
- [ ] No rows are written using enum values the legacy Prisma client does not know; doing so
      makes the legacy app throw on read
- [ ] Pre-commit hook rejects destructive SQL; CI runs `drizzle-kit check`

---

## 10. Public Endpoint Exposure

- [ ] `POST /api/wakaf/orders` accepts guest checkout without a token — this is intentional
      (Putaran 8 #6) and therefore **requires** IP-based rate limiting before staging
- [ ] Zakat and Qurban order endpoints stay strictly authenticated (`401` for guests) —
      nisab data, asnaf records, shohibul qurban identity, and the binding wakalah contract
      all demand an identified user (Putaran 8 #2)

---

## Verification Schedule

Section 3 (RBAC matrix), section 4 (parallel idempotency), and section 5 (fiqh property
tests) run in **CI on every pull request**. They are not a pre-release checklist — the
legacy project had a pre-release checklist and it was ticked without being executed.

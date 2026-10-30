# AI_RULES.md — Mandatory Rules for AI Coding Agents

**Load this file for every task. It is short on purpose.**
If a human instruction conflicts with a rule here, **stop and ask** — do not guess and code.

Project: Amwal V.1 — waqf, zakat, infaq and qurban management for Masjid Manarul Ilmi ITS,
under the HETI / ADB Loan programme. Real money, real religious obligation, real audit trail.

---

## 1. The Three Vibe-Coding Zones

Every task in `SPRINT_BACKLOG.md` carries a zone tag. **Check it before you write anything.**

### `[Zone 0]` — Money, fiqh, identity. **AI does not author code here.**

Waqf principal/yield ledger, nisab calculation, webhook signature verification, webhook
idempotency, refresh-token rotation, NIK encryption, RBAC matrix, qurban slot locking.

A human writes this with Claude, pairing. Tests are mandatory and written **first**.
Errors here do not show up in the UI — they surface when the numbers stop reconciling,
or when an external auditor finds them.

**If you are an AI agent and the task says Zone 0: write the tests and the type signatures,
then stop and hand back to a human for the implementation.**

### `[Zone 1]` — Route handlers, validation, CRUD. **AI implements against a contract.**

The Zod schema, the types, and the contract test exist **before** you start. Fill in the
handler until the tests pass. If the test does not exist yet, the task has not started.

### `[Zone 2]` — UI components, forms, layout, styling. **AI has free rein.**

Screens, state, animation, porting components from the Hi-Fi. Mistakes are visible
immediately and cheap to fix. This is where you should move fastest.

---

## 2. Absolute Prohibitions

Violating any of these is a **critical bug**, not a style preference.

1. **Never store a JWT or refresh token in `localStorage`.** Tokens live in `httpOnly`
   cookies. Nowhere else.
2. **Never decrement `waqf_principal_ledgers.pokok_dana_terkumpul` for a program whose
   `jenis_wakaf = PRODUKTIF_KEKAL`.** The principal of a perpetual waqf is permanent.
   Only `total_hasil_available` may decrease.
3. **Never write `process.env.X || 'some-literal-fallback'`.** All configuration goes
   through `env.ts`, which fails at boot when a variable is missing. A silent fallback
   means production runs on a secret that is committed to the repository.
4. **Never create a fund-disbursement or Nadzir-approval endpoint that completes without
   an `approved_by_id` / `verified_by_*_id` set by a human ADMIN.**
5. **Never reserve a qurban slot without both a row lock (`SELECT ... FOR UPDATE`) and the
   unique constraint `(hewan_batch_id, nomor_slot)`.** One without the other still oversells.
6. **Never write a destructive migration.** No `DROP`, no `RENAME`, no narrowing
   `ALTER TYPE`, no `SET NOT NULL` on an existing column. See `../db/MIGRATION_RULES.md`;
   a legacy Next.js app reads the same database.
7. **Never expose an LLM endpoint without authentication and a per-user rate limit.**
8. **Never render constant/mock data as if it were live.** If the backend does not exist,
   the endpoint returns `501 Not Implemented` and the screen shows the `PRATINJAU` badge.
9. **Never use `Float` for money.** `numeric(18,2)` in Postgres, `decimal` in Drizzle.
10. **Never add a fifth role.** The enum is locked to four values (§4).

---

## 3. Before Writing Domain Code

If the task touches waqf, zakat, or qurban **meaning** — not just its plumbing — read
`DOMAIN_GLOSSARY.md` first. The terms are not interchangeable and the distinctions carry
legal and religious weight:

- **Wakif** gives waqf · **Nadzir** manages it · **Mauquf alaih** benefits from it
- **Muzaki** pays zakat · **Mustahik** receives it · **Amil** collects it
- **Pokok** (principal, permanent in perpetual waqf) vs **Hasil** (yield, distributable)
- **Nisab** (threshold) · **Haul** (one lunar year of ownership) · **Kadar** (rate)

Getting *muzaki* and *mustahik* backwards in a variable name is not a typo — it inverts who
gives and who receives.

---

## 4. Locked Role Enum

```
WAKIF | NADZIR | ADMIN | PETUGAS_LAPANGAN
```

There is no `AMIL` role. Offline collection is performed by `ADMIN` or `PETUGAS_LAPANGAN`.
`PETUGAS_LAPANGAN` has **no access to `/api/admin`** — it has its own `/api/petugas`
namespace. (Legacy finding AMW-07: the old proxy granted it admin access, which let a field
officer overwrite the gold price that determines everyone's nisab.)

---

## 5. Definition of Done

A task is complete only when it produces **an artefact someone else can re-run**:

- a passing `bun test`, or
- a `curl` command with its output pasted, or
- a SQL query with its result, or
- a screen recording (UI tasks only).

These are **not** acceptable evidence:
~~"tested manually"~~ · ~~"works on my machine"~~ · ~~"covered by the regression suite"~~

The last phrase is quoted from the legacy `DECISION_LOG.md`, on a project that had no test
runner. Four completion claims in that repository turned out to have no basis. This rule
exists because of that.

---

## 6. Active Scope

**Build:** Auth+RBAC, Waqf, Zakat, Qurban, Infaq/Sedekah, Certificates, Notifications,
History, Profile, Admin back office.

**Scaffold only (UI + `501` stub):** Gamification, Ask-AI, Education & Quiz, News,
Nadzir Portal, Admin Analytics.

**Out of scope entirely:** inheritance division (faraid), real-time BWI/Kemenag API
integration, `itsedekah.id` historical data migration.

Scope changed at Putaran 13 (6 September 2026). If an instruction seems to fall outside
this list, ask before building.

---

## 7. Language

- **UI strings, validation messages, errors shown to users:** Bahasa Indonesia.
- **Code, types, comments, commit messages, test names:** English.
- **Database columns:** `snake_case` · **TypeScript:** `camelCase`.

---

## 8. When Unsure

If a requirement is ambiguous, or appears to conflict with a rule above — **stop, report
the ambiguity to a human, do not guess and continue coding.** On this project the cost of a
wrong guess in Zone 0 is a religious-compliance defect that nobody notices for months.

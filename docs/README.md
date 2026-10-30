# `/docs` — What to Read, and When

This folder is the source of truth for `amwal-bun`. It is deliberately **smaller than the
legacy `amwalheti/docs`** (8 files instead of 12). Two files were removed because they
duplicated information that lives in code, and duplicated information drifts — the Baseline
Audit found four false completion claims that all originated in hand-maintained documents
that had stopped matching the codebase.

---

## Context-loading policy (this is the real token saving)

Translating documents to English saves perhaps 15–20% of tokens. **Loading only the right
document saves 70–90%.** Never paste all of `/docs` into a coding model's context.

| You are working on | Load these, nothing else |
|---|---|
| Any task at all | `AI_RULES.md` + the single task block from `../SPRINT_BACKLOG.md` |
| An oRPC procedure or API route | `+ CODING_CONVENTIONS.md` |
| Database schema or migration | `+ ../db/MIGRATION_RULES.md` |
| Auth, RBAC, payment, encryption | `+ SECURITY.md` |
| Stack or deployment decisions | `+ ARCHITECTURE.md` |
| React component / screen | `AI_RULES.md` only — plus the Hi-Fi image |
| "What is the current state of the branch?" | `../STATUS.md` |

`DECISION_LOG.md` and the `PUTARAN-*.md` records are **for humans and auditors, not for
coding models**. They are history; a model implementing `S10-B-07` gains nothing from
them and pays full token price. Read them yourself, in a browser, before you brief the model.

---

## The files that are actually here

| File | Purpose | Language | Read by |
|---|---|---|---|
| `AI_RULES.md` | Hard rules, vibe-coding zones, forbidden patterns | English | **Model, every task** |
| `CODING_CONVENTIONS.md` | oRPC + Drizzle patterns to copy verbatim | English | Model, backend tasks |
| `SECURITY.md` | Non-negotiable security invariants | English | Model, sensitive tasks |
| `ARCHITECTURE.md` | Stack, deployment, module topology | English | Humans + occasionally model |
| `DECISION_LOG.md` | Append-only audit trail, Putaran 13 → 17 | Indonesian | Humans, auditors, ADB |
| `PUTARAN-15.md` | Execution record: VPS consolidation | Indonesian | Humans, auditors |
| `PUTARAN-17.md` | Execution record: the oRPC monolith, Batch 0–6 | Indonesian | Humans, auditors |
| `README.md` | This file | English | Humans |

Outside `/docs`: `../db/MIGRATION_RULES.md` (kept next to the schema so nobody writes a
migration without seeing it), `../SPRINT_BACKLOG.md` (task-level DoD), `../STATUS.md`
(branch ground truth), `../RUNBOOK.md` (operational procedures),
`../RECONCILIATION.md` (audit trail of doc-vs-code reconciliation).

`DOMAIN_GLOSSARY.md` and `PRD.md` are referenced by older documents but were never carried
over from the legacy repo into `amwal-bun`. Do not cite them as if they exist here.

---

## What was removed, and why

**`DATABASE_SCHEMA.md` (844 lines of DBML) — deleted.**
`db/schema.ts` is now the schema. A second, hand-maintained copy is exactly how the legacy
repo ended up with 38 models and 2 migrations. Generate documentation from code when you
need it; never maintain a parallel description of it.

**`API_CONTRACTS.md` — deleted.**
The Zod schemas in `packages/core/src/contracts/*.ts` plus the inferred oRPC router type
are the contract, and they are compiler-checked end to end — the browser client is typed
from `AppRouter` itself. The legacy file listed 43 endpoints against 58 that actually
existed — a 26% gap that nobody noticed because nothing enforced it.

**`DESIGN_SYSTEM.md` — moved to the frontend repo** as `tokens.css` plus a component
gallery page. Design tokens belong where they are compiled, not in prose.

**`RUNBOOK.md` — scaffolded but written on Day 6**, from steps actually executed
(task `S10-B-14`). A runbook written before the first deployment describes an imagined
deployment.

---

## Rule for keeping this folder honest

If a document and the code disagree, **the code is right and the document is a bug**.
Fix the document in the same PR that changed the code, or delete the document. Do not
leave it to a later audit to discover the gap — that is what happened last time.

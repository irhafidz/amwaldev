# Iteration log: from UAT findings to weekly implementation

Design Thinking drove problem exploration and the Hi-Fi prototype (Figma). From the first implemented build onwards, development followed an Extreme Programming (XP)–style rapid weekly iteration: each UAT or internal QA session was triaged into *must fix*, *polish* and *deferred* groups, implemented in small increments, and merged only when the automated test suite and type check passed.

This log lists what was recorded, decided and delivered per cycle. Finding IDs (`U3-nn`, `U4-nn`) come from the internal triage documents of the project. Respondents are not named.

## Cadence (from the project's version history)

The implementation repository holds **377 commits between 6 September and 3 November 2026**, in 8 ISO calendar weeks. No commits were made in weeks 43–44 (19 October – 1 November 2026), between the UAT #4 fixes and the second internal QA round.

| ISO week (2026) | W36 | W37 | W38 | W39 | W40 | W41 | W42 | W43–44 | W45 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Commits | 2 | 111 | 122 | 44 | 32 | 49 | 12 | 0 | 5 |

At the end of the period the suite held **1,115 automated tests** (370 domain-kernel tests that run without a database or bundler, and 745 application/integration tests); the type check passed on all three workspaces.

## Timeline

| Date (2026) | Event | Outcome |
|---|---|---|
| 18 Sep | **UAT #1** (public/donor Hi-Fi prototype, N = 3) | SEQ 5.17, SUS 65.83. Main findings: a login requirement at the start of the donation flow hindered conversion (SEQ T1 = 3), the Infaq menu was hidden under "More" (SEQ T4 = 2.5), and transaction proof was not reachable before login (SEQ T10 = 2). |
| 19 Sep | Post-UAT fix | Authentication race condition, donation routing and the guest checkout flow were corrected. |
| 25 Sep | **UAT #2** (admin Hi-Fi prototype, N = 4) | SEQ 6.49, SUS 54.17 (see the note in `README.md` of this folder). |
| 9 Oct | Internal **QA Test #1**, phases 1–8 | Guest checkout extended to zakat and qurban, QRIS amount limit handling, resumable payments and guest order tracking, local media storage, A4 letterhead PDFs, automatic release of unpaid qurban slots, public institution (nadzir) profile, additive migrations 0019–0023. |
| 9 Oct | **UAT #3** (public view, implemented app, N = 4) | SEQ 5.75, SUS 68.1, task success 89.9% (62/69). |
| 16 Oct | UAT #3 fixes (Groups 1–2) and review hardening | See "UAT #3" below. |
| 16 Oct | **UAT #4** (admin and amil view, N = 6) | SEQ 6.71, SUS 65.0 (66.7 adjusted), task success 89.4% (110/123), 96.5% (110/114) functional. |
| 18 Oct | UAT #4 fixes, phases 1–2 and polish | See "UAT #4" below. Migration 0025. |
| 30 Oct | Internal desktop **QA Test #2** | 10 items *Not Pass*, 30 *Partially*. |
| 3 Nov | QA Test #2 fixes (5 commits) | Guest WhatsApp-number validation for infaq and zakat checkout; transaction-history tabs ("All", "Successful" as default, "Awaiting payment"); countdown theme colours, copy and stock freshness fixes; video likes, quiz back button, profile details, password strength; donor accounts and public infaq programs for admins; qurban grade, juleha and distribution polish; shared client-side pagination (10 rows per page) for the seven long admin tables. |

## UAT #3 — public view

| ID | Finding | Decision | Delivered |
|---|---|---|---|
| U3-01 | Qurban: the "continue" button was not found (6 of 12 attempts at three qurban tasks failed for this reason) | Must fix | Yes — bottom navigation hidden on package detail, a safe-area-aware payment bar, clearer "Choose package" call to action |
| U3-02 | Comment submit button hidden behind the bottom navigation on iOS | Must fix | Yes |
| U3-03 | Qurban step indicators mistaken for buttons | Must fix | Yes — rendered as non-interactive text |
| U3-04 | Whole-cow tab appeared empty without explanation | Must fix | Yes — explicit empty states and per-tab package counts |
| U3-05 | Zakat Maal: unclear nisab status, Rp 0 shown without explanation | Must fix | Yes — coloured status panel, nisab progress bar and shortfall sentence, guidance in place of a disabled pay button |
| U3-06 | Required-field marker requested | Must fix | Yes — shared required marker with `aria-required` |
| U3-07 | Having to log in again after registering | Must fix | Yes — automatic login after registration |
| U3-08 | Invalid form submission gave no pointer to the error | Must fix | Yes — focus and scroll to the first invalid field |
| U3-30, U3-31 | Meat delivery logistics; monthly or instalment payment of zakat maal | Deferred / not pursued | Out of scope: changes the business model and the one-transaction-one-certificate invariant |

Group 2 (polish) items were implemented in the same change set (it also touched the desktop sidebar, the infaq and waqf donation forms and the article detail view). A finding about missing payment notifications was re-examined and corrected: settled payments already generated notifications.

## UAT #4 — admin and amil view

| ID | Finding | Group | Delivered |
|---|---|---|---|
| U4-01 | Physical-progress percentage input produced "080%" | Must fix | Yes — sanitised numeric percentage input |
| U4-02 | Province / city / district / village could not be searched | Must fix | Yes — searchable select for all region levels |
| U4-03 | Programme modal closed on an outside click and lost the input | Must fix | Yes — dirty-state guard and session draft recovery |
| U4-04 | Article and quiz drafts "disappeared" on refresh; list load errors were silent | Must fix | Yes — draft autosave and explicit load-error states |
| U4-05 | Reported blocker when creating a goat qurban programme | Reproduce first | Not reproduced; input validation added |
| U4-06 / U4-07 | Progress-management flow (term → receipt → documentation), photo preview size, upload feedback | Polish | Yes — redesigned workbench, at least one documentation photo required, large previews and thumbnails, lighter uploads |
| U4-08 | Stale "loading" view after deleting a programme | Hypothesis | Not reproduced in production |
| U4-09 | Small text and icon targets in the admin interface | Polish | Yes — typography scale and larger targets |
| U4-10 | Nominal inputs: spinner arrows, separators, automatic zeros | Polish | Yes — shared Rupiah input |
| U4-11 | Infaq: no field to attach proof of transfer | Polish | Yes — optional proof attachment (additive migration 0025) |
| U4-12 – U4-15 | Zakat banner and calculator, qurban catalogue grouping, quiz options and preview, sidebar placement of programme menus | Polish | Yes |
| U4-16 | Newly onboarded admins needed help (SUS items 4 and 7) | Polish | Yes — guided empty states and an in-app admin guide |
| K3-01 / K3-02 | Video-file upload; a dedicated "zakat programme" entity | Deferred | Requires storage and bandwidth decisions; zakat has no programme entity in the product model |

## Reading the log

- "Delivered" reflects the project's own change records at the time of writing (triage plan and commit contents); it is not an independent verification of each change.
- UAT #3 and #4 aggregates are the audited values in `uat_summary_per_cycle.csv`. Draft aggregates that were later recomputed are noted there.

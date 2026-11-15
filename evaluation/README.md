# Evaluation

User Acceptance Testing (UAT) data of the four evaluation cycles: two user-side (donor) and two administrator-side cycles. Each cycle was a moderated session measuring the **Single Ease Question (SEQ, 1–7)**, the **System Usability Scale (SUS, 0–100)**, task success, and indicative task completion duration.

| File | Contents |
|---|---|
| `uat_summary_per_cycle.csv` | One row per cycle (UAT #1–#4): date, view tested, participant demographics, SEQ, SUS, task success, indicative duration, data status and notes (Table of the paper) |
| `uat1_public_prototype_anonymized.csv` | UAT #1: SUS and per-task SEQ of the three respondents (R1–R3) |
| `uat3_public_view_anonymized.csv` | UAT #3: task counts, task success, mean SEQ and SUS per respondent (R1–R4) |
| `uat4_admin_view_anonymized.csv` | UAT #4: demographics, task counts, task success, mean SEQ, SUS and indicative duration per respondent (R1–R6) |
| `iteration_log.md` | How each cycle's findings were turned into weekly implementation work |

No per-respondent file is provided for UAT #2: the raw observer logs of that cycle have not been consolidated, so only the official summary values are published.

## Cycles at a glance

| Cycle | Date (WIB) | View | N | SEQ | SUS | Task success |
|---|---|---|:-:|:-:|:-:|---|
| UAT #1 | 18 Sep 2026, 13:00–15:00 | Public/donor, Hi-Fi prototype | 3 | 5.17 | 65.83 | not reported |
| UAT #2 | 25 Sep 2026, 13:00–15:00 | Admin, Hi-Fi prototype | 4 | 6.49 | 54.17¹ | not reported |
| UAT #3 | 9 Oct 2026, 13:00–15:00 | Public, implemented web app | 4 | 5.75 | 68.1² | 89.9% (62/69) |
| UAT #4 | 16 Oct 2026, 13:00–15:00 | Admin and amil, implemented web app | 6 | 6.71 | 65.0 raw / 66.7 adjusted³ | 89.4% (110/123); 96.5% (110/114) functional⁴ |

¹ SUS is affected by a variation in the input scale used by the observer in one test session.
² An earlier draft aggregate (SEQ 5.69, SUS 65.00) was an initial aggregation before the audit of the raw log; the values above are recomputed from the per-respondent log.
³ Raw score 65.0; the adjusted score 66.7 corrects the reversed-scale scoring of SUS item 6 for one respondent. An earlier draft aggregate (SEQ 6.64, SUS 61.67) was an initial aggregation before the raw-log audit.
⁴ Functional task success excludes 9 task attempts at features that did not exist in the product at test time (video-file upload for educational videos and a dedicated "zakat program" entity). The 4 remaining unsuccessful attempts were 3 defects and 1 design suggestion recorded as failed.

## Notes on the data

- **Task duration** is reported as an *indicative task completion duration*: the format in which observers recorded time varied across the raw logs (m:ss, m.ss, free text, plain seconds), and only successful tasks are timed. Cycle-level means are as reported by the UI/UX team and are not recomputed from the per-respondent column.
- **SEQ** is rated only for tasks the respondent completed; failed attempts are not rated. In UAT #1 the summary-report value (5.17) differs from the mean over individual tested tasks (4.71); both are stated in `uat_summary_per_cycle.csv`.
- **Devices** of UAT #3 were not recorded in the UAT #3 test log.
- **Demographics.** Demographic attributes are limited to gender, age and division/profession. Respondent labels (R1, R2, …) are assigned independently in each file and are **not** comparable across cycles. The label order carries no meaning.
- Respondent-level gender is not published for UAT #3 and UAT #4; it is reported per cycle in `uat_summary_per_cycle.csv`.

## Ethics

All participants voluntarily participated in the moderated usability testing sessions and agreed to the anonymized use of their evaluation feedback for academic research. No names or contact details are included in this repository.

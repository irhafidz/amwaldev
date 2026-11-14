---
title: "A Design Thinking Approach to Enhancing Usability and Transparency in Digital Islamic Philanthropy Platforms"
author: "Irmasari Hafidz*, Hilman Mumtaz Sya’bani, Aldani Prasetyo, Qurrota Ainin Jayyidah Sutanto, Bara Ardiwinata, Naufal Zaky Nugraha, Muhammad Ade Dzakwan, Nur Aini Rakhmawati *corresponding author"
date: "19 December 2026 "
conference: "Submission for the Beyond Technology Summit on Informatics International Conference (BTS-I2C) 2026, 19 December, Universitas Muhammadiyah Jember, Indonesia"
website: "https://amwal.id"
---

## Introduction #amwal-dev
Amwal stands for *Aplikasi Waqaf Aman Legal*. It is a web-dev that supports an integrated ZISWAF (zakat, infaq, sadaqah, and waqf) and qurban management platform for donors and institutional administrators. It exists both as an interactive High-Fidelity (Hi-Fi) design and as a full-stack Progressive Web Application (PWA), live at [amwal.id](https://amwal.id). This repository accompanies the research paper **“A Design Thinking Approach to Enhancing Usability and Transparency in Digital Islamic Philanthropy Platforms”**.

The platform was designed, implemented, and evaluated through an iterative Design Thinking methodology at the Manarul Ilmi Foundation (Yayasan Manarul Ilmi, YMI) and Masjid Manarul Ilmi, Institut Teknologi Sepuluh Nopember (ITS) in the period of May 2026 up until now (on-going). The process ran two user-side iterations and two administrator-side iterations.

## Tech Stack

| Layer          | Technology                                         |
|----------------|----------------------------------------------------|
| Framework      | TanStack Start (Bun runtime, Nitro SSR)            |
| API layer      | oRPC + Zod, end-to-end type-safe                   |
| Database       | PostgreSQL, 39 tables, Drizzle ORM                 |
| Access control | Role-Based Access Control (RBAC)                   |
| Delivery       | Progressive Web Application (PWA)                  |

## Key Features

**Transactional integrity and fiqh compliance**
- Non-diminishing principal ledger for cash waqf, so the waqf principal is never spent.
- Pessimistic row-level locking for collective qurban slot allocation, preventing double booking of shared animals.
- Idempotent (duplicate-safe) payment webhooks, so repeated gateway callbacks never record a payment twice (a payment is recorded exactly once even if the gateway sends the same notification several times).
- SHA-256 hash-verified PDF waqf e-Certificates.
- Gold-price edit feature for zakat nisab calculation.
- Document-assisted nadzir verification: a nadzir must attach an official certificate from Badan Wakaf Indonesia (BWI) showing that they are a registered nadzir.

**Dual-perspective interface (Donor and Administrator)**
- Cross-contract philanthropic services (zakat, infaq, sadaqah, waqf, qurban) in one platform.
- Real-time receipt transparency.
- RFM-D donor analytics for administrators.
- Interactive Sharia education.

## Repository Structure

<!-- TODO: adjust to the actual repository layout -->

```text
amwal-dev/
├── figures/        # High resolution figures from the paper
├── design/         # Hi-Fi design files and prototypes (donor and admin)
├── src/            # TanStack Start application (routes, oRPC procedures, UI)
├── drizzle/        # Drizzle schema and migrations (39 tables)
├── evaluation/     # UAT data: SEQ, SUS, and task completion times
├── .env.example    # Template for environment variables
└── README.md       # Project introduction
```
## Methodology

1. Empathize, define, ideate, prototype, and test with donors and YMI administrators (Design Thinking).
2. Run two user-side and two administrator-side iterations, refining the Hi-Fi design and PWA after each.
3. Evaluate each cycle through User Acceptance Testing (UAT) using the Single Ease Question (SEQ), System Usability Scale (SUS), and task completion time.

## Contributions

1. A full-stack, type-safe PWA architecture with software engineering safeguards for transactional integrity and fiqh compliance.
2. A dual-perspective interface design (Donor and Administrator) that unifies cross-contract philanthropic services, real-time receipt transparency, RFM-D donor analytics, and interactive Sharia education.
3. A controlled empirical evaluation of usability and task efficiency across four UAT cycles.

## Results

<!-- TODO: add SEQ, SUS, and task completion time results per iteration -->

| Cycle               | SEQ   | SUS   | Task completion time | Date and Time UAT | User Demographic UAT |
|---------------------|-------|-------|----------------------|-------------------| ---------------------|
| User iteration 1    |       |       |                      |                   |
| User iteration 2    |       |       |                      |
| Admin iteration 1   |       |       |                      |
| Admin iteration 2   |       |       |                      |

## Related Work

- **Amwal Chatbot: Source-Grounded Retrieval-Augmented Generation for Enhancing Public Access to Indonesian Islamic Philanthropy Regulations.** Submitted to IEEE SOFTT 2026, Yogyakarta, Indonesia. Repository: [`amwal-chatbot`](<link>).

## Acknowledgment

This research is funded by the Higher Education Technology and Innovation (HETI) Project ADB Loan 4110-INO under Contract Number 0008/01.PKS/PPK-HETI/ITS/2026. The authors gratefully acknowledge the cooperation of Yayasan Manarul Ilmi and Masjid Manarul Ilmi at Institut Teknologi Sepuluh Nopember for their support during the platform development.

## Disclaimer

Amwal is a research platform. Its zakat calculations and Sharia education content are informational and are not a substitute for an official fatwa.

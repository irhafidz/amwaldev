# Figures

## Figures of the paper

| File / Folder | Figure in the paper |
|---|---|
| `fig1_design_thinking_flow.png` | Fig. 1. Amwal design thinking flow |
| `fig2_empathy_map.png` | Fig. 2. Amwal empathy map |
| `fig3_affinity_diagram.png` | Fig. 3. Amwal affinity diagram |
| `wireframe/donor/` | Fig. 4. Donor side wireframe design |
| `wireframe/admin/` | Fig. 5. Administrator side wireframe design |
| `fig6_amwal_architecture.png` | Fig. 6. Amwal Architecture |
| `prototype/donor/` | Fig. 7. Display of the Amwal ZISWAF Platform User Prototype |
| `prototype/admin/` | Fig. 8. Prototype Display of Amwal ZISWAF Admin Dashboard |

## Supplementary figures

Redrawn from the production codebase (see `src/` for the sources and `src/render-png.mjs` to re-render). PNGs are 300 DPI on a white background.

| File | Contents |
|---|---|
| `figS1_system_architecture.png` | Block-flow architecture: (1) actors and the five RBAC roles ↔ (2) installable web client ↔ (3) backend and persistence (oRPC JSON API, PostgreSQL with 61 tables, VPS local media storage, Mayar QRIS, Baileys WhatsApp gateway, Tanya Amwal AI assistant). Reflects the current production system and is intended as an accurate replacement for the architecture diagram in Fig. 6 |
| `figS2_use_case.png` | Main use cases of the donor (WAKIF or guest) and of the staff roles (ADMIN, NADZIR, BENDAHARA, PETUGAS_LAPANGAN) |
| `figS3_database_domains.png` | The 61 database tables grouped into 11 functional domains, with core transactional entities highlighted and the foreign-key dependencies between domains |

| Source | Description |
|---|---|
| `src/figS1_system_architecture.svg`, `src/figS2_use_case.svg`, `src/figS3_database_domains.svg` | Editable vector sources |
| `src/render-png.mjs` | Renders the SVG files to 300 DPI PNG files |

## UI screenshots (`ui-screenshots/`)

Screenshots of the implemented web application, grouped by perspective and device: `donor/laptop/`, `donor/mobile/` and `admin/laptop/`. They were captured by an automated browser script with device emulation (laptop 1440 × 900 CSS px, phone 390 × 844 CSS px) at **2× pixel density** (laptop 2880 px wide, phone 780 px wide), from a build of 16 October 2026 populated with a **seeded demonstration dataset**; names, amounts and order numbers are not real data. They are emulated renderings, not captures from physical devices. See `ui-screenshots/README.md`.

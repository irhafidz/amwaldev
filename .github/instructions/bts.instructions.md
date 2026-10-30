---
applyTo: "**"
---
# bts

# Better-T-Stack Project Rules

This is a my-better-t-app-2 project created with Better-T-Stack CLI.

## Project Structure

> **Migrasi arsitektur TUNTAS (Putaran 17, lihat `docs/PUTARAN-17.md`):**
> `apps/server` sudah dihapus tuntas di Batch 6 (strangler-fig, Batch 0–6
> selesai). Satu aplikasi fullstack `apps/web` (TanStack Start + oRPC +
> Drizzle) sekarang satu-satunya aplikasi HTTP — tidak ada lagi REST `/api/*`
> "berwenang" terpisah. Baris di bawah menggambarkan kondisi repo pasca-Batch
> 6.

This is a monorepo with the following structure:

- **`apps/web/`** - Satu-satunya aplikasi fullstack: TanStack Start (SSR +
  aset statis) + oRPC (`apps/web/src/lib/orpc/router/**`, mount di
  `/rpc/*`) + dua rute HTTP murni non-oRPC
  (`apps/web/src/routes/api/webhooks/payment.ts`,
  `apps/web/src/routes/api/certificates.$id.ts`) + satu-satunya koneksi
  database (`apps/web/src/lib/db/`, Drizzle) dan koneksi wa-bot
  (`apps/web/src/lib/whatsapp/`).
- **`packages/core/`** (`@amwal/core`) - Kernel domain bersama: skema Drizzle
  (`src/db/schema.ts`, satu berkas, sumber kebenaran tunggal), invarian
  fiqih Zone 0 (`src/waqf/ledger.ts`, `src/waqf/withdrawal.ts`), orkestrasi
  pembayaran/webhook, kontrak Zod per-domain (`src/contracts/*.ts`), dan
  templat/pengiriman notifikasi WhatsApp (`src/whatsapp/*.ts`). `apps/web`
  mengimpornya sebagai `workspace:*`.
- **`apps/wa-bot/`** - Microservice daemon WhatsApp (Baileys), Hono + Node
  20 runtime, terpisah karena dependensi kripto native & proses long-lived.
  Tidak pernah dapat rute publik (AMW-02) — hanya dipanggil `apps/web` lewat
  jaringan Docker internal.

## Available Scripts

- `bun run dev` - Start apps/web in development mode

## Database Commands

All database operations should be run from the `apps/web` workspace:

- `bun run db:generate` - Generate Drizzle migration SQL from schema changes
- `bun run db:migrate` - Apply migrations (`apps/web/drizzle/`)
- `bun run db:studio` - Open database studio
- `bun run db:check` - Validate migration consistency

Database schema files are located in `packages/core/src/db/schema.ts` (satu
berkas, sumber kebenaran tunggal — `apps/web/src/lib/db/schema.ts` hanya
re-export shim, jangan duplikasi definisi tabel di sana).

## API Structure

- oRPC procedures (satu-satunya transport data typesafe) ada di
  `apps/web/src/lib/orpc/router/**`, satu berkas per domain
  (waqf/zakat/qurban/infaq/nadzir/amil/admin/auth), di-mount di `/rpc/*`
  lewat `apps/web/src/routes/rpc/$.ts`
- Client-side oRPC client ada di `apps/web/src/lib/orpc/client.ts`,
  dikonsumsi lewat `apps/web/src/lib/amwal-api/*` (wrapper yang menjaga
  nama/bentuk return REST-era agar komponen UI tidak perlu berubah)
- Dua rute HTTP murni non-oRPC (webhook Midtrans, unduhan sertifikat PDF)
  ada di `apps/web/src/routes/api/**`

## Authentication

Authentication is enabled in this project:
- Penerbitan & rotasi token JWT (custom, bukan `better-auth` — tabel
  `users`/`password_hash` bcrypt dipakai bersama aplikasi Next.js lama) ada
  di `packages/core/src/auth/tokens.ts`
- Verifikasi token & guard peran (`publicProcedure`/`protectedProcedure`/
  `roleProcedure`/`anyRoleProcedure`/`adminProcedure`) ada di
  `apps/web/src/lib/orpc/procedures.ts`

## Adding More Features

You can add additional addons or deployment options to your project using:

```bash
bunx create-better-t-stack
add
```

Available addons you can add:
- **Documentation**: Starlight, Fumadocs
- **Linting**: Biome, Oxlint, Ultracite
- **Other**: vibe-rules, Turborepo, PWA, Tauri, Husky

You can also add web deployment configurations like Cloudflare Workers support.

## Project Configuration

This project includes a `bts.jsonc` configuration file that stores your Better-T-Stack settings:

- Contains your selected stack configuration (database, ORM, backend, frontend, etc.)
- Used by the CLI to understand your project structure
- Safe to delete if not needed
- Updated automatically when using the `add` command

## Key Points

- This is a Turborepo monorepo using bun workspaces
- Each app has its own `package.json` and dependencies
- Run commands from the root to execute across all workspaces
- Run workspace-specific commands with `bun run command-name`
- Turborepo handles build caching and parallel execution
- Use `bunx
create-better-t-stack add` to add more features later
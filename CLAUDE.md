<!-- vibe-rules Integration -->

<bts>
# Better-T-Stack Project Rules

This is a my-better-t-app-2 project created with Better-T-Stack CLI.

## Project Structure

> **Migrasi arsitektur TUNTAS (Putaran 17, lihat `docs/PUTARAN-17.md`):**
> `apps/server` sudah dihapus tuntas di Batch 6 (strangler-fig, Batch 0–6
> selesai). Satu aplikasi fullstack `apps/web` (TanStack Start + oRPC +
> Drizzle) sekarang satu-satunya aplikasi HTTP — tidak ada lagi REST `/api/*`
> "berwenang" terpisah, dan tidak ada lagi container `server:3001`. Baris di
> bawah menggambarkan kondisi repo pasca-Batch 6.

This is a monorepo with the following structure:

- **`apps/web/`** - Satu-satunya aplikasi fullstack: TanStack Start (SSR +
  aset statis) + oRPC (`apps/web/src/lib/orpc/router/**`, mount di
  `/rpc/*` lewat `apps/web/src/routes/rpc/$.ts`) + tiga rute HTTP murni
  non-oRPC (`routes/api/webhooks/payment.ts`,
  `routes/api/certificates.$id.ts`, `routes/api/dev/mock-webhook.ts`) +
  satu-satunya koneksi database (`apps/web/src/lib/db/`, Drizzle) dan
  koneksi wa-bot (`apps/web/src/lib/whatsapp/`).
- **`packages/core/`** (`@amwal/core`) - Kernel domain bersama: skema Drizzle
  (`src/db/schema.ts`, satu berkas, sumber kebenaran tunggal), invarian
  fiqih Zone 0 (`src/waqf/ledger.ts`, `src/waqf/withdrawal.ts`), orkestrasi
  pembayaran/webhook (`src/payment/*.ts`), guard sesi (`src/auth/*.ts`),
  kontrak Zod per-domain (`src/contracts/*.ts`), dan templat/pengiriman
  notifikasi WhatsApp (`src/whatsapp/*.ts`). `apps/web` mengimpornya sebagai
  `workspace:*`. Paket ini **tidak boleh** mengimpor apa pun dari `apps/web`
  — itulah yang membuat tes fiqih bisa jalan tanpa bundler.
- **`apps/wa-bot/`** - Microservice daemon WhatsApp (Baileys), Hono + Node
  20 runtime, terpisah karena dependensi kripto native & proses long-lived.
  Tidak pernah dapat rute publik (AMW-02) — hanya dipanggil `apps/web` lewat
  jaringan Docker internal.

Tidak ada `apps/fumadocs` di repo ini.

## Available Scripts

- `bun run dev` - Start apps/web in development mode (port 3000)
- `bun run check-types` - `tsc --noEmit` di seluruh workspace
- `bunx @biomejs/biome check ./` - Lint & format

## Database Commands

All database operations should be run from the `apps/web` workspace:

- `bun run db:generate` - Generate Drizzle migration SQL from schema changes
- `bun run db:migrate` - Apply migrations (`apps/web/drizzle/`)
- `bun run db:studio` - Open database studio
- `bun run db:check` - Validate migration consistency

**Tidak ada `db:push`** — dicabut secara sengaja (Putaran 14 #5): basis data
ini dipakai bersama aplikasi Next.js lama yang masih hidup, sehingga hanya
migrasi SQL aditif yang diizinkan. Lihat `db/MIGRATION_RULES.md`.

Database schema files are located in `packages/core/src/db/schema.ts` (satu
berkas, sumber kebenaran tunggal — `apps/web/src/lib/db/schema.ts` hanya
re-export shim, jangan duplikasi definisi tabel di sana).

## API Structure

- oRPC procedures (satu-satunya transport data typesafe) ada di
  `apps/web/src/lib/orpc/router/**`, **satu berkas per domain**
  (waqf/zakat/qurban/infaq/nadzir/amil/admin/auth) — bukan satu berkas per
  prosedur, dan tanpa folder `-app/`/`-domain/`/`-components/`. Penyimpangan
  dari layering template ini disengaja dan tercatat di `docs/PUTARAN-17.md`
  §J.5 (~60 prosedur di 12+ domain).
- Guard peran ada di `apps/web/src/lib/orpc/procedures.ts`:
  `publicProcedure` / `protectedProcedure` / `roleProcedure` /
  `anyRoleProcedure` / `adminProcedure`.
- Client-side oRPC client ada di `apps/web/src/lib/orpc/client.ts`,
  dikonsumsi lewat `apps/web/src/lib/amwal-api/*` (wrapper tipis yang
  menjaga nama/bentuk return era-REST agar komponen UI tidak perlu berubah).
- Rute HTTP murni non-oRPC ada di `apps/web/src/routes/api/**` — dipakai
  hanya ketika responsnya bukan JSON-RPC (webhook Midtrans dengan kontrak
  eksternal, unduhan PDF sertifikat, bridge simulator dev).

## Authentication

Authentication is enabled in this project:
- Penerbitan & rotasi token JWT (custom, bukan `better-auth` — tabel
  `users`/`password_hash` bcrypt dipakai bersama aplikasi Next.js lama) ada
  di `packages/core/src/auth/tokens.ts`.
- Verifikasi token & guard peran ada di
  `apps/web/src/lib/orpc/procedures.ts`; primitif bersama (pembacaan token,
  verifikasi sesi) di `packages/core/src/auth/guard.ts`.
- Cookie sesi `amwal_token` / `amwal_refresh` (httpOnly), nama tunggal di
  `packages/core/src/auth/cookie-names.ts`.

## Testing

- `cd packages/core && bun test` — invarian fiqih & pembayaran, tanpa DB,
  tanpa bundler.
- `cd apps/web && bun test` — integrasi oRPC/rute, butuh `TEST_DATABASE_URL`.

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
</bts>

<!-- /vibe-rules Integration -->

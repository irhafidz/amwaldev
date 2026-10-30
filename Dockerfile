# Multi-stage Dockerfile for Bun 1.4.0 + TanStack Start (Monorepo)
#
# Putaran 17, Batch 6: apps/server is decommissioned — apps/web is now the
# only application, and the only one holding a database connection
# (Drizzle) and a Baileys/wa-bot connection. This image now also carries
# the Drizzle migration SQL + schema source so `db:migrate` can be run
# from inside a deployed container (`docker compose exec web bun run
# db:migrate`) — previously that lived only in apps/server, which no
# longer exists.
FROM oven/bun:1.4.0-alpine AS base
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
# `bunfig.toml` WAJIB ikut disalin — ia yang menyetel `linker = "isolated"`.
# Tanpa berkas ini `bun install` memakai linker bawaan (hoisted), dan layout
# node_modules di image berbeda dari layout di mesin pengembang. Perbedaan itu
# diam-diam mematikan build: `apps/web/lingui.config.ts` meng-import
# `@lingui/cli`, sedangkan jiti (loader config Lingui) hanya mencari di
# `apps/web/node_modules` dan TIDAK menelusuri ke direktori induk seperti
# resolusi Node biasa. Dengan linker hoisted, `@lingui/cli` ada di
# node_modules root, jiti gagal, cosmiconfig menelan galatnya, dan
# `bun run build` mati dengan pesan menyesatkan "No Lingui config found".
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
RUN bun install --frozen-lockfile

# Stage 2: Build application
FROM base AS builder
# Linker isolated menaruh dependensi tiap workspace di `node_modules`-nya
# sendiri, jadi ketiganya harus ikut tersalin — bukan hanya yang di root.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build

# Stage 3: Production Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules & output build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.output ./apps/web/.output
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

# drizzle-kit needs the schema source (TS, not compiled) plus the
# migration SQL + config to run `db:generate`/`db:check`/`db:migrate`.
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/core/src/db ./packages/core/src/db
COPY --from=builder /app/apps/web/drizzle.config.ts ./apps/web/drizzle.config.ts
COPY --from=builder /app/apps/web/drizzle ./apps/web/drizzle

# Per-workspace node_modules. WAJIB karena linker isolated (lihat stage
# `deps`): `drizzle-kit` — devDependency milik `apps/web` — hanya ada di
# `apps/web/node_modules/.bin/`, TIDAK di `node_modules/.bin/` root. Tanpa
# baris ini entrypoint gagal "drizzle-kit: not found" dan kontainer menolak
# naik. `packages/core/node_modules` diperlukan agar `drizzle-orm` bisa
# di-resolve saat drizzle-kit mem-parse `packages/core/src/db/schema.ts`.
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules

# Auto-migrate saat start: entrypoint menjalankan `bun run db:migrate`
# (idempotent) sebelum server naik. Tidak auto-seed — seed sengaja manual.
# Disalin dari build context, bukan dari builder: `.dockerignore` tidak
# mengecualikan skrip shell, jadi berkasnya ada di kedua stage.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

# ENTRYPOINT = migrasi lalu `exec "$@"`; CMD = perintah server yang di-exec.
# Dipisah begini supaya `docker compose run web <perintah lain>` tetap
# termigrasi, sementara `--entrypoint` bisa melewatinya saat debugging.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "apps/web/.output/server/index.mjs"]

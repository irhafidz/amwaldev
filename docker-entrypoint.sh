#!/bin/sh
# ==========================================================================
# docker-entrypoint.sh — migrasi Drizzle SEBELUM server TanStack Start start.
#
# Dipakai HANYA oleh stage `runner` di Dockerfile root (aplikasi `web`).
# `wa-bot` tidak menyentuh database sama sekali, jadi tidak memakainya.
#
# KENAPA ADA: sebelumnya migrasi murni manual (`docker compose exec web bun
# run db:migrate`). Itu berarti redeploy dengan migrasi baru akan menjalankan
# kode baru di atas skema lama sampai seseorang ingat menjalankannya — persis
# kelas kegagalan "zero schema drift" yang dijaga RUNBOOK §2. Sekarang
# kontainer menolak melayani trafik kalau migrasinya belum berhasil.
#
# KENAPA `cd /app/apps/web`: drizzle.config.ts memakai path RELATIF —
# `out: './drizzle'` dan `schema: '../../packages/core/src/db/schema.ts'` —
# dan drizzle-kit mencarinya relatif terhadap cwd. Dari direktori lain,
# drizzle-kit tidak menemukan berkas migrasi apa pun dan melaporkan
# "no migrations found" alih-alih error yang jelas.
#
# `drizzle-kit` tersedia karena image memakai linker isolated yang sama dengan
# mesin pengembang (`bunfig.toml` disalin di stage `deps`), sehingga bin-nya
# ada di `apps/web/node_modules/.bin/` — salah satu direktori yang ditambahkan
# `bun run` ke PATH saat dijalankan dari direktori itu.
#
# CATATAN KONKURENSI: `drizzle-kit migrate` tidak mengambil advisory lock.
# Aman di sini karena `web` adalah satu kontainer bernama tetap
# (`container_name: amwal_web`) tanpa replika — jangan `--scale web=2`.
#
# KNOB OPERASIONAL:
#   SKIP_DB_MIGRATE=1        lewati migrasi (darurat: DB down, app harus naik)
#   DB_MIGRATE_MAX_ATTEMPTS  jumlah percobaan (default 10)
#   DB_MIGRATE_RETRY_DELAY   jeda antar percobaan, detik (default 3)
# ==========================================================================
set -eu

MIGRATE_MAX_ATTEMPTS="${DB_MIGRATE_MAX_ATTEMPTS:-10}"
MIGRATE_RETRY_DELAY="${DB_MIGRATE_RETRY_DELAY:-3}"

log() {
  printf '%s [entrypoint] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

if [ "${SKIP_DB_MIGRATE:-0}" = "1" ]; then
  log "SKIP_DB_MIGRATE=1 — migrasi dilewati, server jalan di atas skema apa pun yang ada."
elif [ -z "${DATABASE_URL:-}" ]; then
  log "FATAL: DATABASE_URL kosong. Compose mengambilnya dari berkas .env (lihat docker-compose.prod.yml)."
  exit 1
else
  attempt=1
  while :; do
    log "menjalankan migrasi Drizzle (percobaan ${attempt}/${MIGRATE_MAX_ATTEMPTS})"
    # Subshell: cwd untuk server di bawah tetap /app, tidak ikut berpindah.
    # Kegagalan di sini tidak mematikan skrip karena berada di posisi kondisi `if`.
    if (cd /app/apps/web && bun run db:migrate); then
      log "migrasi selesai — melanjutkan ke server."
      break
    fi
    if [ "${attempt}" -ge "${MIGRATE_MAX_ATTEMPTS}" ]; then
      log "FATAL: migrasi gagal setelah ${MIGRATE_MAX_ATTEMPTS} percobaan. Kontainer dihentikan supaya tidak melayani di atas skema basi."
      exit 1
    fi
    attempt=$((attempt + 1))
    log "migrasi gagal — coba lagi dalam ${MIGRATE_RETRY_DELAY}s (Supabase pooler bisa sedang tidak terjangkau)."
    sleep "${MIGRATE_RETRY_DELAY}"
  done
fi

# exec: server menggantikan PID 1, sehingga SIGTERM dari `docker stop` sampai
# langsung ke prosesnya (tanpa itu, stop menunggu timeout lalu SIGKILL).
exec "$@"

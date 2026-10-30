# ==========================================================================
# apps/wa-bot — daemon WhatsApp Baileys.
#
# Bun dipakai untuk install & bundling (cepat), Node 20 untuk runtime, sesuai
# ARCHITECTURE.md §1: Baileys punya dependensi kripto native dan proses
# long-lived, jadi dijalankan di mesin Node murni.
# ==========================================================================

# ---- STAGE 1: builder (Bun) ---------------------------------------------
FROM oven/bun:1.4.0-alpine AS builder
WORKDIR /app/apps/wa-bot

# Lockfile ikut disalin agar versi dependensi di image identik dengan lokal.
COPY apps/wa-bot/package.json apps/wa-bot/bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/wa-bot ./

# --packages=external WAJIB.
#
# Tanpa flag ini, bundler menarik seluruh node_modules ke dalam satu berkas dan
# gagal pada `require()` dinamis milik Baileys untuk modul opsional yang memang
# tidak kita pasang: jimp, sharp, link-preview-js, qrcode-terminal.
#
# Keempatnya aman ditinggal external: masing-masing hanya di-require di dalam
# fungsi async yang tidak pernah dieksekusi oleh service ini —
#   jimp / sharp        → hanya untuk pemrosesan media, kita cuma kirim teks
#   link-preview-js     → hanya bila `options.getUrlInfo` dioper ke sendMessage
#                          (kita tidak mengopernya), dan panggilannya sendiri
#                          sudah dibungkus try/catch di dalam Baileys
#   qrcode-terminal     → hanya bila printQRInTerminal: true
#
# Dengan external, dist/index.js me-require dependensi dari node_modules saat
# runtime — persis yang tersedia di Stage 2.
RUN bun run build

# ---- STAGE 2: runtime (Node.js murni) -----------------------------------
FROM node:20-alpine AS runner
WORKDIR /app/apps/wa-bot

ENV NODE_ENV=production
ENV PORT=3005

# AMW-16: harus SAMA PERSIS dengan volume mount di docker-compose.prod.yml.
# Absolut, bukan relatif — path relatif mengikuti CWD dan bisa membuat sesi
# tertulis ke luar volume tanpa error apa pun.
ENV BAILEYS_SESSION_DIR=/app/apps/wa-bot/auth_session

# node_modules disalin dari builder: tidak ada dependensi native yang perlu
# dikompilasi ulang (pino, qrcode, dan libsignal Baileys semuanya pure JS),
# jadi artefak Bun aman dipakai Node.
COPY --from=builder /app/apps/wa-bot/node_modules ./node_modules
COPY --from=builder /app/apps/wa-bot/dist ./dist
COPY --from=builder /app/apps/wa-bot/package.json ./package.json

EXPOSE 3005

# /api/wa/status berada di balik middleware secret global (AMW-02), jadi healthcheck
# pun wajib membawa header — tidak ada endpoint terbuka untuk probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q \
      --header="x-internal-secret: ${INTERNAL_SECRET}" \
      http://localhost:3005/api/wa/status || exit 1

CMD ["node", "dist/index.js"]

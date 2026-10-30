# Amwal V.1 — Status Berkas (Sprint 10 + Putaran 17)

**Tanggal:** 12 September 2026 · **Branch:** `refactor/orpc-monolith` · **HEAD:** `8f277b9`

Status ini adalah ground truth branch. Hanya pekerjaan dengan artefak dan
perintah verifikasi yang lulus yang disebut **Selesai**. Tidak ada klaim
pekerjaan berdasarkan "sudah dicek manual".

> **Perubahan arsitektur sejak status sebelumnya (branch `bara`, 11 Sep):**
> `apps/server` (Hono, port 3001) sudah dihapus tuntas di Putaran 17 Batch 6.
> Seluruh endpoint kini dilayani `apps/web` pada port 3000 — oRPC di `/rpc/*`
> plus tiga rute HTTP murni di `/api/*`. Referensi `cd apps/server` dan
> `POST /api/<domain>/...` pada status lama sudah tidak berlaku.

## Arti label

- **Selesai** — ada kode, migrasi, dan tes yang lulus pada HEAD ini.
- **UI siap / backend pending** — tampilan dan kontrak data ada, endpoint
  belum tersedia sehingga alur data belum bisa dijalankan.
- **Scaffold Tier C** — UI lengkap dengan badge `PRATINJAU`; tidak ada
  backend sama sekali (endpoint menjawab 404 sejak `apps/server` dihapus).
- **Putus** — UI memanggil endpoint yang tidak ada handler-nya; harus
  diperbaiki atau tombolnya dicabut.
- **Pending** — belum ada artefak pada branch ini.

---

## Selesai — kernel domain & transaksi (Bara)

| Task | Status | Bukti |
|---|---|---|
| `S10-B-01/02/03` Scaffold, baseline Drizzle, guard migrasi | Selesai | 39 tabel di `packages/core/src/db/schema.ts`; `scripts/guard-destructive-sql.mjs` aktif sebagai hook pre-commit |
| `S10-B-05/06` PaymentProvider + `createPayment()` anchor-before-charge | Selesai | `packages/core/src/payment/{service,mock.provider,midtrans.provider}.ts`; `tests/orpc/payment-create.test.ts` |
| `S10-B-07` Webhook idempotency race-safe | Selesai | `tests/orpc/webhook.test.ts` — 10 webhook settlement paralel menaikkan ledger tepat sekali, regresi out-of-order dua arah, tanda tangan palsu ditolak |
| `S10-B-08/09` Waqf order + ledger fiqih murni | Selesai | `packages/core/tests/waqf/ledger-fiqh.test.ts` — overdraw ditolak, principal tidak pernah turun (property test), uang pecahan ditolak |
| `S10-B-10/11` Zakat kalkulator, harga emas, order | Selesai | `tests/orpc/zakat.test.ts`; `packages/core/tests/zakat/calculator.test.ts` |
| `S10-B-12` Infaq & Sedekah | Selesai | migrasi aditif `0001_infaq_orders.sql`; `tests/orpc/infaq.test.ts` |
| `S10-B-13` Admin Waqf review + penarikan | Selesai | migrasi `0002_admin_waqf_review.sql`; `tests/orpc/admin-waqf.test.ts`; overdraw dipetakan ke `ORPCError('UNPROCESSABLE_CONTENT')` (422) |
| Backoffice data layer (Putaran 17 Batch 4) | Selesai | 8 namespace `orpc.admin.*` (waqf, zakat, qurban, infaq, documents, transparency, settings, overview), semuanya di balik `adminProcedure` |

## Selesai — auth, keamanan & domain (Naufal)

| Task | Status | Bukti |
|---|---|---|
| `S10-N-02` Auth core (JWT access + refresh, rotasi) | Selesai | `packages/core/src/auth/tokens.ts`; `tests/orpc/auth.test.ts` |
| `S10-N-03` RBAC struktural | Selesai *(sebagian)* | `roleProcedure`/`anyRoleProcedure`/`adminProcedure` di `lib/orpc/procedures.ts`, dipasang di level mount. **Matriks RBAC eksplisit tidak ada** — lihat Pending |
| `S10-N-06/07` Webhook konsolidasi + cabang waqf | Selesai | `packages/core/src/payment/webhook.ts`; `routes/api/webhooks/payment.ts` |
| `S10-N-08` Sertifikat digital | Selesai | `tests/orpc/certificate.test.ts` (9 tes) — gate LUNAS/TERVERIFIKASI berjalan sebelum baris sertifikat dibuat |
| Kepemilikan sertifikat (IDOR) | Selesai | 401 anonim, 403 donatur lain, 200 pemilik, 200 ADMIN — 4 tes; ditutup pada `8f277b9` |
| `S10-N-09` WhatsApp klien & templat | Selesai | `packages/core/src/whatsapp/{templates,service,notify}.ts`; `tests/orpc/whatsapp.test.ts`; `onSettled` terpasang di webhook |
| `S10-N-10/11` Qurban slot row-lock + akad wakalah | Selesai | `tests/orpc/qurban.test.ts` — 10 pembeli berebut 1 slot, tepat 1 menang |
| `S10-N-13` Petugas lapangan — **entri offline** | Selesai *(separuh)* | `orpc.amil.offlineZakat` + `components/amil/offline-zakat-view.tsx`. Setoran/rekap-cash/distribusi **tidak ada** |

## Selesai — frontend (Awan)

| Task | Status | Bukti |
|---|---|---|
| `S10-A-01/02` Scaffold, token desain, UI kit | Selesai | `/dev/components`, `/dev/tokens` |
| `S10-A-03` API client + mutex refresh | Selesai | `tests/api-client.test.ts` |
| `S10-A-04/05` App shell, navigasi, layar auth | Selesai | login/register memakai `orpc.auth.*`, cookie httpOnly, redirect ke `/dashboard` |
| `S10-A-06` Simulator pembayaran | Selesai | `/dev/payment-simulator` → `POST /api/dev/mock-webhook` (dipulihkan `8f277b9`); loop order → settle → LUNAS terbukti end-to-end |
| `S10-A-07/08/09` Dashboard, katalog & detail wakaf, form donasi | Selesai | seluruhnya memanggil `orpc.waqf.*` |
| `S10-A-12` UI kalkulator zakat | Selesai | `orpc.zakat.calculate` + `goldPriceLive` |
| `S10-A-13` Layar qurban | Selesai | katalog, detail, slot, akad wakalah → `orpc.qurban.*` |
| `S11-I-09` CMS Berita, Edukasi & Backoffice Admin | Selesai | `packages/core/src/contracts/cms.ts`, `apps/web/src/lib/orpc/router/cms.ts`, `apps/web/src/lib/orpc/router/admin/cms.ts`, `apps/web/tests/orpc/cms.test.ts` (4 tes / 32 assertions lulus) |

---

## Putus — UI memanggil endpoint yang tidak ada

Ini bukan "pending", ini regresi yang terlihat pengguna dan harus ditindak.

| Temuan | Lokasi | Keterangan |
|---|---|---|
| Tombol "Masuk/Daftar dengan Google" (`S10-N-04`) | `routes/auth/-components/login-form.tsx:87`, `register-form.tsx:109` | Menaut ke `/api/auth/google`, **tidak ada handler**. `lib/auth/oauth.ts` dihapus di `f990bba` saat better-auth dicabut; tombolnya tidak ikut dicabut |
| Skrip `db:seed` (`S10-N-05`) | `apps/web/package.json:6` | Menunjuk `src/lib/db/seed.ts` yang dihapus di `8702038`. Berkas masih ada di branch `main` dan `origin/awan` |

## UI siap / backend pending

| Task | UI | Backend |
|---|---|---|
| `S10-N-12` Notifikasi in-app | `components/user-area/notifications-view.tsx` — gagal jujur + `PratinjauBadge` | Tidak ada prosedur `notifications`. Tabel `notifications` **sudah ada** di skema |
| `S10-A-11` Riwayat transaksi | `components/history/transaction-history.tsx`, `transaction-detail.tsx` | `getMyTransactions`/`getTransaction` masih REST ke `/api/transactions` yang **tidak pernah** punya backend, di repo mana pun |
| `S10-N-14` Tanya AI (DeepSeek) | `components/tier-c/tier-c-scaffolds.tsx` | Tidak ada prosedur `ask-ai`. Tabel `chatbot_conversations`/`chatbot_messages` **sudah ada** di skema |
| `S10-N-13` Setoran petugas lapangan | Belum ada view setoran | Tidak ada prosedur setoran/rekap-cash/distribusi; migrasi geolokasi `0003` juga belum ada |

## Scaffold Tier C (UI siap, tanpa backend)

Modul berikut dilarang disebut selesai ke luar tim: **Kuis Interaktif**,
**Gamifikasi**, **Segmentasi Donatur**, **Kohort/Kesetiaan**.
*(Catatan: Modul Berita & Edukasi telah dipindahkan ke Tier Selesai pada Sprint 11 Ticket I-9).*
Endpoint terkait (`/api/gamification/me`) kini menjawab **404**, bukan 501 — tidak ada lagi
yang melayaninya sejak `apps/server` dihapus. Banner `TierCStubBanner`
menampilkan status HTTP apa adanya.

## Pending — keamanan & operasional

- `S10-N-15` **Audit matriks RBAC** — PENDING. Guard per-peran sudah
  terpasang struktural, tetapi berkas matriks 4 peran × seluruh namespace
  tidak ada. `rbac.matrix.ts` pernah dihapus sebagai dead code (D6-4/D6-7)
  dan versi Naufal di `origin/pankop` belum pernah masuk ke jalur ini.
- **Enkripsi NIK (AES-GCM)** — PENDING. `packages/core` belum punya helper
  kripto; `ENCRYPTION_KEY` belum dipakai `apps/web`.
- `S10-B-14/15` **Deploy migrasi staging & smoke test VPS** — PENDING.
- Rekaman E2E Waqf penuh sebagai gate Day 4 belum dibuat.

---

## Bukti yang dapat dijalankan ulang

```bash
bun run check-types
bunx @biomejs/biome check ./
cd packages/core && bun test
cd ../../apps/web && bun test
```

Hasil terakhir pada HEAD `8f277b9`:

```text
packages/core :  24 pass / 0 fail   (6 berkas, ~120 ms — tanpa DB, tanpa bundler)
apps/web      :  82 pass / 0 fail   (16 berkas, ~5 s — butuh TEST_DATABASE_URL)
total         : 106 pass / 0 fail
check-types   :   3 successful packages (@amwal/core, wa-bot, web)
biome         :   0 errors
```

# Audit Gate Senin — Sprint 11

**Auditor:** Claude Pro (Tech Lead & Integration Lead)
**Tanggal:** Senin, 16 September 2026
**Acuan:** `SPRINT_BACKLOG.md` §S11.4–S11.5, `docs/sprint-11/PLAN.md` §3–§5
**Bukti:** `docs/sprint-11/status/*`, `git log origin/sprint-11`, PR #18–#21 & #23, `bun run check-types`, `bun test` di `packages/core`

## 0. Ringkasan eksekutif

**Gate Senin: TIDAK LULUS.** Dari 8 tiket yang dinilai, 5 lulus bersih, 1 lulus bersyarat, 2 tidak lulus.

> **Direvisi 17 September 2026.** Angka semula 4/2/2. `I-8` dinaikkan menjadi LULUS setelah temuan "agregasi tanpa uji" terbukti keliru — lihat kotak koreksi di §1.1.

Kesehatan workspace baik dan tidak menutupi masalah: `bun run check-types` hijau di 3/3 paket, `packages/core` **81 pass / 0 fail** di 15 berkas. Yang gagal bukan kualitas kode yang mendarat, melainkan **cakupan**: bagian paling berisiko dari dua tiket justru belum disentuh, dan pemegang tiket terbesar yang gagal adalah **saya sendiri**.

Dua temuan yang harus dibaca sebelum Selasa dimulai:

1. **Penghalang Selasa ada di berkas Claude Pro, bukan di lane manapun.** Sembilan agent menulis kernel di `packages/core`, tetapi `packages/core/package.json` hanya mengekspor `./storage/supabase` dan `./storage/mime`. Tidak ada `./time/*`, `./analytics/*`, `./gamification/*`, `./affiliate/*`. Artinya `apps/web` **secara teknis tidak bisa meng-import** hasil kerja Senin. Integrasi Selasa terhenti di berkas milik saya.
2. **Spike Mayar membatalkan tiga asumsi keputusan D5.** Rincian di `CONTRACT-CHANGES.md` entri 2026-09-16-01. Desain webhook yang tertulis di backlog dibuat dari dokumentasi Mayar; bukti lapangan berbeda.

---

## 1. Penilaian per tiket

| Agent | Tiket | Putusan | Dasar |
|---|---|---|---|
| Codex Bara | `I-7` | ✅ LULUS | kontrak + stub router + mount |
| Codex Bara | `I-8` | ✅ LULUS | `period.ts` teruji WIB; agregasi **juga teruji** — lihat koreksi §1.1 |
| Antigravity Bara | `S-2` | ✅ LULUS | kernel + uji + bukti sandbox live |
| Antigravity Bara | `I-2` | ✅ LULUS | DDL diajukan, pertanyaan tipe ditandai sendiri |
| Claude Code Bara | `I-1` | ❌ TIDAK LULUS | helper murni mendarat; **counter atomik belum ada** |
| Claude Code Bara | `I-11` | ✅ LULUS ISTIMEWA | bukti lapangan, membatalkan asumsi D5 |
| Claude Pro | `UI-Foundation` | ⚠️ LULUS BERSYARAT | recharts + skeleton ada; `aria-busy` tidak ada |
| Claude Pro | fondasi integrasi | ❌ TIDAK LULUS | `0004`, export, env, RBAC, stub router — nihil |

---

### 1.1 Codex Bara — `I-7` (kontrak analitik) & `I-8` (periode WIB)

**Mendarat:** `packages/core/src/analytics/period.ts`, fungsi agregasi murni, `packages/core/src/contracts/admin-analytics.ts`, dan `apps/web/src/lib/orpc/router/admin/analytics.ts` berisi tiga `adminProcedure` (`trend`, `accumulation`, `composition`) yang melempar `NOT_IMPLEMENTED` dengan `data: { tier: 'C' }`, sudah ter-mount di `admin/index.ts`.

**Diverifikasi:** `period.ts` benar-benar `import { wibParts } from '../time/wib'` — klaim batas bulan WIB bukan sekadar komentar. Validasi tahun 2020–2099 dan bulan 1–12 melempar `INVALID_ANALYTICS_YEAR` / `INVALID_ANALYTICS_MONTH`. Pola stub persis mengikuti disiplin Tier C yang berlaku di repo.

**Catatan positif:** guard `adminProcedure` dipasang sejak stub, bukan ditunda. Ini benar — stub yang lahir tanpa guard hampir selalu naik ke produksi tanpa guard.

> ### ⚠️ KOREKSI AUDIT — 17 September 2026
>
> Versi pertama audit ini menyatakan fungsi agregasi **"tidak punya uji sama sekali"** dan memberi `I-8` status LULUS BERSYARAT. **Pernyataan itu salah, dan putusannya saya naikkan menjadi LULUS.**
>
> Penyebabnya kesalahan metode saya: saya mencari *nama berkas* yang mengandung "aggregation", tidak menemukannya, lalu menyimpulkan tidak ada uji. Padahal `tests/analytics-period.test.ts` memuat blok `describe('@amwal/core/analytics/aggregation')` berisi tiga uji yang lulus. **Nama berkas bukan bukti cakupan uji.**
>
> Codex Bara dirugikan penilaian ini dan berhak atas koreksinya.
>
> Yang benar-benar belum tertutup bukan "agregasi tanpa uji", melainkan kasus batas: atribusi WIB, penyaringan di luar periode, dan jumlah hari Februari. Itu sudah ditutup `tests/analytics-aggregation.test.ts` (13 uji, **seluruhnya lulus pada eksekusi pertama**) — yang sekaligus membuktikan implementasi Codex Bara memang mengatribusi menurut WIB, bukan UTC. Implementasinya sudah benar sejak awal.

---

### 1.2 Antigravity Bara — `S-2` (storage) & `I-2` (DDL lampiran)

**Mendarat:** `packages/core/src/storage/supabase.ts` + `storage/mime.ts` dengan uji (`tests/storage-mime.test.ts`), diekspor di `packages/core/package.json`, plus bukti sandbox live: unggah HTTP 200, unduh via signed URL, verifikasi integritas magic-byte PNG 16 byte, pembersihan objek uji dilakukan.

**Penilaian:** ini standar bukti tertinggi yang diserahkan hari ini bersama `I-11`. Validasi magic byte (bukan sekadar percaya `Content-Type` dari klien) adalah keputusan keamanan yang benar dan tidak diminta eksplisit di tiket.

**`I-2`:** DDL `program_receipt_attachments` diajukan lengkap. Agent menandai sendiri keraguan `integer` vs `text` pada FK — ditandai, bukan ditebak diam-diam. **Verifikasi saya: `waqf_programs.id` dan `program_progress_reports.id` keduanya `text`.** Koreksi sudah diterapkan di draf `0004`; ini dihitung sebagai penyelarasan normal, bukan cacat.

**Tindakan kebersihan:** berkas status memuat signed URL penuh berikut project ref. URL-nya sudah kedaluwarsa (TTL 600 detik) sehingga bukan insiden, tetapi mulai Selasa berlaku aturan: **bukti sandbox di berkas status ditulis sebagai status + ukuran + hash, bukan URL bertanda tangan.**

---

### 1.3 Claude Code Bara — `I-1` (order ID 12 digit) & `I-11` (spike Mayar)

**`I-1` — TIDAK LULUS.**

Yang mendarat benar dan rapi: `ORDER_ID_V2_PATTERN`, `MODULE_TO_CODE`, `SUB_PROGRAM_CODES`, `formatOrderId()` (melempar `ORDER_SEQUENCE_INVALID` / `ORDER_SEQUENCE_EXHAUSTED` di atas 9999), `parseOrderId()`, dan `moduleFromOrderId()` versi baru yang memetakan `SEDEKAH → INFAQ` sambil tetap mengenali ID legacy `AMW-*` / `INF-*`. Semuanya teruji.

Yang tidak mendarat adalah **sumber nomornya**. Pencarian `order_sequences|transaction_id_counters|scope_key|nextOrderSequence` di seluruh repo tidak menemukan apa pun. Tidak ada tabel, tidak ada fungsi increment atomik, dan `service.ts` maupun `webhook.ts` tidak tersentuh.

Kriteria gate Senin berbunyi: *"20 order paralel → 20 nomor unik; nomor ke-10.000 ditolak."* Kriteria ini **tidak mungkin pernah dibuktikan** — keunikan di bawah konkurensi hanya bisa dijamin database, dan databasenya belum punya tabel. Yang selesai adalah pemformatan string; yang berisiko adalah alokasi nomor, dan itu belum dimulai.

**Cacat turunan yang menghalangi Selasa:** `packages/core/src/payment/webhook.ts` baris 39–53 masih menyimpan `moduleFromOrderId` privat versi legacy yang **tidak mengenali format v2**. Konsekuensi konkret: order dengan ID `800926000001` akan lolos saat dibuat, lalu gagal `Transaction not found` saat webhook masuk — yaitu gagal *setelah* donatur membayar. Ini harus diperbaiki sebelum uji end-to-end Selasa, bukan sesudahnya.

**`I-11` — LULUS ISTIMEWA.** Lihat §2.

---

### 1.4 Claude Pro — fondasi integrasi

Saya menilai pekerjaan saya sendiri dengan tolok ukur yang sama.

**`UI-Foundation` — LULUS BERSYARAT.** `recharts` masuk (commit `865cdc1`), `apps/web/src/components/ui/skeleton.tsx` dibuat memakai `cn` dan token `bg-muted` — token `--muted` terverifikasi ada di `globals.css` untuk tema terang dan gelap, jadi komponennya memang tampil. Namun DoD yang **saya sendiri tulis** menuntut `aria-busy` dan teks alternatif pembaca layar; versi yang mendarat tidak punya keduanya. Diperbaiki Selasa pagi.

**Fondasi integrasi — TIDAK LULUS.** Yang seharusnya siap Senin dan tidak ada satu pun:

| Item | Status | Akibat bila dibiarkan |
|---|---|---|
| Migrasi `0004` | tidak ada di ref mana pun; journal berhenti di `0003_sharp_silver_sable` | `I-1`, `I-2`, `I-10`, `I-4`, `I-6`, `I-9` tidak punya tabel |
| Export subpath `core` untuk `time`/`analytics`/`gamification`/`affiliate` | tidak ada | **`apps/web` tidak bisa meng-import kernel Senin** |
| Variabel env Sprint 11 di `apps/web/src/env/server.ts` | tidak ada | Mayar & Supabase Storage tidak terbaca aplikasi |
| Namespace RBAC baru di `rbac.matrix.ts` | masih 4 peran lama | prosedur baru tak bisa dijaga peran |
| `apps/web/src/lib/payment/on-settled.ts` | tidak ada | poin & afiliasi tak punya titik sambung |
| Stub router gamification / cms / affiliate / akad / certificate | tidak ada | 5 tiket tak punya permukaan |
| `docs/sprint-11/CONTRACT-CHANGES.md` | tidak ada | temuan spike tak punya kanal resmi — **dibuat hari ini** |

Baris kedua adalah yang paling merugikan. Sembilan agent menyerahkan kernel yang benar dan teruji, lalu tertahan di satu berkas manifest milik saya. Prioritas Selasa 08:00 saya: export + env + `0004`, sebelum apa pun yang lain.

---

## 2. Dampak spike Mayar terhadap keputusan D5

Bukti lapangan `I-11` bertentangan dengan dokumentasi yang menjadi dasar D5. Rincian dan revisi resmi ada di `CONTRACT-CHANGES.md`; ringkasnya:

| Asumsi D5 (dari dokumentasi) | Temuan lapangan |
|---|---|
| Tidak ada header token webhook | `x-callback-token` **ada**, hex 128 karakter, cocok persis dengan `MAYAR_WEBHOOK_TOKEN` |
| `data.status` boolean | string `"SUCCESS"` |
| `data.transactionStatus` menandai hasil | bernilai `"created"` bahkan pada event `payment.received` — **tidak boleh dipakai sebagai penentu** |
| Base URL `api.mayar.id` | `https://api.mayar.io/hl/v1` (buat pembayaran) dan `/hl/v2` (payment link / webhook) |

Dua hal tidak berubah dan tetap wajib: **tetap re-fetch status dari server Mayar** (payload tidak pernah menjadi sumber kebenaran), dan **tetap bandingkan `x-callback-token` secara constant-time**.

Satu keterbatasan operasional dicatat agent dan perlu diketahui semua orang: request pembayaran V1 **tidak bisa disimulasikan** lewat jalur sandbox V2 (checkout GraphQL membalas 404). Simulasi hanya jalan lewat transaksi payment-link. Uji end-to-end Selasa harus dirancang di sekitar batas ini.

Order ID v2 `800926000001` sudah berhasil dipakai pada panggilan nyata — format v2 terbukti diterima Mayar.

---

## 3. Status migrasi `0004`

Draf lengkap: **`docs/sprint-11/0004_consolidated_sprint11.draft.sql`**. Belum diterapkan ke database mana pun, sesuai instruksi.

Isi konsolidasi: `order_sequences` (`I-1`), `program_receipt_attachments` (`I-2`, FK dikoreksi ke `text`), kolom idempotensi ledger poin (`I-10`), tiga tabel afiliasi (`I-4`), tabel akad berversi (`I-6`), dan kolom CMS aditif (`I-9`).

Tiga keputusan yang perlu diketahui tim:

- **SQL ini adalah artefak review, bukan migrasi.** Migrasi final wajib lahir dari `db:generate` setelah `schema.ts` diubah, supaya journal dan snapshot tetap konsisten. SQL tulis tangan tanpa snapshot merusak `drizzle-kit check` — pelajaran dari pemulihan `0003`.
- **Index waktu `S-3` sengaja dikeluarkan.** `CREATE INDEX CONCURRENTLY` dilarang di dalam transaksi, sedangkan Drizzle membungkus tiap migrasi dalam satu transaksi. Tanpa `CONCURRENTLY`, `CREATE INDEX` biasa akan mengunci tulis tabel transaksi — dan database ini masih dilayani aplikasi Next.js lama. Dijalankan manual di luar jam sibuk, dengan verifikasi `pg_index WHERE NOT indisvalid` sesudahnya.
- **Seluruhnya aditif** sehingga lolos `scripts/guard-destructive-sql.mjs`, dan `status` CMS memakai `text + CHECK` alih-alih nilai enum baru (Rule 6) karena Prisma aplikasi lama akan melempar error saat menemui nilai enum asing.

---

## 4. Temuan di luar tiket

**PR #22 (`sprint-11` → `main`, OPEN, +2338/−179, 25 berkas).** Rencana menetapkan `main` hanya menerima `sprint-11` setelah audit manusia hari Kamis. PR ini terbuka di tengah sprint dengan `mergeState: CLEAN` — artinya satu klik dapat mendorong Sprint 11 setengah jadi ke `main`: order ID v2 tanpa counter, webhook yang belum mengenali format baru, dan tanpa `0004` sehingga tabelnya tidak ada.

**Rekomendasi: ubah PR #22 menjadi draft sampai Kamis.** Bukan ditutup — riwayat review-nya berguna; cukup dikunci agar tidak bisa di-merge tanpa sengaja.

**Sisa konfigurasi lama:** `apps/web/src/env/client.ts` masih memberi `VITE_API_URL` default `http://localhost:3001`, port server yang sudah dibongkar sejak Putaran 17. Tidak berbahaya, tetapi menyesatkan agent baru. Dibersihkan bersamaan penambahan env Sprint 11.

---

## 5. Evaluasi alur kerja Git — usulan branch `bara` tunggal

### 5.1 Koreksi pengukuran

Pengukuran awal saya keliru dan saya batalkan sendiri. Membandingkan tiap branch lane terhadap *merge-base dengan `origin/main`* menghasilkan "20 berkas bertumpang tindih" — angka itu **artefak** dan tidak boleh dipakai sebagai bukti.

Pengukuran yang benar adalah terhadap `origin/sprint-11`:

```
git log origin/sprint-11..origin/claude-code/bara   → kosong
git log origin/sprint-11..origin/codex/bara         → kosong
git log origin/sprint-11..origin/antigravity/bara   → kosong
```

**Ketiga branch lane Bara tidak punya commit unik — semuanya sudah ter-merge penuh.** Tumpang tindih nyata antar agent lane Bara hari Senin: **nol**. Tidak ada konflik yang dilaporkan di PR #19, #20, #21, #23. `bun.lock` disentuh tepat satu commit (`865cdc1`, Claude Pro/recharts) dan `packages/core/package.json` oleh satu commit (`b44a984`, Antigravity Bara).

### 5.2 Penilaian terhadap tiga kriteria

**Single File Ownership (PLAN §3).** Kepemilikan ditegakkan oleh *matriks*, bukan oleh nama branch — menggabungkan branch tidak melanggar aturan itu sendiri. Yang hilang adalah **mekanisme pemeriksaannya**: diff PR per-lane selama ini adalah audit kepemilikan termurah yang kita punya. Kehilangan itu harus diganti, bukan diabaikan.

**Konflik `bun.lock` dan merge race.** Risiko nyata pada branch bersama adalah push non-fast-forward, bukan konflik isi. `bun.lock` adalah berkas generated yang tidak punya merge yang masuk akal — tetapi bukti menunjukkan lane agent memang tidak pernah menyentuhnya. Risikonya dapat dihilangkan dengan aturan, bukan dengan struktur branch.

**DX vs blast radius.** Keuntungan nyata: tiga agent lane Bara justru **berpasangan erat** — `I-1` dan `I-2` sama-sama bermuara ke `0004`, dan kernel storage Antigravity langsung dipakai lampiran kuitansi. Branch tunggal menghapus rebase silang untuk `packages/core` dan mempercepat hand-off dalam lane. Biayanya: satu commit rusak memblokir tiga agent sekaligus, granularitas `git bisect` dan revert hilang, dan satu force-push dapat menghapus kerja dua agent lain.

### 5.3 Rekomendasi

**Ya — branch `bara` tunggal disetujui mulai Selasa**, dengan lima aturan yang tidak boleh dilonggarkan.

Alasannya: kopling di dalam lane Bara memang tinggi, ketiga branch saat ini sudah nol divergensi sehingga biaya pindah nol, dan model jendela merge 12:00/16:30 sudah menserialkan integrasi. Struktur tiga branch membeli isolasi yang, secara terukur, tidak dipakai.

1. **`git pull --rebase origin bara` sebelum setiap push.** Tidak ada `--force` maupun `--force-with-lease` di `bara`, tanpa kecuali.
2. **Setiap commit diberi prefiks subjek** `[claude-code]`, `[codex]`, atau `[antigravity]`, supaya atribusi dan `git blame` tetap terbaca setelah branch digabung.
3. **Matriks kepemilikan tetap mengikat per berkas.** Pemeriksaan kepemilikan dijalankan sebelum push, menggantikan audit diff PR per-lane yang hilang.
4. **Hanya Claude Pro yang menyentuh `bun.lock` dan `package.json` mana pun.** Lane agent yang butuh dependensi mengajukannya di berkas statusnya.
5. **Satu PR `bara` → `sprint-11` per jendela merge**, dan branch wajib hijau (`check-types` + uji `packages/core`) saat PR dibuka. Commit yang merusak branch diperbaiki maju oleh yang merusak — tidak ada reset.

**Yang tidak disetujui:** memperluas pola ini menjadi satu branch untuk semua lane. Kopling antar-lane Naufal dan Awan jauh lebih rendah sehingga keuntungannya kecil, sementara blast radius melompat dari 3 agent menjadi 10. Lane Naufal dan Awan tetap pada branch masing-masing.

---

## 6. Prioritas Selasa 08:00

Berurutan, karena saling menghalangi:

1. **Claude Pro** — export subpath `packages/core/package.json` (`time`, `analytics`, `gamification`, `affiliate`). Membuka jalan bagi 9 agent lain.
2. **Claude Pro** — `schema.ts` + `db:generate` → `0004`, terapkan ke DB uji per-agent lebih dulu, bukan ke sandbox bersama.
3. ~~**Claude Code Bara** — `nextOrderSequence()` atomik di atas `order_sequences`~~ — **fungsinya sudah mendarat** (Claude Pro, 17 Sep, atas arahan pemilik sprint) di `@amwal/core/payment/order-sequence`. **Sisa:** menyambungkannya ke `createPayment()`, dan membuktikan 20 order paralel serta penolakan ke-10.000 terhadap database uji lewat `verify-0004.ts`.
4. ~~**Claude Code Bara** — hapus `moduleFromOrderId` privat di `webhook.ts`~~ — **SELESAI** 17 Sep. `webhook.ts` kini memakai versi v2-aware dari `order-id.ts`, sehingga order v2 tidak lagi gagal `Transaction not found` setelah donatur membayar.
5. **Claude Pro** — env Sprint 11, RBAC, `on-settled.ts`, lima stub router.
6. **Codex Bara** — sambungkan query nyata ke agregasi. Prasyarat uji murni **sudah terpenuhi sejak Senin**; butir ini lahir dari temuan yang keliru dan sudah ditarik (§1.1).
7. **Claude Pro** — `aria-busy` + teks pembaca layar di `skeleton.tsx`.
8. **Naufal** — ubah PR #22 menjadi draft.

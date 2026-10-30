# Status & Laporan Eksekusi — Claude Code Awan

**Lane:** 🟡 Awan (Konten, Akad, Antarmuka Publik)  
**Tugas Utama:**
- `I-6` Template Akad Dinamis (D3) — Seluruh tumpukan: Kontrak Zod, pure `sha256Body`, kernel database (`getActive`, `publishVersion`, `activate`, `recordAkadAcceptance`), router oRPC (`akad` dan `admin.akad`), validasi versi basi 409 pada router order donasi (`waqf`, `zakat`, `qurban`, `infaq`), komponen publik `AkadCheckbox`, dan halaman admin `AkadManagementView` (`/admin/akad`).
- `I-3` Penempatan Komponen Tombol Bagikan pada halaman publik.
- Status gate & inventaris redaksi akad UI.

---

## 1. Inventaris Redaksi Akad yang Sudah Tampil di UI (Seed Versi 1)

Sesuai aturan PLAN §D3 ("Agent dilarang mengarang teks akad baru. Modul yang belum punya redaksi di UI diisi `is_active = false` sampai admin mengaktifkannya"):

| Modul | Status di UI | Sumber / Berkas UI | Redaksi Persis / Judul |
|---|---|---|---|
| `QURBAN` | **Tersedia (Aktif)** | `apps/web/src/components/qurban/qurban-detail.tsx` (L319–324) | **Judul:** Akad Wakalah Qurban<br>**Body:** `Saya menunjuk Amwal/Yayasan sebagai wakil untuk membeli, memotong, dan mendistribusikan hewan qurban untuk paket yang dipilih sesuai syariat.` |
| `WAKAF` | Belum ada di UI lama | Disediakan melalui admin publikasi | `is_active = false` sampai admin menerbitkan & mengaktifkan via `/admin/akad` |
| `ZAKAT` | Belum ada di UI lama | Disediakan melalui admin publikasi | `is_active = false` sampai admin menerbitkan & mengaktifkan via `/admin/akad` |
| `INFAQ` | Belum ada di UI lama | Disediakan melalui admin publikasi | `is_active = false` sampai admin menerbitkan & mengaktifkan via `/admin/akad` |
| `SEDEKAH` | Belum ada di UI lama | Disediakan melalui admin publikasi | `is_active = false` sampai admin menerbitkan & mengaktifkan via `/admin/akad` |

---

## 2. Artefak Kode yang Telah Selesai

### 2.1 Contracts & Core Package (`packages/core`)
- `packages/core/src/contracts/akad.ts`: Skema Zod `akadModuleSchema`, `publishAkadSchema`, `activateAkadSchema`, `akadAcceptanceInputSchema` dan tipe TypeScript.
- `packages/core/src/akad/sha256.ts`: Fungsi murni `sha256Body(body: string): string` dengan normalisasi CRLF (`\r\n` $\to$ `\n`) dan pemotongan spasi ujung.
- `packages/core/src/akad/service.ts`:
  - `getActive(db, module)`: Mengambil templat akad aktif.
  - `getVersions(db, module)`: Mengambil seluruh riwayat versi per modul (terurut dari versi terbaru).
  - `publishVersion(db, input)`: Atomik `nextVersion = max(version) + 1` dalam transaksi Drizzle (append-only).
  - `activate(db, input)`: Menukar status aktif modul secara atomik (hanya 1 aktif per modul, ditegakkan indeks unik DB).
  - `recordAkadAcceptance(tx, input)`: Mencatat bukti persetujuan donatur ke tabel `akad_acceptances`.
- `packages/core/src/akad/index.ts`: Re-export pustaka akad.
- `packages/core/package.json`: Export subpath `./akad` dan `./akad/*`.
- `packages/core/tests/akad.test.ts`: 9 unit test mencakup skema Zod, determinisme hash, normalisasi CRLF, dan isolasi string.

### 2.2 Backend oRPC & Order Flow (`apps/web`)
- `apps/web/src/lib/orpc/router/akad.ts`: Prosedur publik `akad.active({ module })`.
- `apps/web/src/lib/orpc/router/admin/akad.ts`: Prosedur admin `admin.akad.list`, `admin.akad.publishVersion`, `admin.akad.activate` (dilindungi `adminProcedure`).
- `apps/web/src/lib/orpc/router/admin/index.ts`: Pemasangan `admin.akad` di bawah namespace `admin`.
- `apps/web/src/lib/orpc/router/{waqf,zakat,qurban,infaq}.ts`:
  - Validasi keberadaan akad aktif.
  - Penolakan 400 Bad Request jika ada akad aktif tetapi tidak disetujui.
  - Penolakan 409 Conflict jika versi basi (`version` tidak cocok) atau isi redaksi telah dimodifikasi (`bodySha256` tidak cocok).
  - Pencatatan bukti persetujuan donasi hukum ke `akad_acceptances` setelah anchor transaksi terbuat.
- `apps/web/tests/orpc/akad.test.ts`: 4 test suite integrasi (33 assertions) mencakup RBAC guard, publish/list/activate cycle, uji invarian hukum (aktivasi versi baru tidak mengubah bukti `body_sha256` donasi lama), dan verifikasi 409 conflict saat checkout dengan versi basi.

### 2.3 Frontend & UI Integration (`apps/web`)
- `apps/web/src/lib/amwal-api/akad.ts`: Adapter typed client untuk oRPC akad.
- `apps/web/src/components/akad/akad-checkbox.tsx`: Komponen checkbox dinamis dengan Skeleton loading `aria-busy`, peninjauan teks redaksi, dan perhitungan hash `sha256Body`.
- `apps/web/src/components/wakaf/waqf-donate-form.tsx`: Integrasi `AkadCheckbox` modul `WAKAF` + penanganan error versi basi.
- `apps/web/src/components/qurban/qurban-detail.tsx`: Integrasi `AkadCheckbox` modul `QURBAN` di dalam `WakalahModal`.
- `apps/web/src/components/infaq/infaq-view.tsx`: Integrasi `AkadCheckbox` modul `INFAQ` pada donasi infaq & sedekah.
- `apps/web/src/components/admin/akad/akad-management-view.tsx`: Halaman dasbor admin untuk pratinjau redaksi, penerbitan versi baru, dan dialog konfirmasi aktivasi versi akad.
- `apps/web/src/routes/admin/akad.tsx`: Rute TanStack Router `/admin/akad`.
- `apps/web/src/components/wakaf/waqf-detail.tsx`: Penempatan tombol bagikan (`I-3`).

---

## 3. Bukti Verifikasi & Hasil Tes

### 3.1 Tes Unit & Kontrak Core
```bash
$ bun test packages/core/tests/akad.test.ts
✓ akad contracts & schemas > validates all 5 supported modules [2.10ms]
✓ akad contracts & schemas > validates publish input trimming and constraints [1.52ms]
✓ akad contracts & schemas > validates activate schema [0.96ms]
✓ akad contracts & schemas > validates akad acceptance input schema [1.11ms]
✓ sha256Body > produces a valid 64-character lowercase hex hash [0.42ms]
✓ sha256Body > is deterministic for identical input [0.06ms]
✓ sha256Body > normalizes CRLF and LF to produce identical hash [0.06ms]
✓ sha256Body > normalizes leading and trailing whitespace [0.03ms]
✓ sha256Body > different text produces different hash [0.03ms]

 9 pass, 0 fail (22 expect calls)
```

### 3.2 Tes Integrasi oRPC & Invarian Hukum
```bash
$ DATABASE_URL="postgresql://postgres:postgres@localhost:5432/amwal_bun_s11_claude_awan_test" bun test apps/web/tests/orpc/akad.test.ts
✓ oRPC Akad & Dynamic Templates (Sprint 11, I-6) > admin.akad.* rejects unauthenticated callers and non-ADMIN roles [8.36ms]
✓ oRPC Akad & Dynamic Templates (Sprint 11, I-6) > publishes, lists, and activates akad versions per module [75.97ms]
✓ oRPC Akad & Dynamic Templates (Sprint 11, I-6) > invariant: activating a new version does not alter previously recorded acceptances [60.42ms]
✓ oRPC Akad & Dynamic Templates (Sprint 11, I-6) > order creation detects stale akad version or hash mismatch with 409 CONFLICT [70.17ms]

 4 pass, 0 fail (33 expect calls)
```

### 3.3 Serah Terima ke Lane Lain (§S11.4.0)
- **`recordAkadAcceptance()`**: Siap di `@amwal/core/akad`, dapat dipanggil dalam transaksi anchor oleh `packages/core/src/payment/service.ts` (Claude Code Bara).
- **Seed Versi 1**: Redaksi qurban siap dari inventaris UI di atas.

import { z } from 'zod';

/**
 * Gamification oRPC contracts (Sprint 11, I-10b — Zone 1). Frozen Monday
 * 13:00 WIB; changes only through `docs/sprint-11/CONTRACT-CHANGES.md`.
 *
 * Wire shapes only — the point arithmetic lives in `@amwal/core/gamification`
 * (Zone 0, I-10) and is deliberately not duplicated here. Every award is one
 * `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`, so each activity owns
 * exactly one idempotency key (PLAN §D2, §D6):
 *
 *   Daftar akun       +1000  `register:{userId}`
 *   Check-in harian     +50  `checkin:{userId}:{YYYY-MM-DD WIB}`
 *   Kuis lulus         +100  `quiz:{userId}:{quizId}` — sekali per kuis
 *   Baca artikel        +50  `read:{userId}:{contentId}` — dwell ≥ 30 detik
 *   Tonton video        +50  `watch:{userId}:{contentId}` — dipotong pertama
 *   Transaksi LUNAS    +200  `txn:{transactionId}` (D2)
 *   Nominal transaksi  +⌊Rp/1.000⌋  `txnamt:{transactionId}` (D2)
 *   Tidak check-in      −20  `penalty:{userId}:{YYYY-MM-DD WIB}` — floor 0,
 *                            maksimal 7 hari ke belakang
 *
 * Poin bersifat non-moneter: tidak ada prosedur, kolom, atau UI yang
 * mengonversinya ke rupiah.
 */

/** Baris ledger yang boleh ditulis kernel; kunci idempotensi ada di atas. */
export const GAMIFICATION_ACTIVITY_TYPES = [
  'REGISTER',
  'CHECKIN',
  'QUIZ',
  'READ',
  'WATCH',
  'TRANSACTION',
  'AFFILIATE',
  'PENALTY',
] as const;

export type GamificationActivityType =
  (typeof GAMIFICATION_ACTIVITY_TYPES)[number];

/**
 * `gamification.checkIn` — sengaja tanpa input klien. Tanggal check-in selalu
 * `YYYY-MM-DD` zona Asia/Jakarta dari `wibParts()` di server, sehingga jam
 * perangkat yang dimajukan tidak bisa mengklaim streak hari lain.
 */
export const checkInSchema = z.object({});

/**
 * `gamification.summary` — saldo poin pengguna sesi. Penalti diselesaikan
 * malas (lazy) di sini lewat `settlePenalties()` yang sama dengan sweep
 * `POST /api/cron/streak`.
 */
export const pointsSummarySchema = z.object({});

/** `gamification.history` — riwayat baris ledger milik pengguna sesi. */
export const pointHistorySchema = z.object({
  limit: z
    .number()
    .int('Limit harus bilangan bulat')
    .min(1, 'Limit minimal 1')
    .max(100, 'Limit maksimal 100')
    .default(20),
  cursor: z.string().min(1).optional(),
});

/** `gamification.claimQuiz` — +100, sekali per kuis per pengguna. */
export const claimQuizSchema = z.object({
  quizId: z.string().trim().min(1, 'quizId wajib diisi'),
});

/** `gamification.claimRead` — +50, hanya bila dwell ≥ 30 detik. */
export const claimReadSchema = z.object({
  contentId: z.string().trim().min(1, 'contentId wajib diisi'),
  dwellSeconds: z
    .number()
    .int('Durasi baca harus bilangan bulat detik')
    .min(30, 'Durasi baca minimal 30 detik'),
});

/** `gamification.claimWatch` — +50 per konten; item potong pertama (§6). */
export const claimWatchSchema = z.object({
  contentId: z.string().trim().min(1, 'contentId wajib diisi'),
});

/**
 * `gamification.submitQuizAttempt` — [Sprint 11.1, remediasi `I-10b`].
 * Ditambahkan setelah code freeze Sprint 11: `claimQuiz` di atas hanya
 * membaca percobaan yang lulus, tidak pernah ada prosedur yang menulisnya,
 * sehingga "+100 XP" di UI kuis edukasi murni tampilan.
 *
 * Server menilai `answers` sendiri (lihat `@amwal/core/education/asnaf-quiz`)
 * dan menulis skornya ke `quiz_attempts` — klien tidak pernah mengirim skor
 * jadi, supaya panggilan oRPC langsung tidak bisa memalsukan kelulusan.
 * Perubahan kontrak dicatat di `docs/sprint-11/CONTRACT-CHANGES.md`.
 */
export const submitQuizAttemptSchema = z.object({
  quizId: z.string().trim().min(1, 'quizId wajib diisi'),
  answers: z.record(z.string(), z.string()),
});

export const submitQuizAttemptResultSchema = z.object({
  quizId: z.string(),
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  percentage: z.number().int().min(0).max(100),
  passed: z.boolean(),
});

/**
 * Bentuk baris award yang ditulis kernel — bukan prosedur publik.
 * `idempotencyKey` UNIQUE di database (migrasi `0004`); itulah yang membuat
 * webhook yang dikirim dua kali tidak pernah memberi poin dua kali.
 */
export const awardPointsSchema = z.object({
  userId: z.string().trim().min(1, 'userId wajib diisi'),
  activityType: z.enum(GAMIFICATION_ACTIVITY_TYPES),
  idempotencyKey: z.string().trim().min(1, 'Kunci idempotensi wajib diisi'),
  /** Negatif hanya untuk penalti; nilainya dihitung kernel, bukan klien. */
  points: z.number().int('Poin harus bilangan bulat'),
  sourceRef: z.string().trim().min(1).optional(),
});

/**
 * Hasil klaim yang eksplisit — `I-10b`. Klaim ulang **bukan** error: UI yang
 * terlanjur mengirim dua kali harus tetap bisa menampilkan hasil yang benar,
 * jadi bentuknya nilai kembalian, bukan `ORPCError`.
 */
export const GAMIFICATION_CLAIM_STATUSES = [
  'CLAIMED',
  'ALREADY_CLAIMED',
  'NOT_ELIGIBLE',
  'DWELL_TOO_SHORT',
] as const;

export type GamificationClaimStatus =
  (typeof GAMIFICATION_CLAIM_STATUSES)[number];

/**
 * Bentuk respons prosedur (didefinisikan di sini supaya router, UI, dan tes
 * memakai satu sumber). Saldo selalu bilangan bulat non-negatif — penalti
 * dijepit di 0 oleh kernel, bukan oleh pemanggil.
 */
export const pointsSummaryResultSchema = z.object({
  saldo: z.number().int().min(0),
  sudahCheckInHariIni: z.boolean(),
  streakHari: z.number().int().min(0),
});

export const pointLedgerEntrySchema = z.object({
  id: z.string(),
  activityType: z.string(),
  points: z.number().int(),
  /** ISO instant; UI menampilkannya dalam WIB. */
  createdAt: z.string(),
});

export const pointsHistoryResultSchema = z.object({
  items: z.array(pointLedgerEntrySchema),
  nextCursor: z.string().nullable(),
});

export const checkInResultSchema = pointsSummaryResultSchema.extend({
  /** `false` = hari ini sudah pernah check-in; poin tidak ditambah lagi. */
  awarded: z.boolean(),
  points: z.number().int(),
});

export const claimResultSchema = z.object({
  status: z.enum(GAMIFICATION_CLAIM_STATUSES),
  awarded: z.boolean(),
  points: z.number().int(),
  saldo: z.number().int().min(0),
});

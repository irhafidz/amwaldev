import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Server-only environment contract for the fullstack `apps/web` (Putaran 17
 * — oRPC monolith realignment, Batch 0).
 *
 * This module must NEVER be imported from a route `component` — only from a
 * `createServerFn(...).handler(...)` body or a `routes/api/*` server route.
 * Both are stripped from the client bundle by TanStack Start's compiler; a
 * direct component import would leak these values into the browser bundle.
 *
 * The schema below covers Batch 0 (DB + JWT verification), Batch 2 (the
 * oRPC auth router's cookie `secure` flag), Batch 3 (`PAYMENT_*`, ported
 * from `apps/server/src/env.ts` for the waqf/zakat/qurban/infaq order-
 * creation procedures and the payment webhook route), and Batch 4
 * (`INTERNAL_SECRET`/`BAILEYS_SERVICE_URL`, for the admin.settings Baileys
 * status/QR proxy). `ENCRYPTION_KEY` is still unused in `apps/web` and
 * lands in a later batch — see docs/PUTARAN-17.md.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PAYMENT_PROVIDER: z.enum([
      'MOCK_SANDBOX',
      'MIDTRANS_SANDBOX',
      'MIDTRANS_PRODUCTION',
      'MAYAR_SANDBOX',
      'MAYAR_PRODUCTION',
    ]),
    /**
     * Midtrans / Mock payment server key.
     * Optional because Mayar uses its own credentials.
     * Enforced fail-fast at runtime in lib/payment/index.ts when PAYMENT_PROVIDER is MIDTRANS_* or MOCK_*.
     */
    PAYMENT_SERVER_KEY: z.string().optional(),
    /**
     * Sprint 11 [I-11]. Opsional di skema karena hanya wajib saat
     * `PAYMENT_PROVIDER` bernilai `MAYAR_*`; syarat itu ditegakkan fail-fast di
     * `lib/payment/index.ts` saat provider dibuat, bukan saat boot, supaya
     * deployment MOCK/MIDTRANS tidak dipaksa mengisi rahasia Mayar.
     */
    MAYAR_API_KEY: z.string().min(1).optional(),
    /**
     * Nilai yang Mayar kirim pada header `x-callback-token` di setiap webhook.
     * Mayar tidak memakai tanda tangan HMAC; token inilah yang dicocokkan
     * (constant-time) sebelum payload disentuh.
     */
    MAYAR_WEBHOOK_SECRET: z.string().min(1).optional(),
    /**
     * Akar API Mayar. Produksi `https://api.mayar.id/hl/v1`, sandbox
     * `https://api.mayar.io/hl/v1`. Boleh dengan atau tanpa akhiran
     * `/hl/v1` / `/hl/v2`; factory selalu memakai v2, satu-satunya versi yang
     * bisa membatasi pembayaran ke QRIS.
     */
    MAYAR_BASE_URL: z.string().url().optional(),
    /** @deprecated Nama lama untuk `MAYAR_WEBHOOK_SECRET`; masih dibaca. */
    MAYAR_WEBHOOK_TOKEN: z.string().min(1).optional(),
    /** @deprecated Nama lama untuk `MAYAR_BASE_URL`; masih dibaca. */
    MAYAR_API_BASE_URL: z.string().url().optional(),
    /**
     * Sprint 11 (`I-10b`, `I-11`) — shared bearer token / secret for cron jobs:
     * `POST /api/cron/payments-reconcile` and `POST /api/cron/streak`.
     * Optional in the schema: an environment without it simply cannot run the
     * sweeps (the routes answer 401), which is the fail-closed direction.
     */
    CRON_SECRET: z
      .string()
      .min(8, 'CRON_SECRET must be at least 8 characters')
      .optional(),
    /**
     * Sprint 11.1 — remediasi keamanan (AMW-02 / S10-N-01). Sebelumnya
     * punya `.default('amwal-dev-wa-secret')`, sehingga deployment yang
     * lupa mengisi env tetap boot dengan secret publik yang sama dengan
     * fallback di `apps/wa-bot`. Sekarang **wajib** — schema ini melempar
     * saat modul diimpor jika env tidak diisi, di produksi maupun dev,
     * supaya kesalahan konfigurasi kelihatan saat boot, bukan diam-diam
     * memakai secret yang bisa ditebak siapa pun yang membaca kode ini.
     */
    INTERNAL_SECRET: z
      .string()
      .min(16, 'INTERNAL_SECRET must be at least 16 characters'),
    BAILEYS_SERVICE_URL: z
      .string()
      .url('BAILEYS_SERVICE_URL must be a valid URL')
      .default(process.env.WA_BOT_URL || 'http://localhost:3005'),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
    /**
     * `amwal-rag` service (retrieval-augmented answers with cited sources). The
     * default is its Docker service name on the Dokploy network. Without
     * RAG_API_KEY the Ask-AI chat falls back to the plain DeepSeek path.
     */
    RAG_SERVICE_URL: z.string().url().default('http://amwal-rag-mfbjtj:8000'),
    RAG_API_KEY: z.string().min(1).optional(),
    /** The service's own deadline is 60 s; this leaves a little headroom. */
    RAG_TIMEOUT_MS: z.coerce.number().int().positive().default(70_000),
    ENCRYPTION_KEY: z
      .string()
      .min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
    /**
     * Public origin of this app (`https://amwal.id`): the payment return URL
     * Mayar sends donors back to, and the certificate QR target
     * (`<origin>/verifikasi/<nomor>`). Deliberately NO default — a localhost
     * default once sent production donors to `localhost:3000` after paying.
     * Resolved by `lib/public-url.ts` (this → APP_URL → NEXT_PUBLIC_APP_URL →
     * x-forwarded-* headers → localhost outside production only).
     */
    PUBLIC_APP_URL: z.string().url().optional(),
    APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    /**
     * Outgoing mail (password-reset OTP). All optional: without SMTP_HOST the
     * app still boots and the reset flow answers generically but sends
     * nothing (outside production the code is printed to the server log).
     * For Gmail use smtp.gmail.com:587 with an App Password as SMTP_PASSWORD.
     */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),
    /**
     * Letterhead/signatory printed on certificates. All optional: an unset
     * value simply leaves that line off, so a fresh deployment never shows
     * another institution's name.
     */
    CERTIFICATE_INSTITUTION_ADDRESS: z.string().min(1).optional(),
    CERTIFICATE_CITY: z.string().min(1).optional(),
    CERTIFICATE_SIGNER_NAME: z.string().min(1).optional(),
    CERTIFICATE_SIGNER_TITLE: z.string().min(1).optional(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});

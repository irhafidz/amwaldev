import { ORPCError } from '@orpc/server';
import { clientIp } from '@/lib/auth/login-throttle';
import { createRateLimiter } from '@/lib/auth/rate-limit';

/**
 * Batas Tanya Amwal untuk TAMU (QA-09). Tamu tidak punya akun yang bisa
 * dibatasi, jadi tiga lapis menjaga biaya token LLM: lonjakan per IP, kuota
 * harian per IP, dan plafon harian untuk seluruh tamu (menahan pemakai yang
 * berganti IP). Donatur yang login tetap memakai batas per-akun di `send`.
 *
 * ponytail: per proses dan per IP (`x-forwarded-for`, best-effort di balik
 * proxy); pindah ke penyimpanan bersama bila aplikasi di-scale ke banyak instans.
 */
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const burst = createRateLimiter({ max: 5, windowMs: 10 * MINUTE_MS });
const daily = createRateLimiter({ max: 20, windowMs: DAY_MS });
const everyone = createRateLimiter({ max: 1000, windowMs: DAY_MS });

const BURST_MESSAGE =
  'Terlalu banyak pertanyaan dalam waktu singkat. Tunggu beberapa menit, atau masuk ke akun Anda.';
const DAILY_MESSAGE =
  'Kuota pertanyaan tamu hari ini habis. Masuk ke akun Anda untuk melanjutkan, atau coba lagi besok.';

export function assertGuestAskAllowed(request: Request): void {
  const ip = clientIp(request);
  if (!burst.allow(ip)) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: BURST_MESSAGE });
  }
  if (!(daily.allow(ip) && everyone.allow('all'))) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: DAILY_MESSAGE });
  }
}

/** Hook tes: lupakan semua hitungan. */
export function resetGuestAskLimits(): void {
  burst.reset();
  daily.reset();
  everyone.reset();
}

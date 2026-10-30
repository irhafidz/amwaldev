import { ORPCError } from '@orpc/server';
import { clientIp } from '@/lib/auth/login-throttle';
import { createRateLimiter } from '@/lib/auth/rate-limit';

/**
 * Batas pembuatan order oleh TAMU (QA-04): mencegah spam pesanan dan
 * pemborongan slot qurban fiktif. Donatur yang login tidak dibatasi di sini.
 *
 * ponytail: per proses dan per IP (`x-forwarded-for`, best-effort di balik
 * proxy), jadi hanya penghalang pertama. Batas per nomor WhatsApp yang
 * bertahan di DB ditambahkan di router qurban.
 */
const WINDOW_MS = 60 * 60 * 1000;

// Longgar: satu IP kampus/kantor dipakai banyak donatur sah sekaligus.
const LIMITERS = {
  zakat: createRateLimiter({ max: 20, windowMs: WINDOW_MS }),
  qurban: createRateLimiter({ max: 10, windowMs: WINDOW_MS }),
} as const;

export type GuestOrderKind = keyof typeof LIMITERS;

export function assertGuestOrderAllowed(
  request: Request,
  kind: GuestOrderKind
): void {
  if (!LIMITERS[kind].allow(clientIp(request))) {
    throw new ORPCError('TOO_MANY_REQUESTS', {
      message:
        'Terlalu banyak pesanan dari jaringan ini. Coba lagi dalam satu jam, atau masuk ke akun Anda.',
    });
  }
}

/** Hook tes: lupakan semua hitungan. */
export function resetGuestOrderLimits(): void {
  for (const limiter of Object.values(LIMITERS)) {
    limiter.reset();
  }
}

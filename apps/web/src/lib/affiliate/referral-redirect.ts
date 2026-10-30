/**
 * [I-4] Target redirect diwajibkan path relatif satu-garis-miring saja —
 * `/`, `/wakaf/abc123`, dst. Apa pun berawalan skema (`https:`,
 * `javascript:`), berawalan `//` (protokol-relatif, browser
 * memperlakukannya sebagai origin lain), atau memuat backslash ditolak.
 * Ini yang membuat rute `/r/$kode` aman dari open redirect — bukan daftar
 * prefiks modul yang harus disinkronkan tiap kali ada halaman baru.
 */
const SAFE_RELATIVE_PATH = /^\/(?!\/)[\w/-]*$/;

export const DEFAULT_REFERRAL_REDIRECT_TARGET = '/';

export function resolveReferralRedirectTarget(
  rawTarget: string | null
): string {
  const trimmed = rawTarget?.trim();
  if (!trimmed) {
    return DEFAULT_REFERRAL_REDIRECT_TARGET;
  }
  return SAFE_RELATIVE_PATH.test(trimmed)
    ? trimmed
    : DEFAULT_REFERRAL_REDIRECT_TARGET;
}

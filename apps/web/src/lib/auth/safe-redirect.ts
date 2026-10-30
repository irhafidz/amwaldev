/** `//host` dan `/\host` dibaca browser sebagai host lain. */
const PROTOCOL_RELATIVE = /^\/[/\\]/;

/**
 * Tujuan `?redirect=` yang boleh dipakai setelah masuk atau daftar: hanya path
 * internal. Nilai berskema/host lain (`https://…`, `//host`, `/\host`,
 * `javascript:`) dibuang, supaya tautan masuk tidak bisa dipakai untuk
 * mengalihkan pengguna ke situs lain (open redirect).
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!value?.startsWith('/') || PROTOCOL_RELATIVE.test(value)) {
    return fallback;
  }
  return value;
}

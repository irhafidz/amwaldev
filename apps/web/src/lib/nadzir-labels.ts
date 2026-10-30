/**
 * Label tampilan untuk enum `NadzirKategori` (QA-17). Nilai DB seperti
 * `BADAN_HUKUM` tidak pernah ditampilkan mentah ke pengguna.
 */
const NADZIR_KATEGORI_LABEL: Record<string, string> = {
  PERSEORANGAN: 'Perseorangan',
  ORGANISASI: 'Organisasi',
  BADAN_HUKUM: 'Badan Hukum',
};

const WORD_SEPARATOR = /[_\s]+/;

/** `BADAN_HUKUM` → "Badan Hukum"; nilai tak dikenal dirapikan, bukan dibuang. */
export function nadzirKategoriLabel(
  kategori: string | null | undefined,
  fallback = 'Organisasi'
): string {
  const value = kategori?.trim();
  if (!value) {
    return fallback;
  }
  const known = NADZIR_KATEGORI_LABEL[value.toUpperCase()];
  if (known) {
    return known;
  }
  return value
    .split(WORD_SEPARATOR)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

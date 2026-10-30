const NON_DIGIT_PATTERN = /\D/g;

/**
 * Nomor seluler Indonesia dalam bentuk kanonik: kode negara `62`, awalan `8`,
 * lalu 8–11 digit. Rentang ini menampung `08xx` (10–13 digit) sampai nomor
 * terpanjang yang diterbitkan operator.
 */
const CANONICAL_ID_MOBILE_PATTERN = /^628\d{8,11}$/;

const ID_COUNTRY_CODE = '62';
const TRUNK_PREFIX = '0';

/**
 * Menormalkan nomor WhatsApp Indonesia ke bentuk kanonik `628xxxxxxxxx`.
 *
 * Menerima variasi yang lazim ditulis admin: `0812…`, `+62 812-3456-7890`,
 * `62 812 3456 7890`, `8123456789`. Mengembalikan `null` bila input jelas
 * bukan nomor seluler Indonesia — pemanggil yang memutuskan cara melaporkannya.
 *
 * Fungsi murni: dipakai bersama oleh validasi form dan skema Zod.
 */
export function normalizeIndonesianPhone(raw: string): string | null {
  const digits = raw.replace(NON_DIGIT_PATTERN, '');
  if (!digits) {
    return null;
  }

  let national = digits;
  if (national.startsWith(ID_COUNTRY_CODE)) {
    national = national.slice(ID_COUNTRY_CODE.length);
  } else if (national.startsWith(TRUNK_PREFIX)) {
    national = national.slice(TRUNK_PREFIX.length);
  }

  const canonical = `${ID_COUNTRY_CODE}${national}`;
  return CANONICAL_ID_MOBILE_PATTERN.test(canonical) ? canonical : null;
}

/** `true` bila `raw` dapat dinormalkan menjadi nomor WhatsApp Indonesia yang sah. */
export function isValidIndonesianPhone(raw: string): boolean {
  return normalizeIndonesianPhone(raw) !== null;
}

/**
 * Bentuk tampilan ramah baca untuk nomor kanonik: `6281211004001` →
 * `+62 812-1100-4001`. Nilai yang tidak dikenali dikembalikan apa adanya.
 */
export function formatIndonesianPhone(raw: string): string {
  const canonical = normalizeIndonesianPhone(raw);
  if (!canonical) {
    return raw;
  }
  const national = canonical.slice(ID_COUNTRY_CODE.length);
  const groups = [
    national.slice(0, 3),
    national.slice(3, 7),
    national.slice(7),
  ];
  return `+${ID_COUNTRY_CODE} ${groups.filter(Boolean).join('-')}`;
}

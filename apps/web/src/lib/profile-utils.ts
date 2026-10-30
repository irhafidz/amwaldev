/**
 * Utility functions for user profile data sanitization and normalization.
 */

// Regex patterns declared at top level (per Ultracite rules)
const DMY_DATE_REGEX = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const YMD_DATE_REGEX = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_CLEAN_REGEX = /[\s\-.()]/g;

/**
 * Normalizes input date to ISO `YYYY-MM-DD` string format.
 * Supports:
 * - 'YYYY-MM-DD' (e.g. '2003-08-23')
 * - 'DD/MM/YYYY' or 'DD-MM-YYYY' (e.g. '23/08/2003')
 * - 'YYYY/MM/DD' (e.g. '2003/08/23')
 * - ISO string timestamps (e.g. '2003-08-23T00:00:00.000Z')
 */
export const normalizeBirthDate = (rawDate?: string | null): string | null => {
  if (!rawDate) {
    return null;
  }
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return null;
  }

  // Already YYYY-MM-DD
  if (ISO_DATE_REGEX.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(DMY_DATE_REGEX);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  // YYYY/MM/DD
  const ymdMatch = trimmed.match(YMD_DATE_REGEX);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  // Fallback to JS Date parser
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
};

/**
 * Normalizes gender value to standard Indonesian representation ('Laki-laki' | 'Perempuan').
 * Accepts: 'Laki-laki', 'male', 'pria', 'Perempuan', 'female', 'wanita'.
 */
export const normalizeGender = (
  rawGender?: string | null
): 'Laki-laki' | 'Perempuan' | null => {
  if (!rawGender) {
    return null;
  }
  const trimmed = rawGender.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower === 'laki-laki' ||
    lower === 'male' ||
    lower === 'pria' ||
    lower === 'l'
  ) {
    return 'Laki-laki';
  }
  if (
    lower === 'perempuan' ||
    lower === 'female' ||
    lower === 'wanita' ||
    lower === 'p'
  ) {
    return 'Perempuan';
  }
  return null;
};

/**
 * Normalizes and strips spaces/formatting characters from phone numbers.
 * Converts empty strings to null.
 */
export const normalizePhoneNumber = (
  rawPhone?: string | null
): string | null => {
  if (!rawPhone) {
    return null;
  }
  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.replace(PHONE_CLEAN_REGEX, '');
  return cleaned || null;
};

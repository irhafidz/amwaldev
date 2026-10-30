const NON_DIGITS = /\D/g;
const LEADING_ZEROS = /^0+(?=\d)/;
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** 13 digit = di bawah Rp 10 triliun; cukup untuk satu program, aman bagi Number. */
export const MAX_RUPIAH_DIGITS = 13;

/** Ketikan mentah -> angka murni: tanpa non-digit, tanpa nol di depan ("007" -> "7"). */
export function toRupiahDigits(raw: string): string {
  return raw
    .replace(NON_DIGITS, '')
    .replace(LEADING_ZEROS, '')
    .slice(0, MAX_RUPIAH_DIGITS);
}

/** "1500000" -> "1.500.000". */
export function formatRupiahDigits(digits: string): string {
  return digits.replace(THOUSANDS, '.');
}

/** Banyak digit di sebelah kiri `caret` pada teks mentah. */
export function digitsBeforeCaret(raw: string, caret: number): number {
  return raw.slice(0, caret).replace(NON_DIGITS, '').length;
}

/**
 * Posisi kursor pada teks yang sudah diformat sehingga tepat `digitCount`
 * digit berada di kirinya. Menjaga kursor tidak melompat ke ujung saat
 * pemisah ribuan disisipkan atau dibuang.
 */
export function caretForDigitCount(
  formatted: string,
  digitCount: number
): number {
  if (digitCount <= 0) {
    return 0;
  }
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (formatted[index] !== '.') {
      seen += 1;
      if (seen === digitCount) {
        return index + 1;
      }
    }
  }
  return formatted.length;
}

const NON_DIGITS = /\D/g;
const LEADING_ZEROS = /^0+(?=\d)/;

/**
 * Membersihkan ketikan kolom persentase (0-100): hanya digit, tanpa nol di
 * depan ("080" -> "80"), dibatasi 100. Hasilnya string agar kolom kosong
 * tetap boleh tampil kosong saat admin sedang menghapus dan mengetik ulang.
 */
export function sanitizePercentInput(raw: string): string {
  const digits = raw.replace(NON_DIGITS, '').replace(LEADING_ZEROS, '');
  if (digits === '') {
    return '';
  }
  return String(Math.min(100, Number(digits)));
}

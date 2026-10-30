import { describe, expect, test } from 'bun:test';
import {
  caretForDigitCount,
  digitsBeforeCaret,
  formatRupiahDigits,
  MAX_RUPIAH_DIGITS,
  toRupiahDigits,
} from '../src/lib/rupiah-input';

/** Murni, tanpa database. Kolom nominal admin (UAT #4: Nurul, Atiq, Liha). */
describe('toRupiahDigits', () => {
  test('hanya digit, tanpa nol di depan', () => {
    expect(toRupiahDigits('1.500.000')).toBe('1500000');
    expect(toRupiahDigits('Rp 1,5 jt')).toBe('15');
    expect(toRupiahDigits('0005')).toBe('5');
    expect(toRupiahDigits('0')).toBe('0');
    expect(toRupiahDigits('')).toBe('');
    expect(toRupiahDigits('abc')).toBe('');
  });

  test('dibatasi 13 digit', () => {
    expect(toRupiahDigits('9'.repeat(20))).toHaveLength(MAX_RUPIAH_DIGITS);
  });
});

describe('formatRupiahDigits', () => {
  test('memisahkan ribuan dengan titik', () => {
    expect(formatRupiahDigits('')).toBe('');
    expect(formatRupiahDigits('5')).toBe('5');
    expect(formatRupiahDigits('1000')).toBe('1.000');
    expect(formatRupiahDigits('1500000')).toBe('1.500.000');
    expect(formatRupiahDigits('500000000')).toBe('500.000.000');
  });
});

describe('kursor', () => {
  test('digitsBeforeCaret mengabaikan titik', () => {
    expect(digitsBeforeCaret('1.500.000', 5)).toBe(4);
    expect(digitsBeforeCaret('1.500.000', 0)).toBe(0);
  });

  test('caretForDigitCount: kursor tetap di sebelah digit yang sama', () => {
    // "1.500" dan kursor setelah digit ke-2 ("15|00") -> setelah titik: indeks 3
    expect(caretForDigitCount('1.500', 2)).toBe(3);
    expect(caretForDigitCount('1.500', 1)).toBe(1);
    expect(caretForDigitCount('1.500', 0)).toBe(0);
    expect(caretForDigitCount('1.500', 99)).toBe(5);
  });

  test('mengetik di tengah: 1.500 + sisipan "2" setelah "1" -> 12.500, kursor di setelah "2"', () => {
    const raw = '12.500'; // hasil ketik di DOM sebelum diformat ulang
    const caretInRaw = 2;
    const digits = toRupiahDigits(raw);
    const caret = caretForDigitCount(
      formatRupiahDigits(digits),
      digitsBeforeCaret(raw, caretInRaw)
    );
    expect(formatRupiahDigits(digits)).toBe('12.500');
    expect(caret).toBe(2);
  });

  test('menyisipkan digit yang memunculkan titik baru menggeser kursor', () => {
    // "999" + ketik "9" di akhir -> "9999" -> "9.999", kursor di ujung (5)
    const digits = toRupiahDigits('9999');
    expect(
      caretForDigitCount(
        formatRupiahDigits(digits),
        digitsBeforeCaret('9999', 4)
      )
    ).toBe(5);
  });
});

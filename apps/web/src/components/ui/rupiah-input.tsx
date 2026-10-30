import type { ComponentProps } from 'react';
import { useRef } from 'react';
import {
  caretForDigitCount,
  digitsBeforeCaret,
  formatRupiahDigits,
  toRupiahDigits,
} from '@/lib/rupiah-input';
import { cn } from '@/lib/utils';

type RupiahInputProps = Omit<
  ComponentProps<'input'>,
  'onChange' | 'type' | 'value' | 'inputMode'
> & {
  /** Boleh berisi pemisah ribuan; yang dipakai hanya digitnya. */
  value: string | number;
  /** Menerima angka murni ("1500000"), siap dikirim ke API. */
  onChange: (digits: string) => void;
};

/**
 * Kolom nominal rupiah (UAT #4: panah naik/turun tidak perlu, nominal harus
 * langsung terformat "1.500.000" agar salah ketik nol mudah terlihat). Teks
 * ditampilkan dengan pemisah ribuan, nilai ke luar selalu string digit murni,
 * dan kursor dijaga tidak melompat saat titik disisipkan.
 */
export function RupiahInput({
  className,
  onChange,
  value,
  ...rest
}: RupiahInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = toRupiahDigits(String(value ?? ''));

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-slate-400 text-sm"
      >
        Rp
      </span>
      <input
        {...rest}
        autoComplete="off"
        className={cn(className, 'tabular-nums')}
        inputMode="numeric"
        onChange={(event) => {
          const input = event.currentTarget;
          const raw = input.value;
          const next = toRupiahDigits(raw);
          const caret = caretForDigitCount(
            formatRupiahDigits(next),
            Math.min(
              digitsBeforeCaret(raw, input.selectionStart ?? raw.length),
              next.length
            )
          );
          onChange(next);
          // Setelah React menulis ulang nilai terkontrol, kembalikan kursor.
          requestAnimationFrame(() => {
            if (inputRef.current === document.activeElement) {
              inputRef.current?.setSelectionRange(caret, caret);
            }
          });
        }}
        ref={inputRef}
        style={{ paddingLeft: '2.25rem' }}
        type="text"
        value={formatRupiahDigits(digits)}
      />
    </div>
  );
}

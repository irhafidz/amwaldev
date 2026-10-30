import { useRef } from 'react';

const LENGTH = 6;
const NON_DIGITS = /\D/g;
const SLOTS = Array.from({ length: LENGTH }, (_, position) => position);

interface OtpInputProps {
  disabled?: boolean;
  hasError?: boolean;
  onChange: (value: string) => void;
  /** Up to 6 digits. */
  value: string;
}

/**
 * Six single-digit boxes behaving as one field: typing advances, Backspace
 * steps back, and pasting a whole code fills every box. The first box carries
 * `autocomplete="one-time-code"` so phones can offer the code from the email.
 */
export function OtpInput({
  value,
  onChange,
  disabled = false,
  hasError = false,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (index: number) => {
    refs.current[Math.min(Math.max(index, 0), LENGTH - 1)]?.focus();
  };

  const setDigits = (index: number, raw: string) => {
    const digits = raw.replace(NON_DIGITS, '');
    if (digits.length === 0) {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    const next = (value.slice(0, index) + digits).slice(0, LENGTH);
    onChange(next);
    focusBox(Math.min(index + digits.length, LENGTH - 1));
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Backspace' && !value[index]) {
      focusBox(index - 1);
    } else if (event.key === 'ArrowLeft') {
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      focusBox(index + 1);
    }
  };

  return (
    <fieldset className="flex justify-between gap-2 sm:gap-3">
      <legend className="sr-only">Kode OTP 6 digit</legend>
      {SLOTS.map((position) => (
        <input
          aria-label={`Digit ${position + 1} dari ${LENGTH}`}
          autoComplete={position === 0 ? 'one-time-code' : 'off'}
          className={`h-14 w-full min-w-0 rounded-xl border bg-white text-center font-bold text-slate-900 text-xl outline-none transition focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/30 disabled:opacity-60 dark:bg-slate-900 dark:text-white ${
            hasError
              ? 'border-rose-400'
              : 'border-slate-300 dark:border-slate-700'
          }`}
          disabled={disabled}
          inputMode="numeric"
          key={position}
          maxLength={LENGTH}
          onChange={(event) => setDigits(position, event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => handleKeyDown(position, event)}
          pattern="[0-9]*"
          ref={(element) => {
            refs.current[position] = element;
          }}
          type="text"
          value={value[position] ?? ''}
        />
      ))}
    </fieldset>
  );
}

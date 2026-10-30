'use client';

import {
  categoryLabel,
  categoryOf,
  DEFAULT_PAYMENT_METHOD,
  fallbackMethodForAmount,
  methodLimitMessage,
  methodsInCategory,
  PAYMENT_METHOD_CATEGORIES,
  type PaymentMethodCategory,
  type PaymentMethodCode,
  paymentMethodLabel,
} from '@amwal/core/payment/methods';
import { Info, Landmark, QrCode, Wallet } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef } from 'react';

const CATEGORY_ICON = {
  qris: QrCode,
  va: Landmark,
  ewallet: Wallet,
} as const;

const CATEGORY_HINT: Record<PaymentMethodCategory, string> = {
  qris: 'Scan sekali, bayar dari e-wallet atau mobile banking apa pun.',
  va: 'Transfer ke nomor Virtual Account bank pilihan Anda.',
  ewallet: 'Bayar langsung dari saldo e-wallet Anda.',
};

/** Pilihan awal saat donatur pindah kategori; memilih ulang kategori yang sama tidak mengubahnya. */
const FIRST_OF_CATEGORY: Record<PaymentMethodCategory, PaymentMethodCode> = {
  qris: DEFAULT_PAYMENT_METHOD,
  va: 'va/bsi',
  ewallet: 'ewallet/gopay',
};

/**
 * Pemilih metode pembayaran Mayar untuk checkout wakaf, zakat, infaq, dan
 * qurban: tab kategori (QRIS / Virtual Account / E-Wallet), lalu daftar bank
 * atau e-wallet bila kategorinya punya pilihan.
 *
 * Aksesibel dan ramah ponsel: tab memakai pola `tablist` dengan navigasi
 * panah, target sentuh ≥ 44 px, dan grid yang turun ke dua kolom di layar
 * sempit. Komponennya terkendali (`value`/`onChange`); state-nya milik form.
 *
 * `amount` (rupiah) mengaktifkan batas per metode dari `@amwal/core`: di atas
 * Rp 10 juta tab QRIS dinonaktifkan dengan penjelasan, dan pilihan QRIS yang
 * sedang aktif dipindah ke Virtual Account (QA-05). Server menolak hal yang
 * sama, jadi ini kenyamanan, bukan satu-satunya penjaga.
 */
export function PaymentMethodSelector({
  value,
  onChange,
  amount,
}: {
  value: PaymentMethodCode;
  onChange: (code: PaymentMethodCode) => void;
  amount?: number;
}) {
  const baseId = useId();
  const category = categoryOf(value);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const options = methodsInCategory(category);
  const qrisBlockedReason =
    amount === undefined ? null : methodLimitMessage('qris', amount);

  useEffect(() => {
    if (amount === undefined) {
      return;
    }
    const usable = fallbackMethodForAmount(value, amount);
    if (usable !== value) {
      onChange(usable);
    }
  }, [amount, value, onChange]);

  const selectCategory = (next: PaymentMethodCategory) => {
    if (next === 'qris' && qrisBlockedReason) {
      return;
    }
    if (next !== category) {
      onChange(FIRST_OF_CATEGORY[next]);
    }
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const last = PAYMENT_METHOD_CATEGORIES.length - 1;
    const target =
      {
        ArrowRight: index === last ? 0 : index + 1,
        ArrowLeft: index === 0 ? last : index - 1,
        Home: 0,
        End: last,
      }[event.key] ?? null;
    const next =
      target === null ? undefined : PAYMENT_METHOD_CATEGORIES[target];
    if (next) {
      event.preventDefault();
      selectCategory(next);
      tabRefs.current[target ?? 0]?.focus();
    }
  };

  return (
    <div className="space-y-4">
      <div
        aria-label="Kategori metode pembayaran"
        className="grid grid-cols-3 gap-1.5 rounded-2xl bg-gray-100 p-1.5 dark:bg-slate-800"
        role="tablist"
      >
        {PAYMENT_METHOD_CATEGORIES.map((item, index) => {
          const active = item === category;
          const blocked = item === 'qris' && qrisBlockedReason !== null;
          const Icon = CATEGORY_ICON[item];
          let tone = 'text-gray-500 hover:text-gray-800 dark:text-slate-400';
          if (active) {
            tone =
              'bg-white text-[#356152] shadow-xs ring-1 ring-[#356152]/20 dark:bg-slate-900 dark:text-emerald-300';
          } else if (blocked) {
            tone = 'cursor-not-allowed text-gray-300 dark:text-slate-600';
          }
          return (
            <button
              aria-controls={`${baseId}-panel`}
              aria-disabled={blocked || undefined}
              aria-selected={active}
              className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 font-bold text-[11px] transition-all sm:flex-row sm:gap-2 sm:text-sm ${tone}`}
              disabled={blocked}
              id={`${baseId}-tab-${item}`}
              key={item}
              onClick={() => selectCategory(item)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={active ? 0 : -1}
              title={blocked ? (qrisBlockedReason ?? undefined) : undefined}
              type="button"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-5" />
              <span>{categoryLabel(item)}</span>
            </button>
          );
        })}
      </div>

      {qrisBlockedReason && (
        <p
          className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sky-900 text-xs leading-relaxed dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
          data-testid="qris-limit-note"
          role="note"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{qrisBlockedReason}</span>
        </p>
      )}

      <div
        aria-labelledby={`${baseId}-tab-${category}`}
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        <p className="mb-3 text-gray-500 text-xs dark:text-slate-400">
          {CATEGORY_HINT[category]}
        </p>

        {options.length > 1 ? (
          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">
              Pilih {categoryLabel(category).toLowerCase()}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {options.map((option) => {
                const active = option.code === value;
                return (
                  <button
                    aria-pressed={active}
                    className={`min-h-11 cursor-pointer rounded-xl border px-2 py-2.5 text-center font-bold text-xs transition-all active:scale-95 sm:text-sm ${
                      active
                        ? 'border-[#356152] bg-[#f2f6f4] text-[#1d352d] ring-2 ring-[#356152]/30 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-[#356152]/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                    key={option.code}
                    onClick={() => onChange(option.code)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <div className="rounded-2xl border border-[#356152] bg-[#f2f6f4] p-4 ring-2 ring-[#356152]/20 dark:bg-emerald-950/30">
            <span className="font-bold text-gray-900 text-sm dark:text-white">
              QRIS
            </span>
            <p className="mt-0.5 text-gray-500 text-xs dark:text-slate-400">
              GoPay, OVO, DANA, ShopeePay, LinkAja, dan mobile banking yang
              mendukung QRIS.
            </p>
          </div>
        )}

        <p className="mt-3 text-gray-500 text-xs dark:text-slate-400">
          Metode terpilih:{' '}
          <strong className="text-gray-900 dark:text-white">
            {paymentMethodLabel(value)}
          </strong>
          . Pembayaran diselesaikan di halaman aman Mayar.
        </p>
      </div>
    </div>
  );
}

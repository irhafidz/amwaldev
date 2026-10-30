import type { ReactNode } from 'react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * Segmented control Amwal (alur publik): trek netral `bg-slate-100 p-1`,
 * segmen aktif `bg-white shadow-sm`. Pengganti tombol kapsul `rounded-full`
 * berwarna penuh. Pasangan di backoffice: `AdminTabs` (garis bawah).
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: readonly SegmentedTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            aria-selected={active}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${
              active
                ? 'bg-white font-medium text-emerald-900 shadow-sm dark:bg-slate-950 dark:text-emerald-300'
                : 'font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

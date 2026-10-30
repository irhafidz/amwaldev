import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { GreenPatternOverlay } from '@/components/ui/green-pattern-overlay';
import { useToast } from '@/components/ui/toast';
import type { ResourceState } from '@/lib/amwal-api/use-resource';

/** Thin success/error wrapper over the shared toast context. */
export function useAdminToast() {
  const { showToast } = useToast();
  return {
    ok: (title: string) => showToast({ title, type: 'success' }),
    err: (title: string) => showToast({ title, type: 'error' }),
  };
}

/**
 * Shared loading / empty / error frame for every admin data screen.
 * `S10-A-16`: no screen renders a table before its data resolves, and an
 * empty result shows an explicit empty state rather than a blank grid.
 */
export function AdminResource<T>({
  state,
  isEmpty,
  emptyLabel,
  onRetry,
  children,
}: {
  state: ResourceState<T>;
  isEmpty: (data: T) => boolean;
  emptyLabel: string;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-slate-400 text-sm">
        <LoaderCircle className="size-4 animate-spin" />
        Memuat data…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 px-6 py-16 text-center">
        <AlertTriangle className="size-6 text-rose-500" />
        <p className="font-semibold text-rose-700 text-sm">{state.error}</p>
        <button
          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 text-xs hover:bg-rose-50"
          onClick={onRetry}
          type="button"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (isEmpty(state.data)) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 border-dashed bg-white px-6 py-16 text-center">
        <Inbox className="size-6 text-slate-300" />
        <p className="text-slate-400 text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return <>{children(state.data)}</>;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  VERIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    STATUS_TONE[status] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 font-bold text-[10px] uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

/** Buttons that must read clearly on the emerald hero banner. */
export const HERO_BUTTON_PRIMARY =
  'flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold text-[#356152] text-xs shadow-xs transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60';
export const HERO_BUTTON_SECONDARY =
  'flex cursor-pointer items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 font-bold text-white text-xs transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60';
export const HERO_BADGE =
  'inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 font-bold text-[11px] text-white';

/**
 * The title card at the top of every admin page: Amwal Emerald with the
 * mosaic rosette on the right. `actions` and `badge` sit on the green, so use
 * the `HERO_*` class strings above for anything clickable.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  badge,
  icon,
  children,
  compact = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  /** Extra rows on the green card (e.g. a stat strip). */
  children?: ReactNode;
  /**
   * One slim bar (no pattern, no description) for table-heavy modules, so the
   * data gets the screen (UAT #4: "banner di atas dihapus aja").
   */
  compact?: boolean;
}) {
  return (
    <header
      className={`relative isolate overflow-hidden rounded-2xl bg-[#356152] text-white shadow-sm ${compact ? 'px-5 py-3' : 'p-6'}`}
    >
      {!compact && <GreenPatternOverlay size="lg" />}
      <div
        className={`flex flex-wrap justify-between gap-4 ${compact ? 'items-center' : 'items-start'}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white [&>svg]:size-5">
                {icon}
              </span>
            )}
            <h2 className="font-bold text-white text-xl leading-tight">
              {title}
            </h2>
            {badge}
          </div>
          {description && !compact && (
            <p className="mt-1.5 max-w-2xl text-emerald-100 text-sm">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}

export interface AdminTabItem<T extends string> {
  badge?: ReactNode;
  count?: number | string;
  icon?: ReactNode;
  id: T;
  label: string;
}

/**
 * Underline tabs, the one tab style of the backoffice (Master Data is the
 * reference): a quiet baseline, the active tab underlined in emerald-700
 * with emerald-900 text and a small emerald-50 counter badge.
 */
export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = 'mb-6',
}: {
  tabs: readonly AdminTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  /** Jarak luar; default `mb-6`. */
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`no-scrollbar flex items-center gap-6 overflow-x-auto border-slate-200/80 border-b ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            aria-selected={active}
            className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm transition-colors ${
              active
                ? 'border-emerald-700 font-semibold text-emerald-900'
                : 'border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 font-bold text-[11px] ${
                  active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function NotesField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold text-slate-700 text-xs">
        Catatan Admin{' '}
        {required && <span className="text-rose-600">(wajib)</span>}
      </span>
      <textarea
        className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
        onChange={(e) => onChange(e.target.value)}
        placeholder="Alasan / catatan…"
        rows={3}
        value={value}
      />
    </label>
  );
}

export function DataTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-slate-100 border-b bg-slate-50/80">
            {head.map((h) => (
              <th
                className="px-4 py-3 font-bold text-[11px] text-slate-500 uppercase tracking-wide"
                key={h}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

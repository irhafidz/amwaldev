import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { parseOptions, type SelectChangeEvent } from './select-field';

/**
 * Dropdown yang bisa dicari (UAT #4: "provinsi tidak bisa di-search, harus cari
 * satu-satu"). Bentuk pemakaiannya sama dengan `SelectField` (`value`,
 * `onChange` yang membaca `event.target.value`, anak `<option>`), jadi
 * menggantinya cukup mengganti nama komponen. `<option value="">` dibaca
 * sebagai teks placeholder, bukan pilihan.
 */

const MAX_VISIBLE = 100;
const DIACRITICS = /[̀-ͯ]/g;

const normalize = (text: string) =>
  text.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();

const labelText = (label: ReactNode) =>
  typeof label === 'string' || typeof label === 'number' ? String(label) : '';

interface SearchableSelectProps {
  'aria-label'?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  onChange?: (event: SelectChangeEvent) => void;
  searchPlaceholder?: string;
  value?: string | number;
}

export function SearchableSelect({
  'aria-label': ariaLabel,
  children,
  className,
  disabled,
  error = false,
  id,
  onChange,
  searchPlaceholder = 'Ketik untuk mencari…',
  value,
}: SearchableSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = parseOptions(children);
  const placeholder = all.find((option) => option.value === '')?.label;
  const options = all.filter((option) => option.value !== '');
  const current = value === undefined ? '' : String(value);
  const selected = options.find((option) => option.value === current);

  const needle = normalize(query);
  const matches = needle
    ? options.filter((option) =>
        normalize(labelText(option.label)).includes(needle)
      )
    : options;
  const visible = matches.slice(0, MAX_VISIBLE);

  // Dibuka: kotak cari kosong, sorotan di pilihan yang sedang terpilih.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setQuery('');
      setActive(
        Math.max(
          0,
          options.findIndex((option) => option.value === current)
        )
      );
    }
    setOpen(next);
  };

  // Sorotan digeser dengan panah: jaga agar tetap terlihat di dalam daftar.
  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const pick = (next: string) => {
    onChange?.({ currentTarget: { value: next }, target: { value: next } });
    setOpen(false);
  };

  const move = (to: number) => {
    setActive(to);
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' })
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(Math.min(visible.length - 1, active + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(Math.max(0, active - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visible[active];
      if (option && !option.disabled) {
        pick(option.value);
      }
    }
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <Root onOpenChange={handleOpenChange} open={open}>
        <Trigger asChild>
          <button
            aria-controls={open ? listId : undefined}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={error || undefined}
            aria-label={ariaLabel}
            className={cn(
              'group flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-left text-slate-800 text-sm shadow-sm transition-all',
              'focus:border-[#356152] focus:outline-none focus:ring-2 focus:ring-[#356152]/20',
              'data-[state=open]:border-[#356152] data-[state=open]:ring-2 data-[state=open]:ring-[#356152]/20',
              'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none',
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                : 'border-slate-200'
            )}
            disabled={disabled}
            id={id}
            type="button"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                !selected && 'text-slate-400'
              )}
            >
              {selected?.label ?? placeholder ?? ''}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180',
                disabled ? 'text-slate-300' : 'text-slate-400'
              )}
            />
          </button>
        </Trigger>

        <Portal>
          <Content
            align="start"
            className="data-[state=closed]:fade-out-80 data-[state=open]:fade-in-80 z-[60] w-[var(--radix-popover-trigger-width)] min-w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl data-[state=closed]:animate-out data-[state=open]:animate-in"
            collisionPadding={12}
            sideOffset={6}
          >
            <div className="relative mb-1.5">
              <Search
                aria-hidden="true"
                className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-slate-400"
              />
              <input
                aria-activedescendant={
                  visible[active] ? `${listId}-${active}` : undefined
                }
                aria-controls={listId}
                aria-label={searchPlaceholder}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-base text-slate-800 outline-none focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/20 sm:text-sm"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                spellCheck={false}
                type="text"
                value={query}
              />
            </div>

            {/* biome-ignore lint/a11y/useSemanticElements: pola combobox ARIA; <select> native tidak bisa memuat kotak cari */}
            <div
              className="max-h-64 overflow-y-auto"
              id={listId}
              ref={listRef}
              role="listbox"
            >
              {visible.map((option, index) => (
                // biome-ignore lint/a11y/useSemanticElements: pilihan listbox ARIA; <option> hanya valid di dalam <select>
                <button
                  aria-selected={option.value === current}
                  className={cn(
                    'flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-slate-700 text-sm transition-colors disabled:cursor-not-allowed disabled:text-slate-300',
                    index === active && 'bg-[#356152]/10 text-[#356152]',
                    option.value === current && 'font-semibold text-[#356152]'
                  )}
                  data-active={index === active}
                  disabled={option.disabled}
                  id={`${listId}-${index}`}
                  key={option.value}
                  onClick={() => pick(option.value)}
                  onMouseMove={() => setActive(index)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === current && (
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                  )}
                </button>
              ))}
              {visible.length === 0 && (
                <p className="px-3 py-3 text-slate-500 text-sm">
                  {query
                    ? `Tidak ada hasil untuk "${query}".`
                    : 'Belum ada pilihan.'}
                </p>
              )}
              {matches.length > MAX_VISIBLE && (
                <p className="px-3 py-2 text-slate-500 text-xs">
                  Menampilkan {MAX_VISIBLE} dari {matches.length}. Ketik untuk
                  mempersempit.
                </p>
              )}
            </div>
          </Content>
        </Portal>
      </Root>
    </div>
  );
}

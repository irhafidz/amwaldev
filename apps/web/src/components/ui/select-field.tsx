import {
  Content as SelectContent,
  Icon as SelectIcon,
  Item as SelectItem,
  ItemIndicator as SelectItemIndicator,
  ItemText as SelectItemText,
  Portal as SelectPortal,
  Root as SelectRoot,
  Trigger as SelectTrigger,
  Value as SelectValue,
  Viewport as SelectViewport,
} from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * The project's one dropdown. Same call shape as a native `<select>` (a
 * `value`, an `onChange` that reads `event.target.value`, `<option>` children),
 * but rendered with Radix Select so the opened list is our own floating panel,
 * not the operating system's menu. Keyboard navigation, typeahead, screen
 * reader semantics and collision-aware positioning come from Radix.
 */

/** Radix forbids `value=""` on an item, but `<option value="">` is common. */
const EMPTY = '__empty__';

export interface SelectChangeEvent {
  currentTarget: { value: string };
  target: { value: string };
}

interface SelectFieldProps
  extends Omit<
    ComponentProps<'select'>,
    'children' | 'className' | 'onChange' | 'value' | 'defaultValue'
  > {
  children?: ReactNode;
  /** Layout classes for the wrapper (width, flex, margin). */
  className?: string;
  /** Marks the field invalid: rose border and `aria-invalid`. */
  error?: boolean;
  onChange?: (event: SelectChangeEvent) => void;
  value?: string | number;
}

export interface ParsedOption {
  disabled: boolean;
  label: ReactNode;
  value: string;
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

/** Flattens `<option>` elements out of arrays, fragments and `.map()` output. */
export function parseOptions(children: ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) {
      continue;
    }
    const element = child as ReactElement<{
      children?: ReactNode;
      disabled?: boolean;
      value?: string | number;
    }>;
    if (element.type === Fragment) {
      options.push(...parseOptions(element.props.children));
    } else if (element.type === 'option') {
      const label = element.props.children;
      options.push({
        disabled: Boolean(element.props.disabled),
        label,
        value: String(element.props.value ?? textOf(label)),
      });
    }
  }
  return options;
}

const toRadix = (value: string) => (value === '' ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? '' : value);

export function SelectField({
  children,
  className,
  disabled,
  error = false,
  id,
  name,
  onChange,
  required,
  title,
  value,
  ...aria
}: SelectFieldProps) {
  const options = parseOptions(children);
  const current = value === undefined ? undefined : toRadix(String(value));
  // Rendered ourselves: Radix only fills the trigger after the list mounts on
  // the client, which would leave it blank in the server HTML.
  const selected = options.find((option) => toRadix(option.value) === current);

  return (
    <div className={cn('relative inline-block', className)}>
      <SelectRoot
        disabled={disabled}
        name={name}
        onValueChange={(next) => {
          const picked = fromRadix(next);
          onChange?.({
            currentTarget: { value: picked },
            target: { value: picked },
          });
        }}
        required={required}
        value={current}
      >
        <SelectTrigger
          aria-invalid={error || undefined}
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          className={cn(
            'group flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-left text-slate-800 text-sm shadow-sm transition-all',
            'focus:border-[#356152] focus:outline-none focus:ring-2 focus:ring-[#356152]/20',
            'data-[state=open]:border-[#356152] data-[state=open]:ring-2 data-[state=open]:ring-[#356152]/20',
            'data-[placeholder]:text-slate-400',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none',
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
              : 'border-slate-200'
          )}
          id={id}
          title={title}
        >
          <span className="min-w-0 flex-1 truncate">
            <SelectValue>{selected?.label}</SelectValue>
          </span>
          <SelectIcon asChild>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180',
                disabled ? 'text-slate-300' : 'text-slate-400'
              )}
            />
          </SelectIcon>
        </SelectTrigger>

        <SelectPortal>
          <SelectContent
            className="data-[state=closed]:fade-out-80 data-[state=open]:fade-in-80 z-[60] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl data-[state=closed]:animate-out data-[state=open]:animate-in"
            collisionPadding={12}
            position="popper"
            sideOffset={6}
          >
            <SelectViewport className="max-h-[inherit]">
              {options.map((option) => (
                <SelectItem
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-slate-700 text-sm outline-none transition-colors data-[disabled]:cursor-not-allowed data-[highlighted]:bg-[#356152]/10 data-[state=checked]:bg-[#356152]/10 data-[state=checked]:font-semibold data-[disabled]:text-slate-300 data-[highlighted]:text-[#356152] data-[state=checked]:text-[#356152]"
                  disabled={option.disabled}
                  key={option.value}
                  value={toRadix(option.value)}
                >
                  <SelectItemText>{option.label}</SelectItemText>
                  <SelectItemIndicator>
                    <Check aria-hidden="true" className="size-4" />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectViewport>
          </SelectContent>
        </SelectPortal>
      </SelectRoot>
    </div>
  );
}

const WIB_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * `YYYY-MM-DD HH:mm:ss[.SSS]` — a Postgres `timestamp(3)` without an offset,
 * which is exactly what `mode: 'string'` columns return.
 */
const NAIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * The single way to turn a stored timestamp into an instant.
 *
 * Postgres runs in UTC here and the columns carry no offset, so a naive value
 * must be read as UTC: `new Date('2026-09-30 17:30:00')` would otherwise be
 * parsed in whatever zone the runtime sits in, shifting the instant. Shared by
 * certificates (`I-5`), check-in and penalty settlement — the three places
 * PLAN §8 names under "Zona waktu".
 */
export function parseInstant(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }

  const trimmed = value.trim();
  const instant = new Date(
    NAIVE_TIMESTAMP.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed
  );

  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Tanggal tidak valid: ${value}`);
  }

  return instant;
}

export interface WibParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wibParts(date: Date): WibParts {
  const parts = WIB_DATE_TIME.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}

/** The `YYYY-MM-DD` calendar date this instant falls on in WIB. */
export function toWibDate(value: Date | string): string {
  const { year, month, day } = wibParts(parseInstant(value));
  const pad = (part: number) => String(part).padStart(2, '0');

  return `${year}-${pad(month)}-${pad(day)}`;
}

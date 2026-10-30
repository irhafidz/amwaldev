import { parseInstant, wibParts } from '@amwal/core/time/wib';

/**
 * Format tanggal-jam WIB untuk tampilan admin.
 *
 * Kolom `timestamp(3)` tanpa zona dikembalikan Drizzle sebagai string tanpa
 * penanda zona, mis. `2026-09-17 05:00:00.123`. `new Date()` di browser
 * membaca string seperti itu sebagai **waktu lokal perangkat**, sehingga di
 * perangkat WIB setiap jam bergeser tujuh jam. Nilai tersebut adalah jam
 * dinding UTC — asumsi yang sama dengan router analitik dan filter periode —
 * jadi string tanpa zona diberi `Z` sebelum diurai.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agt',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/** `parseInstant` (the single timestamp rule), but an invalid Date instead of a throw. */
export function parseDbTimestamp(value: string): Date {
  try {
    return parseInstant(value);
  } catch {
    return new Date(Number.NaN);
  }
}

function wibPartsOf(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = parseDbTimestamp(value);
  return Number.isNaN(date.getTime()) ? null : wibParts(date);
}

/** `17 Sep 2026, 12:00:00 WIB`; `—` bila kosong atau tidak valid. */
export function formatWibDateTime(value: string | null | undefined): string {
  const parts = wibPartsOf(value);
  if (!parts) {
    return '—';
  }
  return `${pad(parts.day)} ${MONTHS[parts.month - 1]} ${parts.year}, ${pad(
    parts.hour
  )}:${pad(parts.minute)}:${pad(parts.second)} WIB`;
}

/** `17 Sep 2026`; `—` bila kosong atau tidak valid. */
export function formatWibDate(value: string | null | undefined): string {
  const parts = wibPartsOf(value);
  if (!parts) {
    return '—';
  }
  return `${pad(parts.day)} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

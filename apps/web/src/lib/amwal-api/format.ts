import type { WaqfJenis } from './types';

const TRAILING_ZERO_DECIMALS = /\.0$/;

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRupiah(
  value: string | number | null | undefined
): string {
  const amount = toNumber(value);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** `Rp 1,5M` / `Rp 2jt` for tight stat tiles; below 1 juta falls back to full digits. */
export function formatRupiahCompact(value: number): string {
  if (value >= 1_000_000_000) {
    const miliar = value / 1_000_000_000;
    return `Rp ${miliar % 1 === 0 ? miliar : miliar.toFixed(1)}M`;
  }
  if (value >= 1_000_000) {
    const juta = value / 1_000_000;
    return `Rp ${juta % 1 === 0 ? juta : juta.toFixed(1)}jt`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export function progressPercent(
  collected: string | number | null | undefined,
  target: string | number | null | undefined
): number {
  const collectedAmount = toNumber(collected);
  const targetAmount = toNumber(target);
  if (targetAmount <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((collectedAmount / targetAmount) * 100));
}

export function remainingDays(
  createdAt: string | null | undefined,
  durationDays: number | null | undefined
): number {
  if (!(createdAt && durationDays) || durationDays <= 0) {
    return durationDays ?? 60;
  }

  const created = new Date(createdAt).getTime();
  const end = created + durationDays * 24 * 60 * 60 * 1000;
  const days = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

export function jenisWakafLabel(jenis: WaqfJenis): string {
  return jenis === 'PRODUKTIF_KEKAL'
    ? 'Wakaf Produktif'
    : 'Wakaf Fisik / Sosial';
}

export function formatShortAmount(value: number): string {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000)
      .toFixed(1)
      .replace(TRAILING_ZERO_DECIMALS, '')} Miliar`;
  }
  if (value >= 1_000_000) {
    const juta = value / 1_000_000;
    return `Rp ${
      juta % 1 === 0
        ? juta
        : juta.toFixed(1).replace(TRAILING_ZERO_DECIMALS, '')
    }jt`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
}

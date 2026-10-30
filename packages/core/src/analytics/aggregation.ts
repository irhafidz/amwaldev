import { wibParts } from '../time/wib';

export interface TimeSeriesPoint {
  date: Date;
  amount: number;
}

export interface TimeSeriesBucket {
  label: string;
  date: Date;
  amount: number;
}

export interface CompositionPoint {
  module: string;
  amount: number;
}

export function aggregateTimeSeriesBuckets(
  data: TimeSeriesPoint[],
  period: { year: number; month?: number }
): TimeSeriesBucket[] {
  const month = period.month;

  if (month === undefined) {
    const totals = new Map<string, number>();
    for (const point of data) {
      const parts = wibParts(point.date);
      if (parts.year !== period.year) {
        continue;
      }
      const key = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
      totals.set(key, (totals.get(key) ?? 0) + point.amount);
    }

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const key = `${period.year}-${String(month).padStart(2, '0')}`;
      return {
        label: key,
        date: new Date(Date.UTC(period.year, month - 1, 1)),
        amount: totals.get(key) ?? 0,
      };
    });
  }

  const dayCount = new Date(Date.UTC(period.year, month, 0)).getUTCDate();
  const totals = new Map<string, number>();

  for (const point of data) {
    const parts = wibParts(point.date);
    if (parts.year !== period.year || parts.month !== month) {
      continue;
    }
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    totals.set(key, (totals.get(key) ?? 0) + point.amount);
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const key = `${period.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      label: key,
      date: new Date(Date.UTC(period.year, month - 1, day)),
      amount: totals.get(key) ?? 0,
    };
  });
}

export function aggregateComposition(
  data: CompositionPoint[]
): CompositionPoint[] {
  const totals = new Map<string, number>();

  for (const point of data) {
    totals.set(point.module, (totals.get(point.module) ?? 0) + point.amount);
  }

  return [...totals.entries()]
    .map(([module, amount]) => ({ module, amount }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

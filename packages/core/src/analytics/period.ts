import { wibParts } from '../time/wib';

const MIN_YEAR = 2020;
const MAX_YEAR = 2099;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface AnalyticsPeriod {
  startDate: Date;
  endDate: Date;
  periodLabel: string;
}

export function parseAnalyticsPeriod(input: {
  year: number;
  month?: number;
}): AnalyticsPeriod {
  if (
    !Number.isInteger(input.year) ||
    input.year < MIN_YEAR ||
    input.year > MAX_YEAR
  ) {
    throw new Error('INVALID_ANALYTICS_YEAR');
  }

  if (
    input.month !== undefined &&
    (!Number.isInteger(input.month) || input.month < 1 || input.month > 12)
  ) {
    throw new Error('INVALID_ANALYTICS_MONTH');
  }

  const startMonth = input.month ?? 1;
  const endMonth = input.month ?? 12;
  const startDate = new Date(
    Date.UTC(input.year, startMonth - 1, 1) - WIB_OFFSET_MS
  );
  const endDate = new Date(
    Date.UTC(input.year, endMonth, 1) - WIB_OFFSET_MS - 1000
  );
  const startParts = wibParts(startDate);
  const endParts = wibParts(endDate);

  if (
    startParts.hour !== 0 ||
    startParts.minute !== 0 ||
    startParts.second !== 0
  ) {
    throw new Error('INVALID_ANALYTICS_START_BOUNDARY');
  }
  if (
    endParts.hour !== 23 ||
    endParts.minute !== 59 ||
    endParts.second !== 59
  ) {
    throw new Error('INVALID_ANALYTICS_END_BOUNDARY');
  }

  return {
    startDate,
    endDate,
    periodLabel:
      input.month === undefined
        ? String(input.year)
        : `${input.year}-${String(input.month).padStart(2, '0')}`,
  };
}

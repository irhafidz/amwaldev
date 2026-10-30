/**
 * RFM-D donor scoring + segmentation. Pure functions only (no DB), so the
 * thresholds below are the single documented source of truth and are unit
 * tested without a database.
 *
 * Fixed thresholds are used on purpose instead of quintiles: with a small
 * donor base a quintile split would force every donor into a different
 * bucket regardless of how they actually behave.
 */

export const DONOR_SEGMENTS = [
  'Champion',
  'Loyal',
  'New',
  'At-Risk',
  'Lapsed',
  'Situational',
] as const;

export type DonorSegment = (typeof DONOR_SEGMENTS)[number];

export interface DonorMetrics {
  /** Whole days since the last verified donation. */
  recencyDays: number;
  /** Count of verified donations. */
  frequency: number;
  /** Total verified donations in IDR. */
  monetary: number;
  /** Distinct akad categories donated to (Wakaf, Zakat, Infaq, Sedekah, Qurban). */
  diversity: number;
}

export interface RfmdScores {
  r: number;
  f: number;
  m: number;
  d: number;
  /** Mean of the four scores, one decimal, on the same 1-5 scale. */
  composite: number;
}

const MS_PER_DAY = 86_400_000;
/** Days after which a donor with a history is considered lapsed. */
export const LAPSED_AFTER_DAYS = 180;

export function recencyDaysBetween(lastDonationAt: string, now: Date): number {
  const last = new Date(lastDonationAt).getTime();
  return Math.max(0, Math.floor((now.getTime() - last) / MS_PER_DAY));
}

/** <=30d 5, <=60d 4, <=90d 3, <=180d 2, else 1. Unknown (NaN) scores 1. */
export function scoreRecency(days: number): number {
  if (days <= 30) {
    return 5;
  }
  if (days <= 60) {
    return 4;
  }
  if (days <= 90) {
    return 3;
  }
  return days <= LAPSED_AFTER_DAYS ? 2 : 1;
}

/** 1x 1, 2x 2, 3-4x 3, 5-9x 4, 10x+ 5. */
export function scoreFrequency(count: number): number {
  if (count >= 10) {
    return 5;
  }
  if (count >= 5) {
    return 4;
  }
  if (count >= 3) {
    return 3;
  }
  return count >= 2 ? 2 : 1;
}

/** <Rp100rb 1, <500rb 2, <2,5jt 3, <10jt 4, else 5. */
export function scoreMonetary(idr: number): number {
  if (idr >= 10_000_000) {
    return 5;
  }
  if (idr >= 2_500_000) {
    return 4;
  }
  if (idr >= 500_000) {
    return 3;
  }
  return idr >= 100_000 ? 2 : 1;
}

/** One point per distinct akad category, capped at 5. */
export function scoreDiversity(categories: number): number {
  return Math.min(5, Math.max(1, Math.floor(categories)));
}

export function scoreDonor(metrics: DonorMetrics): RfmdScores {
  const r = scoreRecency(metrics.recencyDays);
  const f = scoreFrequency(metrics.frequency);
  const m = scoreMonetary(metrics.monetary);
  const d = scoreDiversity(metrics.diversity);
  return { r, f, m, d, composite: Math.round(((r + f + m + d) / 4) * 10) / 10 };
}

/**
 * Evaluated top to bottom; the first match wins.
 *  - Lapsed:      no donation for more than 180 days
 *  - Champion:    recent (R>=4) and strong on frequency and monetary (F,M>=4)
 *  - Loyal:       repeat giver (F>=3, M>=3) still active within 90 days
 *  - New:         a single donation within the last 60 days
 *  - At-Risk:     repeat giver (F>=3) who went quiet for 91-180 days
 *  - Situational: everything else (occasional / one-off, cooling down)
 */
export function classifyDonor(
  metrics: DonorMetrics,
  scores: RfmdScores = scoreDonor(metrics)
): DonorSegment {
  if (metrics.recencyDays > LAPSED_AFTER_DAYS) {
    return 'Lapsed';
  }
  if (scores.r >= 4 && scores.f >= 4 && scores.m >= 4) {
    return 'Champion';
  }
  if (scores.f >= 3 && scores.m >= 3 && scores.r >= 3) {
    return 'Loyal';
  }
  if (metrics.frequency === 1 && scores.r >= 4) {
    return 'New';
  }
  if (scores.f >= 3 && scores.r <= 2) {
    return 'At-Risk';
  }
  return 'Situational';
}

export function countBySegment(
  segments: readonly DonorSegment[]
): Record<DonorSegment, number> {
  const counts = Object.fromEntries(
    DONOR_SEGMENTS.map((segment) => [segment, 0])
  ) as Record<DonorSegment, number>;
  for (const segment of segments) {
    counts[segment] += 1;
  }
  return counts;
}

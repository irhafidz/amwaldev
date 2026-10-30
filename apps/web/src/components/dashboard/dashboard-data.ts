import type { WaqfProgram } from '@/lib/amwal-api/types';

const toNumber = (value: string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * "Pilihan Pekan Ini": there is no editorial flag on programs, so the pick is
 * objective — the active program with the most funds raised (ties go to the
 * newest). Returns `null` when nothing is active so callers can fall back.
 */
export function pickFeaturedProgram(
  programs: readonly WaqfProgram[]
): WaqfProgram | null {
  let best: WaqfProgram | null = null;
  let bestRaised = -1;
  for (const program of programs) {
    const raised = toNumber(program.principalLedger?.pokokDanaTerkumpul);
    const newer = best !== null && program.createdAt > best.createdAt;
    if (raised > bestRaised || (raised === bestRaised && newer)) {
      best = program;
      bestRaised = raised;
    }
  }
  return best;
}

/** Real filter pills: each category actually used by an active program. */
export function categoryCounts(
  programs: readonly WaqfProgram[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const program of programs) {
    const name = program.kategori?.trim();
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const LEVELS = [
  { min: 0, level: 1, title: 'Relawan Perdana' },
  { min: 300, level: 2, title: 'Sahabat Kebaikan' },
  { min: 1000, level: 3, title: 'Dermawan Setia' },
  { min: 2000, level: 4, title: 'Muhsin Utama' },
] as const;

/** XP at which the top tier's progress bar is considered full. */
const TOP_TIER_TARGET = 5000;

export interface LevelInfo {
  title: string;
  level: number;
  nextTarget: number;
  /** 0-100, how far `saldo` is between this tier's floor and the next target. */
  progress: number;
}

export function levelProgress(saldo: number): LevelInfo {
  const xp = Math.max(0, saldo);
  const index = LEVELS.filter((tier) => xp >= tier.min).length - 1;
  const current = LEVELS[Math.max(0, index)] ?? LEVELS[0];
  const nextTarget = LEVELS[index + 1]?.min ?? TOP_TIER_TARGET;
  const span = nextTarget - current.min;
  const progress =
    span <= 0
      ? 100
      : Math.min(100, Math.round(((xp - current.min) / span) * 100));
  return {
    title: current.title,
    level: current.level,
    nextTarget,
    progress,
  };
}

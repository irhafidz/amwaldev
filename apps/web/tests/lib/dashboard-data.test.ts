import { describe, expect, test } from 'bun:test';
import {
  categoryCounts,
  levelProgress,
  pickFeaturedProgram,
} from '../../src/components/dashboard/dashboard-data';
import type { WaqfProgram } from '../../src/lib/amwal-api/types';

const program = (
  id: string,
  raised: string | null,
  createdAt: string,
  kategori: string | null = null
) =>
  ({
    id,
    kategori,
    createdAt,
    principalLedger: raised === null ? null : { pokokDanaTerkumpul: raised },
  }) as unknown as WaqfProgram;

describe('pickFeaturedProgram', () => {
  test('is null for no programs; otherwise the most funded, newest on ties', () => {
    expect(pickFeaturedProgram([])).toBeNull();
    const picked = pickFeaturedProgram([
      program('a', '100', '2026-01-01'),
      program('b', '900', '2026-02-01'),
      program('c', '900', '2026-03-01'),
      program('d', null, '2026-04-01'),
    ]);
    expect(picked?.id).toBe('c');
  });

  test('still picks something when no program has raised funds', () => {
    expect(pickFeaturedProgram([program('a', null, '2026-01-01')])?.id).toBe(
      'a'
    );
  });
});

describe('categoryCounts', () => {
  test('counts real categories, ignores blanks, sorts by count then name', () => {
    expect(
      categoryCounts([
        program('1', null, 'x', 'Pendidikan'),
        program('2', null, 'x', 'Kesehatan'),
        program('3', null, 'x', 'Pendidikan'),
        program('4', null, 'x', '  '),
        program('5', null, 'x', null),
      ])
    ).toEqual([
      { name: 'Pendidikan', count: 2 },
      { name: 'Kesehatan', count: 1 },
    ]);
    expect(categoryCounts([])).toEqual([]);
  });
});

describe('levelProgress', () => {
  test('a fresh account is level 1 at 0%', () => {
    expect(levelProgress(0)).toMatchObject({
      level: 1,
      progress: 0,
      nextTarget: 300,
    });
    expect(levelProgress(-5).progress).toBe(0);
  });

  test('progress is computed within the tier, not hard-coded', () => {
    expect(levelProgress(150)).toMatchObject({ level: 1, progress: 50 });
    expect(levelProgress(300)).toMatchObject({
      level: 2,
      progress: 0,
      nextTarget: 1000,
    });
    expect(levelProgress(650)).toMatchObject({ level: 2, progress: 50 });
  });

  test('the top tier fills up and never exceeds 100%', () => {
    expect(levelProgress(3500)).toMatchObject({
      level: 4,
      progress: 50,
      nextTarget: 5000,
    });
    expect(levelProgress(99_999).progress).toBe(100);
  });
});

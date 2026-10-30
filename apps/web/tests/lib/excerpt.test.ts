import { describe, expect, test } from 'bun:test';
import { makeExcerpt } from '../../src/lib/text/excerpt';

describe('makeExcerpt', () => {
  test('strips markdown noise, collapses whitespace, and leaves short text alone', () => {
    expect(makeExcerpt('## Judul\n\n**Tebal** dan _miring_')).toBe(
      'Judul Tebal dan miring'
    );
  });

  test('cuts long text at a word boundary with an ellipsis', () => {
    const out = makeExcerpt('kata '.repeat(60), 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith(' …')).toBe(false);
  });

  test('is safe for empty, null and undefined', () => {
    expect(makeExcerpt('')).toBe('');
    expect(makeExcerpt(null)).toBe('');
    expect(makeExcerpt(undefined)).toBe('');
  });
});

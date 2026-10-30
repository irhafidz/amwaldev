import { describe, expect, test } from 'bun:test';
import { cleanOptional } from '../../src/identity/guest';

/**
 * Instant, no-DB unit test for the pure half of `@amwal/core/identity/guest`
 * (Putaran 17, Batch 1). `resolveGuestDonor` itself touches the `users`
 * table and stays covered by `apps/server`'s DB-backed integration tests.
 */
describe('@amwal/core/identity/guest — cleanOptional', () => {
  test('trims whitespace and keeps a non-empty value', () => {
    expect(cleanOptional('  donor@example.com  ')).toBe('donor@example.com');
  });

  test('returns null for undefined', () => {
    expect(cleanOptional(undefined)).toBeNull();
  });

  test('returns null for an empty or whitespace-only string', () => {
    expect(cleanOptional('')).toBeNull();
    expect(cleanOptional('   ')).toBeNull();
  });
});

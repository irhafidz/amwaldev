import { describe, expect, test } from 'bun:test';
import { requireSession } from '../../src/lib/auth/require-session';

/** Audit C9: signed-in-only pages bounce guests to login with a return path. */
describe('requireSession', () => {
  test('redirects a guest to /auth/login and remembers where they were going', () => {
    let thrown: unknown;
    try {
      requireSession({
        context: { user: null },
        location: { href: '/riwayat?tab=wakaf' },
      });
    } catch (error) {
      thrown = error;
    }

    const options = (thrown as { options?: Record<string, unknown> }).options;
    expect(options?.to).toBe('/auth/login');
    expect(options?.search).toEqual({ redirect: '/riwayat?tab=wakaf' });
  });

  test('lets a signed-in user through', () => {
    expect(() =>
      requireSession({
        context: { user: { userId: 'u1' } },
        location: { href: '/riwayat' },
      })
    ).not.toThrow();
  });
});

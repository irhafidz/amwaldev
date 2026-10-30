import { redirect } from '@tanstack/react-router';

/**
 * `beforeLoad` guard for signed-in-only pages: a guest is sent to login with a
 * return path instead of seeing the page fail with a raw 401. UX only — the
 * oRPC procedures behind these pages enforce the session themselves.
 */
export function requireSession({
  context,
  location,
}: {
  context: { user?: unknown };
  location: { href: string };
}): void {
  if (!context.user) {
    throw redirect({
      to: '/auth/login',
      search: { redirect: location.href },
    });
  }
}

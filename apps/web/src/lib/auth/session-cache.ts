import type { SessionUser } from './types';

/**
 * Browser-side cache for the root route's `fetchSessionUser()` call.
 *
 * `__root`'s `beforeLoad` runs on every client navigation and blocks it: each
 * time it was an HTTP round trip to a server function plus a database lookup.
 * Within the TTL a navigation now reuses the last answer. Concurrent callers
 * share one request.
 *
 * On the server (SSR) nothing is cached here: every request has its own
 * cookie, and `fetchSessionUser` has its own short server cache.
 */
export const SESSION_TTL_MS = 60_000;

let cached: { at: number; user: SessionUser | null } | null = null;
let inflight: Promise<SessionUser | null> | null = null;

export function invalidateSessionUserCache(): void {
  cached = null;
  inflight = null;
}

export function getSessionUserCached(
  fetcher: () => Promise<SessionUser | null>,
  options: { isBrowser?: boolean; now?: () => number } = {}
): Promise<SessionUser | null> {
  const isBrowser = options.isBrowser ?? typeof window !== 'undefined';
  const now = options.now ?? Date.now;
  if (!isBrowser) {
    return fetcher();
  }

  if (cached && now() - cached.at < SESSION_TTL_MS) {
    return Promise.resolve(cached.user);
  }
  if (inflight) {
    return inflight;
  }

  const request = fetcher()
    .then((user) => {
      // Ignore the answer if the cache was invalidated while it was in flight.
      if (inflight === request) {
        cached = { at: now(), user };
      }
      return user;
    })
    .finally(() => {
      if (inflight === request) {
        inflight = null;
      }
    });
  inflight = request;
  return request;
}

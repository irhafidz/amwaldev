/**
 * In-memory cache + request de-duplication for client-side data loading.
 *
 * - `fetch` serves a stored value while it is younger than `staleTime`, and
 *   otherwise runs the loader. Two callers asking for the same key while one
 *   request is in flight share that one promise (no duplicate requests).
 * - Failures are never stored.
 * - `peek` lets a component start from cached data (no loading skeleton), then
 *   revalidate in the background when the value is older than its staleTime.
 *
 * ponytail: unbounded Map keyed by caller-chosen strings; fine for the small,
 * fixed set of admin/picklist keys. Add an eviction policy before keying by
 * free-form user input.
 */

export interface CacheEntry {
  at: number;
  data: unknown;
}

export function createResourceCache(clock: () => number = Date.now) {
  const entries = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<unknown>>();

  function peek<T>(key: string): { at: number; data: T } | undefined {
    return entries.get(key) as { at: number; data: T } | undefined;
  }

  function isFresh(key: string, staleTime: number): boolean {
    const hit = entries.get(key);
    return hit !== undefined && clock() - hit.at < staleTime;
  }

  function fetch<T>(
    key: string,
    loader: () => Promise<T>,
    options: { force?: boolean; staleTime: number }
  ): Promise<T> {
    if (!options.force) {
      if (isFresh(key, options.staleTime)) {
        return Promise.resolve((entries.get(key) as CacheEntry).data as T);
      }
      const pending = inflight.get(key);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    const request = loader()
      .then((data) => {
        entries.set(key, { at: clock(), data });
        return data;
      })
      .finally(() => {
        if (inflight.get(key) === request) {
          inflight.delete(key);
        }
      });
    inflight.set(key, request);
    return request;
  }

  /** Drops every entry whose key starts with `prefix` (all of them if omitted). */
  function invalidate(prefix = ''): void {
    for (const key of [...entries.keys()]) {
      if (key.startsWith(prefix)) {
        entries.delete(key);
      }
    }
    for (const key of [...inflight.keys()]) {
      if (key.startsWith(prefix)) {
        inflight.delete(key);
      }
    }
  }

  return { fetch, invalidate, isFresh, peek };
}

export const resourceCache = createResourceCache();

/** Call after a mutation so the next read of that data is not served stale. */
export function invalidateResources(prefix?: string): void {
  resourceCache.invalidate(prefix);
}

/** 30 s: admin dashboards and analytics. */
export const STALE_ADMIN_MS = 30_000;
/** 60 s: the public program list. Collected totals may lag by up to this long. */
export const STALE_PROGRAMS_MS = 60_000;
/** 5 min: master-data picklists, which change rarely. */
export const STALE_PICKLIST_MS = 300_000;

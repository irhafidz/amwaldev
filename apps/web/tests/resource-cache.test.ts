import { describe, expect, test } from 'bun:test';
import { createResourceCache } from '../src/lib/amwal-api/resource-cache';
import {
  cacheProfile,
  getCachedProfile,
  invalidateProfile,
  PROFILE_TTL_MS,
} from '../src/lib/auth/profile-cache';
import {
  getSessionUserCached,
  invalidateSessionUserCache,
  SESSION_TTL_MS,
} from '../src/lib/auth/session-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('resource cache', () => {
  test('serves a fresh result without calling the loader again', async () => {
    let now = 1000;
    const cache = createResourceCache(() => now);
    let calls = 0;
    const loader = () => {
      calls += 1;
      return Promise.resolve(`v${calls}`);
    };

    expect(await cache.fetch('k', loader, { staleTime: 30_000 })).toBe('v1');
    now += 29_999;
    expect(await cache.fetch('k', loader, { staleTime: 30_000 })).toBe('v1');
    expect(calls).toBe(1);

    now += 2;
    expect(await cache.fetch('k', loader, { staleTime: 30_000 })).toBe('v2');
    expect(calls).toBe(2);
  });

  test('concurrent callers share one in-flight request', async () => {
    const cache = createResourceCache();
    const gate = deferred<string>();
    let calls = 0;
    const loader = () => {
      calls += 1;
      return gate.promise;
    };

    const a = cache.fetch('k', loader, { staleTime: 1000 });
    const b = cache.fetch('k', loader, { staleTime: 1000 });
    gate.resolve('shared');

    expect(await a).toBe('shared');
    expect(await b).toBe('shared');
    expect(calls).toBe(1);
  });

  test('force bypasses both the cache and a request in flight', async () => {
    const cache = createResourceCache();
    let calls = 0;
    const loader = () => Promise.resolve(++calls);

    await cache.fetch('k', loader, { staleTime: 60_000 });
    await cache.fetch('k', loader, { staleTime: 60_000, force: true });

    expect(calls).toBe(2);
    expect(cache.peek<number>('k')?.data).toBe(2);
  });

  test('failures are not cached and the next call retries', async () => {
    const cache = createResourceCache();
    let calls = 0;
    const loader = () =>
      ++calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');

    await expect(
      cache.fetch('k', loader, { staleTime: 60_000 })
    ).rejects.toThrow('boom');
    expect(cache.peek('k')).toBeUndefined();
    expect(await cache.fetch('k', loader, { staleTime: 60_000 })).toBe('ok');
  });

  test('invalidate drops matching keys only', async () => {
    const cache = createResourceCache();
    await cache.fetch('master-data:A', () => Promise.resolve(1), {
      staleTime: 1000,
    });
    await cache.fetch('admin.kpi', () => Promise.resolve(2), {
      staleTime: 1000,
    });

    cache.invalidate('master-data:');

    expect(cache.peek('master-data:A')).toBeUndefined();
    expect(cache.peek('admin.kpi')).toBeDefined();
    cache.invalidate();
    expect(cache.peek('admin.kpi')).toBeUndefined();
  });
});

describe('session user cache (browser)', () => {
  const user = { userId: 'u1', role: 'ADMIN' as const, name: 'Siti' };

  test('navigations within the TTL reuse one answer', async () => {
    invalidateSessionUserCache();
    let now = 0;
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve(user);
    };
    const options = { isBrowser: true, now: () => now };

    await getSessionUserCached(fetcher, options);
    now += SESSION_TTL_MS - 1;
    expect(await getSessionUserCached(fetcher, options)).toEqual(user);
    expect(calls).toBe(1);

    now += 2;
    await getSessionUserCached(fetcher, options);
    expect(calls).toBe(2);
  });

  test('concurrent callers share one request; invalidate forces a new one', async () => {
    invalidateSessionUserCache();
    const gate = deferred<typeof user>();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return gate.promise;
    };
    const options = { isBrowser: true };

    const a = getSessionUserCached(fetcher, options);
    const b = getSessionUserCached(fetcher, options);
    gate.resolve(user);
    await Promise.all([a, b]);
    expect(calls).toBe(1);

    invalidateSessionUserCache();
    await getSessionUserCached(() => Promise.resolve(user), options);
    await getSessionUserCached(() => Promise.resolve(null), options);
    // second call is served from the cache populated by the first
    expect(
      await getSessionUserCached(() => Promise.resolve(null), options)
    ).toEqual(user);
  });

  test('on the server nothing is cached', async () => {
    invalidateSessionUserCache();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve(null);
    };

    await getSessionUserCached(fetcher, { isBrowser: false });
    await getSessionUserCached(fetcher, { isBrowser: false });

    expect(calls).toBe(2);
  });

  test('a login while a stale request is in flight is not overwritten by it', async () => {
    invalidateSessionUserCache();
    const slow = deferred<null>();
    const options = { isBrowser: true };

    const stale = getSessionUserCached(() => slow.promise, options);
    invalidateSessionUserCache();
    await getSessionUserCached(() => Promise.resolve(user), options);
    slow.resolve(null);
    await stale;

    expect(
      await getSessionUserCached(() => Promise.resolve(null), options)
    ).toEqual(user);
  });
});

describe('server profile cache', () => {
  test('returns the profile within the TTL, then expires it', () => {
    cacheProfile('u-ttl', { name: 'Siti' }, 0);

    expect(getCachedProfile('u-ttl', PROFILE_TTL_MS - 1)).toEqual({
      name: 'Siti',
    });
    expect(getCachedProfile('u-ttl', PROFILE_TTL_MS + 1)).toBeNull();
  });

  test('a profile edit drops its entry', () => {
    cacheProfile('u-edit', { name: 'Lama' }, 0);
    invalidateProfile('u-edit');

    expect(getCachedProfile('u-edit', 1)).toBeNull();
  });
});

import { useEffect, useRef, useState } from 'react';
import { resourceCache, STALE_ADMIN_MS } from './resource-cache';

export type ResourceState<T> =
  | { status: 'loading'; data?: never; error?: never }
  | { status: 'success'; data: T; error?: never }
  | { status: 'error'; data?: never; error: string };

interface UseResourceOptions {
  enabled?: boolean;
  /**
   * Opt in to caching and de-duplication. Resources with the same key share one
   * request and one stored result, across components and navigations. Without a
   * key the loader runs on every mount, as before.
   */
  key?: string;
  /**
   * How long a cached result counts as fresh (default 30 s). Fresh data is
   * served at once with no loading state; older data is shown immediately and
   * refreshed in the background.
   */
  staleTime?: number;
}

function initialState<T>(
  key: string | undefined,
  enabled: boolean
): ResourceState<T> {
  const cached = enabled && key ? resourceCache.peek<T>(key) : undefined;
  return cached
    ? { status: 'success', data: cached.data }
    : { status: 'loading' };
}

/** Stale data stays on screen while it is refreshed; otherwise show loading. */
function displayWhileLoading<T>(
  force: boolean,
  cached: { data: T } | undefined
): ResourceState<T> {
  return force || !cached
    ? { status: 'loading' }
    : { status: 'success', data: cached.data };
}

export function useResource<T>(
  loader: () => Promise<T>,
  options: UseResourceOptions = {}
): {
  state: ResourceState<T>;
  reload: () => void;
  /** Reload di latar: tampilan yang ada dibiarkan sampai data baru tiba. */
  refresh: () => void;
} {
  const enabled = options.enabled ?? true;
  const { key } = options;
  const staleTime = options.staleTime ?? STALE_ADMIN_MS;

  const [state, setState] = useState<ResourceState<T>>(() =>
    initialState<T>(key, enabled)
  );
  const loaderRef = useRef(loader);
  const runRef = useRef<((force: boolean, silent?: boolean) => void) | null>(
    null
  );
  // `mountedRef` + `runCountRef` drop a response that arrives after unmount or
  // after a newer load started: calling `setState` then is wasted work, and in
  // tests it runs after the DOM globals are gone (`window is not defined`).
  const mountedRef = useRef(true);
  const runCountRef = useRef(0);
  loaderRef.current = loader;
  runRef.current = (force: boolean, silent = false) => {
    if (!enabled) {
      return;
    }

    runCountRef.current += 1;
    const runId = runCountRef.current;
    const isCurrent = () => mountedRef.current && runId === runCountRef.current;
    const cached = key ? resourceCache.peek<T>(key) : undefined;

    // Fresh cache: serve it at once, no request, no loading state.
    if (!force && key && cached && resourceCache.isFresh(key, staleTime)) {
      if (isCurrent()) {
        setState({ status: 'success', data: cached.data });
      }
      return;
    }

    // A silent reload never touches what is on screen until data arrives.
    if (!silent) {
      setState(displayWhileLoading(force, cached));
    }

    const request = key
      ? resourceCache.fetch(key, () => loaderRef.current(), {
          force,
          staleTime,
        })
      : loaderRef.current();

    request
      .then((data) => {
        if (isCurrent()) {
          setState({ status: 'success', data });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent() && !silent) {
          const message =
            error instanceof Error ? error.message : 'Terjadi kesalahan.';
          setState({ status: 'error', error: message });
        }
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: enabled and key are read inside runRef and intentionally retrigger the load
  useEffect(() => {
    runRef.current?.(false);
  }, [enabled, key]);

  return {
    state,
    reload: () => {
      runRef.current?.(true);
    },
    refresh: () => {
      runRef.current?.(true, true);
    },
  };
}

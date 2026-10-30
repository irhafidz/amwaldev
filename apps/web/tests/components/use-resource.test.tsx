import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/',
});

const GLOBAL_NAMES = [
  'document',
  'Event',
  'HTMLElement',
  'MouseEvent',
  'navigator',
  'Node',
  'window',
] as const;
const previous = new Map<string, unknown>();
for (const name of GLOBAL_NAMES) {
  previous.set(name, (globalThis as Record<string, unknown>)[name]);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name as keyof typeof dom.window],
  });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook, waitFor } = await import(
  '@testing-library/react'
);
const { useResource } = await import('../../src/lib/amwal-api/use-resource');
const { invalidateResources } = await import(
  '../../src/lib/amwal-api/resource-cache'
);

afterEach(() => {
  cleanup();
  invalidateResources();
});

afterAll(() => {
  cleanup();
  for (const [name, value] of previous) {
    if (value === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value,
      });
    }
  }
  dom.window.close();
});

/** renderHook, remembering every state the hook rendered with. */
function renderTracked<T>(
  load: () => Promise<T>,
  options: { key: string; staleTime: number }
) {
  const seen: unknown[] = [];
  const hook = renderHook(() => {
    const resource = useResource(load, options);
    seen.push(resource.state);
    return resource;
  });
  return { hook, seen };
}

function counter(prefix = 'v') {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    load: () => {
      calls += 1;
      return Promise.resolve(`${prefix}${calls}`);
    },
  };
}

describe('useResource without a key', () => {
  test('behaves as before: every mount loads', async () => {
    const source = counter();

    const first = renderHook(() => useResource(source.load));
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('success')
    );
    const second = renderHook(() => useResource(source.load));
    await waitFor(() =>
      expect(second.result.current.state.status).toBe('success')
    );

    expect(source.calls).toBe(2);
  });
});

describe('useResource with a key', () => {
  test('a second mount within staleTime starts as success, with no request', async () => {
    const source = counter();
    const options = { key: 'test.fresh', staleTime: 60_000 };

    const first = renderHook(() => useResource(source.load, options));
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('success')
    );
    first.unmount();

    const second = renderTracked(source.load, options);
    // First render already has the data: no loading skeleton.
    expect(second.seen[0]).toEqual({ status: 'success', data: 'v1' });
    expect(source.calls).toBe(1);
  });

  test('concurrent mounts of one key share a single request', async () => {
    const source = counter();
    const options = { key: 'test.dedupe', staleTime: 60_000 };

    const a = renderHook(() => useResource(source.load, options));
    const b = renderHook(() => useResource(source.load, options));
    await waitFor(() => expect(a.result.current.state.status).toBe('success'));
    await waitFor(() => expect(b.result.current.state.status).toBe('success'));

    expect(source.calls).toBe(1);
    expect(a.result.current.state).toEqual(b.result.current.state);
  });

  test('stale data is shown at once and refreshed in the background', async () => {
    const source = counter();
    const options = { key: 'test.stale', staleTime: 0 };

    const first = renderHook(() => useResource(source.load, options));
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('success')
    );
    first.unmount();

    const second = renderTracked(source.load, options);
    expect(second.seen[0]).toEqual({ status: 'success', data: 'v1' });
    await waitFor(() =>
      expect(second.hook.result.current.state).toEqual({
        status: 'success',
        data: 'v2',
      })
    );
    expect(source.calls).toBe(2);
  });

  test('reload() always asks again', async () => {
    const source = counter();
    const hook = renderHook(() =>
      useResource(source.load, { key: 'test.reload', staleTime: 60_000 })
    );
    await waitFor(() =>
      expect(hook.result.current.state.status).toBe('success')
    );

    act(() => hook.result.current.reload());
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({
        status: 'success',
        data: 'v2',
      })
    );
  });

  test('a failure shows the error and is not cached', async () => {
    let calls = 0;
    const failing = () =>
      ++calls === 1
        ? Promise.reject(new Error('gagal'))
        : Promise.resolve('ok');
    const options = { key: 'test.error', staleTime: 60_000 };

    const first = renderHook(() => useResource(failing, options));
    await waitFor(() =>
      expect(first.result.current.state).toEqual({
        status: 'error',
        error: 'gagal',
      })
    );
    first.unmount();

    const second = renderHook(() => useResource(failing, options));
    await waitFor(() =>
      expect(second.result.current.state.status).toBe('success')
    );
  });
});

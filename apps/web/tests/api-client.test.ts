import { describe, expect, it } from 'bun:test';
import { ApiClient } from '../src/lib/api/client';

describe('S10-A-03: type-safe API client with refresh mutex', () => {
  it('10 parallel 401s trigger exactly one refresh request', async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;

    const fetchImpl = (): Promise<Response> => {
      protectedCalls += 1;
      if (protectedCalls <= 10) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'expired' }), {
            status: 401,
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ message: 'ok' }), { status: 200 })
      );
    };

    const client = new ApiClient({
      fetchImpl,
      refreshImpl: () => {
        refreshCalls += 1;
        return Promise.resolve(true);
      },
      onAuthFailure: () => {
        throw new Error('refresh should not fail');
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.request<{ message: string }>('/api/private/data')
      )
    );

    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(20);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('keeps the retried request when one refresh succeeds', async () => {
    let protectedCalls = 0;

    const fetchImpl = (
      _input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      if (init?.method === 'POST') {
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      protectedCalls += 1;
      return Promise.resolve(
        protectedCalls === 1
          ? new Response('{"error":"expired"}', { status: 401 })
          : new Response('{"data":"fresh"}', { status: 200 })
      );
    };

    const client = new ApiClient({
      fetchImpl,
      refreshImpl: () => Promise.resolve(true),
    });

    const result = await client.request<{ data: string }>('/api/protected');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toBe('fresh');
    }
  });

  it('does not refresh for login endpoint failures', async () => {
    let refreshCalls = 0;
    const client = new ApiClient({
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Kredensial salah' }), {
            status: 401,
          })
        ),
      refreshImpl: () => {
        refreshCalls += 1;
        return Promise.resolve(true);
      },
    });

    const result = await client.request('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'x@y.z', password: 'wrong' },
      skipAuthRefresh: true,
    });

    expect(refreshCalls).toBe(0);
    expect(result.ok).toBe(false);
  });
});

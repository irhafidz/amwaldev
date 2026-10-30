import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const realFetch = globalThis.fetch;
const calls: string[] = [];
let meStatuses: number[] = [];
let refreshOk = true;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify({ json: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  calls.length = 0;
  meStatuses = [401, 200];
  refreshOk = true;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'http://localhost' } },
  });
  globalThis.fetch = ((input: Request) => {
    const path = new URL(input.url).pathname;
    calls.push(path);
    if (path === '/rpc/auth/refresh') {
      return Promise.resolve(
        refreshOk ? json({ message: 'ok' }) : json({}, 401)
      );
    }
    const status = meStatuses.shift() ?? 200;
    return Promise.resolve(
      status === 200 ? json({ userId: 'u1', role: 'ADMIN' }) : json({}, status)
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Reflect.deleteProperty(globalThis, 'window');
});

describe('oRPC client session refresh', () => {
  it('rotates the session once on 401 and replays the request', async () => {
    const { orpc } = await import('../../src/lib/orpc/client');
    const result = await orpc.auth.me();
    expect(result).toBeDefined();
    expect(calls).toEqual([
      '/rpc/auth/me',
      '/rpc/auth/refresh',
      '/rpc/auth/me',
    ]);
  });

  it('does not replay when the refresh itself fails', async () => {
    refreshOk = false;
    const { orpc } = await import('../../src/lib/orpc/client');
    await expect(orpc.auth.me()).rejects.toBeDefined();
    expect(calls).toEqual(['/rpc/auth/me', '/rpc/auth/refresh']);
  });
});

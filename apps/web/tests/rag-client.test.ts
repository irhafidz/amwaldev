import { afterAll, describe, expect, test } from 'bun:test';
import {
  askRag,
  RagError,
  type RagErrorKind,
  withSources,
} from '../src/lib/rag/client';

/** A fake amwal-rag that follows the real contract (`POST /chat`, `X-API-Key`). */
let mode: 'ok' | number | 'slow' = 'ok';
const requests: { body: unknown; key: string | null; path: string }[] = [];

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    requests.push({
      body: await request.json().catch(() => null),
      key: request.headers.get('x-api-key'),
      path: url.pathname,
    });
    if (mode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (typeof mode === 'number') {
      return Response.json(
        { request_id: 'r1', error: { code: 'x', message: `pesan ${mode}` } },
        { status: mode }
      );
    }
    return Response.json({
      request_id: 'r1',
      answer: 'Nisab zakat penghasilan setara 85 gram emas.',
      sources: [
        { sumber: 'Panduan Zakat', unit: 'Bab 2', halaman: 14 },
        { sumber: 'Fatwa MUI', unit: 'No. 3', halaman: null },
      ],
    });
  },
});

afterAll(() => {
  server.stop(true);
});

const deps = (overrides: Partial<Parameters<typeof askRag>[1]> = {}) => ({
  apiKey: 'kunci-rahasia',
  baseUrl: `http://127.0.0.1:${server.port}/`,
  retryDelayMs: 5,
  timeoutMs: 5000,
  ...overrides,
});

async function kindOf(promise: Promise<unknown>): Promise<RagErrorKind | null> {
  try {
    await promise;
  } catch (error) {
    return error instanceof RagError ? error.kind : null;
  }
  return null;
}

describe('askRag', () => {
  test('sends the contract request and parses the cited answer', async () => {
    mode = 'ok';
    requests.length = 0;

    const result = await askRag('Berapa nisab zakat penghasilan?', deps());

    expect(requests).toEqual([
      {
        body: { question: 'Berapa nisab zakat penghasilan?' },
        key: 'kunci-rahasia',
        path: '/chat',
      },
    ]);
    expect(result.answer).toContain('85 gram emas');
    expect(result.sources).toHaveLength(2);
  });

  test.each([
    [429, 'busy'],
    [422, 'invalid'],
    [401, 'misconfigured'],
    [504, 'timeout'],
    [503, 'unavailable'],
    [500, 'unavailable'],
  ] as const)('HTTP %d is reported as "%s"', async (status, kind) => {
    mode = status;

    expect(await kindOf(askRag('pertanyaan', deps()))).toBe(kind);
  });

  test('carries the service message of a rejection', async () => {
    mode = 422;

    try {
      await askRag('pertanyaan', deps());
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as RagError).message).toBe('pesan 422');
      expect((error as RagError).status).toBe(422);
    }
  });

  test('an unreachable service is "unavailable", not a thrown network error', async () => {
    expect(
      await kindOf(
        askRag('pertanyaan', deps({ baseUrl: 'http://127.0.0.1:1' }))
      )
    ).toBe('unavailable');
  });

  test('a service slower than the deadline is "timeout"', async () => {
    mode = 'slow';

    expect(await kindOf(askRag('pertanyaan', deps({ timeoutMs: 60 })))).toBe(
      'timeout'
    );
  });

  test('a body that is not the contract is "unavailable"', async () => {
    const odd = await askRag('x', {
      ...deps(),
      fetch: (() =>
        Promise.resolve(
          Response.json({ hello: 'world' })
        )) as unknown as typeof fetch,
    }).catch((error: unknown) => error);

    expect(odd).toBeInstanceOf(RagError);
    expect((odd as RagError).kind).toBe('unavailable');
  });
});

describe('askRag retry', () => {
  const sequence = (statuses: number[]) => {
    let calls = 0;
    const fake = (() => {
      const status = statuses[calls] ?? 200;
      calls += 1;
      return Promise.resolve(
        status === 200
          ? Response.json({ answer: 'ok', sources: [] })
          : Response.json({ error: { code: 'x', message: 'm' } }, { status })
      );
    }) as unknown as typeof fetch;
    return { calls: () => calls, fake };
  };

  test.each([429, 503])(
    'HTTP %d is retried once and can recover',
    async (status) => {
      const { calls, fake } = sequence([status]);

      const result = await askRag('pertanyaan', { ...deps(), fetch: fake });

      expect(result.answer).toBe('ok');
      expect(calls()).toBe(2);
    }
  );

  test('gives up after the single retry', async () => {
    const { calls, fake } = sequence([503, 503, 503]);

    expect(await kindOf(askRag('pertanyaan', { ...deps(), fetch: fake }))).toBe(
      'unavailable'
    );
    expect(calls()).toBe(2);
  });

  test.each([504, 401, 422, 500])(
    'HTTP %d is never retried',
    async (status) => {
      const { calls, fake } = sequence([status, 200]);

      await kindOf(askRag('pertanyaan', { ...deps(), fetch: fake }));

      expect(calls()).toBe(1);
    }
  );

  test('waits the backoff before retrying', async () => {
    const { fake } = sequence([429]);
    const started = Date.now();

    await askRag('pertanyaan', { ...deps({ retryDelayMs: 120 }), fetch: fake });

    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
  });
});

describe('withSources', () => {
  test('appends a Markdown list of sources, with page numbers when known', () => {
    const text = withSources({
      answer: 'Jawaban.',
      sources: [
        { sumber: 'Panduan Zakat', unit: 'Bab 2', halaman: 14 },
        { sumber: 'Fatwa MUI', unit: 'No. 3', halaman: null },
      ],
    });

    expect(text).toContain('Jawaban.');
    expect(text).toContain('**Sumber rujukan:**');
    expect(text).toContain('- Panduan Zakat (Bab 2, hlm. 14)');
    expect(text).toContain('- Fatwa MUI (No. 3)');
  });

  test('leaves the answer alone when there are no sources', () => {
    expect(withSources({ answer: 'Tidak ditemukan.', sources: [] })).toBe(
      'Tidak ditemukan.'
    );
  });
});

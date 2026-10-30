import { describe, expect, test } from 'bun:test';
import {
  MayarApiError,
  type MayarFetchImplementation,
  MayarPaymentProvider,
  resolveMayarBaseUrl,
} from '../../src/payment/mayar.provider';
import { PAYMENT_METHODS } from '../../src/payment/methods';
import { toDisbursementDestination } from '../../src/payment/types';

const WEBHOOK_TOKEN = 'a'.repeat(128);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function createProvider(
  fetchImpl: MayarFetchImplementation,
  sleeps: number[] = []
): MayarPaymentProvider {
  return new MayarPaymentProvider({
    apiKey: 'mayar-sandbox-key',
    fetchImpl,
    webhookSecret: WEBHOOK_TOKEN,
    // Backoff dicatat, tidak ditunggu: tes tetap cepat dan jedanya bisa
    // dipastikan.
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
}

const PAYMENT_RECEIVED = JSON.stringify({
  data: { transactionId: 'mayar-transaction-id' },
  event: 'payment.received',
});

const PAID_DETAIL = {
  data: { amount: 10_000, id: 'mayar-transaction-id', status: 'paid' },
  statusCode: 200,
};

function timeoutError(): Error {
  const error = new Error('timeout');
  error.name = 'TimeoutError';
  return error;
}

/** fetch palsu yang menjawab berurutan dan mencatat setiap panggilan. */
function scriptedFetch(steps: Array<() => Promise<Response>>): {
  calls: RequestInit[];
  fetchImpl: MayarFetchImplementation;
} {
  const calls: RequestInit[] = [];
  const fetchImpl: MayarFetchImplementation = (_input, init) => {
    calls.push(init ?? {});
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return step ? step() : Promise.reject(new Error('no scripted step'));
  };
  return { calls, fetchImpl };
}

function mayarWebhookRequest(token = WEBHOOK_TOKEN): Request {
  return new Request('https://example.com/webhooks/mayar', {
    headers: { 'x-callback-token': token },
    method: 'POST',
  });
}

describe('@amwal/core/payment/mayar.provider', () => {
  test('createTransaction uses the Mayar v2 create endpoint and returns providerRef', async () => {
    const calls: string[] = [];
    const provider = createProvider((input) => {
      calls.push(String(input));
      return Promise.resolve(
        jsonResponse({
          data: {
            id: 'payment-request-id',
            link: 'https://amwal-its.myr.lat/invoices/test',
            transaction_id: 'mayar-transaction-id',
          },
          messages: 'success',
          statusCode: 200,
        })
      );
    });

    const result = await provider.createTransaction({
      disbursementDestination: toDisbursementDestination('FUND_TEST'),
      grossAmount: '10000',
      orderId: '800926000001',
      paymentType: 'qris',
    });

    expect(calls[0]).toBe('https://api.mayar.id/hl/v2/payments/create');
    expect(result.providerRef).toBe('mayar-transaction-id');
    expect(result.redirectUrl).toBe('https://amwal-its.myr.lat/invoices/test');
  });

  describe('multi-method create payment', () => {
    const NOW = new Date('2026-10-07T03:00:00.000Z');
    const created = {
      data: {
        id: 'payment-request-id',
        link: 'https://amwal-its.myr.lat/invoices/test',
        transactionId: 'mayar-transaction-id',
      },
      messages: 'success',
      statusCode: 200,
    };

    function qrisProvider(
      fetchImpl: MayarFetchImplementation,
      overrides: { baseUrl?: string; expiresInMinutes?: number } = {}
    ) {
      return new MayarPaymentProvider({
        apiKey: 'mayar-key',
        fetchImpl,
        now: () => NOW,
        webhookSecret: WEBHOOK_TOKEN,
        ...overrides,
      });
    }

    const payload = {
      customerEmail: 'donatur@example.com',
      customerMobile: '081200000000',
      customerName: 'Hamba Allah',
      description: 'Donasi Wakaf - Wakaf ITS',
      disbursementDestination: toDisbursementDestination('FUND_TEST'),
      grossAmount: '25000' as const,
      orderId: '800926000001',
      paymentType: 'qris' as const,
      redirectUrl: 'https://amwal.id/wakaf/status?orderId=800926000001',
    };

    test('sends QRIS by default, with a 24h expiry', async () => {
      const { calls, fetchImpl } = scriptedFetch([
        () => Promise.resolve(jsonResponse(created)),
      ]);

      const result = await qrisProvider(fetchImpl).createTransaction(payload);

      const sent = JSON.parse(String(calls[0]?.body)) as Record<
        string,
        unknown
      >;
      expect(sent.paymentMethod).toBe('qris');
      expect(sent.amount).toBe(25_000);
      expect(sent.redirectUrl).toBe(payload.redirectUrl);
      expect(sent.expiredAt).toBe('2026-10-08T03:00:00.000Z');
      expect(sent.extraData).toEqual({ orderId: '800926000001' });
      expect((calls[0]?.headers as Record<string, string>).Authorization).toBe(
        'Bearer mayar-key'
      );
      expect(result).toEqual({
        expiredAt: '2026-10-08T03:00:00.000Z',
        paymentType: 'qris',
        providerRef: 'mayar-transaction-id',
        redirectUrl: 'https://amwal-its.myr.lat/invoices/test',
      });
    });

    test.each(PAYMENT_METHODS.map((method) => method.code))(
      'forwards %s to Mayar as paymentMethod and echoes it back',
      async (code) => {
        const { calls, fetchImpl } = scriptedFetch([
          () => Promise.resolve(jsonResponse(created)),
        ]);

        const result = await qrisProvider(fetchImpl).createTransaction({
          ...payload,
          paymentType: code,
        });

        const sent = JSON.parse(String(calls[0]?.body)) as {
          paymentMethod: string;
        };
        expect(sent.paymentMethod).toBe(code);
        expect(result.paymentType).toBe(code);
      }
    );

    test('surfaces the Mayar message when a channel is disabled in the dashboard', async () => {
      const { fetchImpl } = scriptedFetch([
        () =>
          Promise.resolve(
            jsonResponse(
              {
                messages:
                  'Payment method "va/bni" is not available or disabled',
                statusCode: 400,
              },
              400
            )
          ),
      ]);

      await expect(
        qrisProvider(fetchImpl).createTransaction({
          ...payload,
          paymentType: 'va/bni',
        })
      ).rejects.toThrow('is not available or disabled');
    });

    test('gives donors without an email a unique placeholder per order (Mayar rejects same email + amount within 1 minute)', async () => {
      const bodies: Record<string, unknown>[] = [];
      const fetchImpl: MayarFetchImplementation = (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Promise.resolve(jsonResponse(created));
      };
      const provider = qrisProvider(fetchImpl);

      await provider.createTransaction({
        ...payload,
        customerEmail: undefined,
        orderId: '800926000001',
      });
      await provider.createTransaction({
        ...payload,
        customerEmail: undefined,
        orderId: '800926000002',
      });
      await provider.createTransaction({ ...payload, orderId: '800926000003' });

      expect(bodies[0]?.email).toBe('hamba-allah+800926000001@amwal.id');
      expect(bodies[1]?.email).toBe('hamba-allah+800926000002@amwal.id');
      expect(bodies[0]?.email).not.toBe(bodies[1]?.email);
      // A real email is used exactly as given.
      expect(bodies[2]?.email).toBe('donatur@example.com');
    });

    test.each([
      [
        400,
        'Duplicate request detected. Please wait 1 minute before trying again.',
        'duplicate',
      ],
      [
        400,
        'Payment method "va/bni" is not available or disabled',
        'method_unavailable',
      ],
      [401, 'Unauthorized', 'rejected'],
      [500, 'boom', 'unavailable'],
    ] as const)(
      'classifies HTTP %i "%s" as %s',
      async (status, messages, kind) => {
        const { fetchImpl } = scriptedFetch([
          () =>
            Promise.resolve(
              jsonResponse({ messages, statusCode: status }, status)
            ),
        ]);

        const error = await qrisProvider(fetchImpl)
          .createTransaction(payload)
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(MayarApiError);
        expect((error as MayarApiError).kind).toBe(kind);
        expect((error as MayarApiError).status).toBe(status);
      }
    );

    test('a network failure or timeout is "unavailable", never a raw fetch error', async () => {
      const network = await qrisProvider(() =>
        Promise.reject(new TypeError('fetch failed'))
      )
        .createTransaction(payload)
        .catch((caught: unknown) => caught);
      const timeout = await qrisProvider(() => Promise.reject(timeoutError()))
        .createTransaction(payload)
        .catch((caught: unknown) => caught);

      expect((network as MayarApiError).kind).toBe('unavailable');
      expect((timeout as MayarApiError).kind).toBe('unavailable');
      expect((timeout as MayarApiError).message).toContain('timed out');
    });

    test('uses the transaction id, not the payment request id, as providerRef', async () => {
      const { fetchImpl } = scriptedFetch([
        () => Promise.resolve(jsonResponse(created)),
      ]);

      const result = await qrisProvider(fetchImpl).createTransaction(payload);

      expect(result.providerRef).toBe('mayar-transaction-id');
      expect(result.providerRef).not.toBe('payment-request-id');
    });

    test.each([
      'virtual_account',
      'bank_transfer',
      'credit_card',
      'gopay',
      'ewallet/jenius',
      'va/unknown',
    ] as const)(
      'refuses unsupported method %s without calling Mayar',
      async (paymentType) => {
        const { calls, fetchImpl } = scriptedFetch([
          () => Promise.resolve(jsonResponse(created)),
        ]);

        await expect(
          qrisProvider(fetchImpl).createTransaction({
            ...payload,
            paymentType: paymentType as never,
          })
        ).rejects.toThrow('Metode pembayaran tidak didukung Mayar');
        expect(calls).toHaveLength(0);
      }
    );

    test('derives the v2 URLs from the configured base URL', async () => {
      const urls: string[] = [];
      const fetchImpl: MayarFetchImplementation = (input) => {
        urls.push(String(input));
        return Promise.resolve(
          urls.length === 1 ? jsonResponse(created) : jsonResponse(PAID_DETAIL)
        );
      };
      const provider = qrisProvider(fetchImpl, {
        baseUrl: 'https://api.mayar.io/hl/v2/',
      });

      await provider.createTransaction(payload);
      await provider.reconcileTransaction('mayar-transaction-id');

      expect(urls).toEqual([
        'https://api.mayar.io/hl/v2/payments/create',
        'https://api.mayar.io/hl/v2/transactions/mayar-transaction-id',
      ]);
    });

    test('surfaces the Mayar error message when creation is rejected', async () => {
      const { fetchImpl } = scriptedFetch([
        () =>
          Promise.resolve(
            jsonResponse(
              { messages: 'channel not enabled', statusCode: 400 },
              400
            )
          ),
      ]);

      await expect(
        qrisProvider(fetchImpl).createTransaction(payload)
      ).rejects.toThrow('channel not enabled');
    });

    test('honours a custom expiry', async () => {
      const { calls, fetchImpl } = scriptedFetch([
        () => Promise.resolve(jsonResponse(created)),
      ]);

      await qrisProvider(fetchImpl, { expiresInMinutes: 30 }).createTransaction(
        payload
      );

      const sent = JSON.parse(String(calls[0]?.body)) as { expiredAt: string };
      expect(sent.expiredAt).toBe('2026-10-07T03:30:00.000Z');
    });
  });

  test('rejects a missing webhook secret at construction', () => {
    expect(
      () =>
        new MayarPaymentProvider({
          apiKey: 'mayar-key',
          webhookSecret: '   ',
        })
    ).toThrow('MAYAR_WEBHOOK_SECRET');
  });

  test('accepts a valid callback token and returns a re-fetched LUNAS event', async () => {
    const calls: string[] = [];
    const provider = createProvider((input) => {
      calls.push(String(input));
      return Promise.resolve(
        jsonResponse({
          data: {
            amount: 10_000,
            id: 'mayar-transaction-id',
            status: 'paid',
          },
          messages: 'success',
          statusCode: 200,
        })
      );
    });

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      JSON.stringify({
        data: {
          id: 'mayar-webhook-id',
          status: 'SUCCESS',
          transactionId: 'mayar-transaction-id',
        },
        event: 'payment.received',
      })
    );

    expect(calls[0]).toBe(
      'https://api.mayar.id/hl/v2/transactions/mayar-transaction-id'
    );
    expect(result).toEqual({
      type: 'event',
      event: {
        expectedAmount: '10000',
        orderId: null,
        outcome: 'LUNAS',
        providerRef: 'mayar-transaction-id',
      },
    });
  });

  test('uses re-fetch status SUCCESS or paid as LUNAS and created as PENDING', async () => {
    const statuses = ['SUCCESS', 'paid', 'created'] as const;

    for (const status of statuses) {
      const provider = createProvider(() =>
        Promise.resolve(
          jsonResponse({
            data: { amount: 10_000, status },
            statusCode: 200,
          })
        )
      );
      const result = await provider.resolveWebhook(
        mayarWebhookRequest(),
        JSON.stringify({
          data: { transactionId: 'mayar-transaction-id' },
          event: 'payment.received',
        })
      );

      expect(result.type).toBe('event');
      if (result.type === 'event') {
        expect(result.event.outcome).toBe(
          status === 'created' ? 'PENDING' : 'LUNAS'
        );
      }
    }
  });

  test('rejects an invalid callback token before any re-fetch', async () => {
    let fetchCalls = 0;
    const provider = createProvider(() => {
      fetchCalls += 1;
      return Promise.resolve(jsonResponse({}));
    });

    const result = await provider.resolveWebhook(
      mayarWebhookRequest('wrong-token'),
      JSON.stringify({ event: 'payment.received' })
    );

    expect(fetchCalls).toBe(0);
    expect(result).toEqual({
      type: 'rejected',
      status: 403,
      message: 'Invalid webhook signature',
    });
  });

  test('ignores non-payment.received events without re-fetch', async () => {
    let fetchCalls = 0;
    const provider = createProvider(() => {
      fetchCalls += 1;
      return Promise.resolve(jsonResponse({}));
    });

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      JSON.stringify({ event: 'payment.reminder' })
    );

    expect(fetchCalls).toBe(0);
    expect(result).toEqual({ type: 'ignored' });
  });

  test('returns retry 504 on re-fetch timeout, never GAGAL', async () => {
    const provider = createProvider(() => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    });

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      JSON.stringify({
        data: { transactionId: 'mayar-transaction-id' },
        event: 'payment.received',
      })
    );

    expect(result).toEqual({
      type: 'retry',
      status: 504,
      message: 'Mayar transaction re-fetch timed out',
    });
  });

  test('returns retry 502 when Mayar re-fetch fails with 5xx', async () => {
    const provider = createProvider(() =>
      Promise.resolve(jsonResponse({ messages: 'boom' }, 500))
    );

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      JSON.stringify({
        data: { transactionId: 'mayar-transaction-id' },
        event: 'payment.received',
      })
    );

    expect(result).toEqual({
      type: 'retry',
      status: 502,
      message: 'Mayar transaction re-fetch failed with HTTP 500',
    });
  });
});

describe('@amwal/core/payment/mayar.provider — retry re-fetch', () => {
  test('5xx lalu sukses: satu retry setelah jeda 500 ms, hasil LUNAS', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.resolve(jsonResponse({ messages: 'boom' }, 503)),
      () => Promise.resolve(jsonResponse(PAID_DETAIL)),
    ]);
    const provider = createProvider(fetchImpl, sleeps);

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      PAYMENT_RECEIVED
    );

    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([500]);
    expect(result).toEqual({
      type: 'event',
      event: {
        expectedAmount: '10000',
        orderId: null,
        outcome: 'LUNAS',
        providerRef: 'mayar-transaction-id',
      },
    });
  });

  test('timeout terus-menerus: tepat 3 permintaan, jeda 500 lalu 1000 ms, 504 bukan GAGAL', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.reject(timeoutError()),
    ]);
    const provider = createProvider(fetchImpl, sleeps);

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      PAYMENT_RECEIVED
    );

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
    expect(result).toEqual({
      type: 'retry',
      status: 504,
      message: 'Mayar transaction re-fetch timed out',
    });
  });

  test('error jaringan lalu sukses pada percobaan ketiga', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.resolve(jsonResponse(PAID_DETAIL)),
    ]);
    const provider = createProvider(fetchImpl, sleeps);

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      PAYMENT_RECEIVED
    );

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
    expect(result.type).toBe('event');
  });

  test('4xx tidak pernah dicoba ulang, tetapi tetap bukan GAGAL', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.resolve(jsonResponse({ messages: 'unauthorized' }, 401)),
    ]);
    const provider = createProvider(fetchImpl, sleeps);

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      PAYMENT_RECEIVED
    );

    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(result).toEqual({
      type: 'retry',
      status: 502,
      message: 'Mayar transaction re-fetch rejected with HTTP 401',
    });
  });

  test('404 ditolak seketika tanpa retry', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.resolve(jsonResponse({ messages: 'not found' }, 404)),
    ]);
    const provider = createProvider(fetchImpl, sleeps);

    const result = await provider.resolveWebhook(
      mayarWebhookRequest(),
      PAYMENT_RECEIVED
    );

    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(result).toEqual({
      type: 'rejected',
      status: 404,
      message: 'Mayar transaction not found',
    });
  });

  test('setiap percobaan memakai sinyal timeout baru', async () => {
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.reject(timeoutError()),
    ]);
    const provider = createProvider(fetchImpl);

    await provider.resolveWebhook(mayarWebhookRequest(), PAYMENT_RECEIVED);

    const signals = calls.map((init) => init.signal);
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
  });

  test('konfigurasi retry lebih dari dua dipotong ke dua', async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = scriptedFetch([
      () => Promise.reject(timeoutError()),
    ]);
    const provider = new MayarPaymentProvider({
      apiKey: 'mayar-sandbox-key',
      fetchImpl,
      retryDelaysMs: [10, 20, 30, 40],
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      webhookSecret: WEBHOOK_TOKEN,
    });

    await provider.resolveWebhook(mayarWebhookRequest(), PAYMENT_RECEIVED);

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([10, 20]);
  });
});

describe('resolveMayarBaseUrl', () => {
  test.each([
    ['https://api.mayar.id/hl/v2', 'https://api.mayar.id/hl/v2'],
    ['https://api.mayar.id/hl/v2/', 'https://api.mayar.id/hl/v2'],
    ['https://api.mayar.id/hl/v1', 'https://api.mayar.id/hl/v2'],
    ['https://api.mayar.id/hl/v1/', 'https://api.mayar.id/hl/v2'],
    ['https://api.mayar.id', 'https://api.mayar.id/hl/v2'],
    ['https://api.mayar.id/', 'https://api.mayar.id/hl/v2'],
    ['  https://api.mayar.io/hl/v2  ', 'https://api.mayar.io/hl/v2'],
    [undefined, 'https://api.mayar.id/hl/v2'],
    ['', 'https://api.mayar.id/hl/v2'],
  ])('%j → %s (one /hl/v2, never doubled, never v1)', (input, expected) => {
    expect(resolveMayarBaseUrl(input)).toBe(expected);
  });

  test('the provider pins every endpoint to v2, even when handed a v1 or v2 base', async () => {
    const urls: string[] = [];
    const fetchImpl: MayarFetchImplementation = (input) => {
      urls.push(String(input));
      return Promise.resolve(
        urls.length === 1
          ? jsonResponse({
              data: { link: 'https://pay.example/x', transactionId: 'tx-1' },
              messages: 'success',
              statusCode: 200,
            })
          : jsonResponse(PAID_DETAIL)
      );
    };

    for (const baseUrl of [
      'https://api.mayar.id/hl/v2',
      'https://api.mayar.id/hl/v1',
      'https://api.mayar.id',
    ]) {
      urls.length = 0;
      const provider = new MayarPaymentProvider({
        apiKey: 'k',
        baseUrl,
        fetchImpl,
        webhookSecret: WEBHOOK_TOKEN,
      });
      await provider.createTransaction({
        disbursementDestination: toDisbursementDestination('FUND_TEST'),
        grossAmount: '10000',
        orderId: '800926000001',
        paymentType: 'qris',
      });
      await provider.reconcileTransaction('tx-1');

      expect(urls).toEqual([
        'https://api.mayar.id/hl/v2/payments/create',
        'https://api.mayar.id/hl/v2/transactions/tx-1',
      ]);
    }
  });
});

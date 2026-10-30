import { describe, expect, test } from 'bun:test';
import { MidtransPaymentProvider } from '../../src/payment/midtrans.provider';
import { MockPaymentProvider } from '../../src/payment/mock.provider';
import { createMidtransSignatureKey } from '../../src/payment/signature';
import { resolveSignedWebhook } from '../../src/payment/signed-webhook';

/**
 * Kontrak v2 untuk provider lokal, tanpa database dan tanpa jaringan.
 *
 * Pesan dan kode status di sini sengaja identik dengan yang ditegaskan
 * `apps/web/tests/orpc/webhook.test.ts`: berkas itu adalah kontrak lama yang
 * tidak boleh berubah ketika resolusi webhook dipindah ke provider.
 */

const SERVER_KEY = 'SB-Mid-server-unit-signed-webhook-123456';

function signedRequest(
  fields: {
    order_id?: string;
    transaction_status?: string;
    fraud_status?: string;
  },
  key = SERVER_KEY,
  via: 'body' | 'header' = 'body'
): { request: Request; rawBody: string } {
  const payload = {
    order_id: fields.order_id ?? '801026000001',
    status_code: '200',
    gross_amount: '50000.00' as const,
    payment_type: 'qris',
    transaction_status: fields.transaction_status ?? 'settlement',
    fraud_status: fields.fraud_status,
  };
  // Tanda tangan Midtrans hanya mencakup tiga medan ini; status transaksi dan
  // fraud tidak ikut ditandatangani. Mengoper tepat tiga medan membuat tes
  // ini sekaligus mendokumentasikan batas perlindungan tanda tangannya.
  const signature = createMidtransSignatureKey(
    {
      order_id: payload.order_id,
      status_code: payload.status_code,
      gross_amount: payload.gross_amount,
    },
    key
  );
  const body =
    via === 'body' ? { ...payload, signature_key: signature } : payload;
  const rawBody = JSON.stringify(body);

  return {
    rawBody,
    request: new Request('http://localhost/api/webhooks/payment', {
      method: 'POST',
      headers:
        via === 'header'
          ? { 'content-type': 'application/json', 'x-signature-key': signature }
          : { 'content-type': 'application/json' },
      body: rawBody,
    }),
  };
}

describe('@amwal/core/payment/mock.provider — kontrak v2', () => {
  const provider = new MockPaymentProvider(SERVER_KEY);

  test('mengidentifikasi diri sebagai MOCK', () => {
    expect(provider.name).toBe('MOCK');
  });

  test('settlement bertanda tangan sah menjadi event LUNAS berisi order ID', async () => {
    const { request, rawBody } = signedRequest({});

    expect(await provider.resolveWebhook(request, rawBody)).toEqual({
      type: 'event',
      event: { orderId: '801026000001', outcome: 'LUNAS' },
    });
  });

  test('tanda tangan lewat header juga diterima', async () => {
    const { request, rawBody } = signedRequest({}, SERVER_KEY, 'header');
    const result = await provider.resolveWebhook(request, rawBody);

    expect(result.type).toBe('event');
  });

  test('tanda tangan palsu ditolak 403 dengan pesan kontrak lama', async () => {
    const { request, rawBody } = signedRequest({}, 'kunci-yang-salah');

    expect(await provider.resolveWebhook(request, rawBody)).toEqual({
      type: 'rejected',
      status: 403,
      message: 'Invalid webhook signature',
    });
  });

  test('deny menjadi GAGAL, pending dan challenge tetap PENDING', async () => {
    const deny = signedRequest({ transaction_status: 'deny' });
    const pending = signedRequest({ transaction_status: 'pending' });
    const challenge = signedRequest({
      transaction_status: 'capture',
      fraud_status: 'challenge',
    });

    for (const [input, outcome] of [
      [deny, 'GAGAL'],
      [pending, 'PENDING'],
      [challenge, 'PENDING'],
    ] as const) {
      const result = await provider.resolveWebhook(
        input.request,
        input.rawBody
      );
      expect(result).toEqual({
        type: 'event',
        event: { orderId: '801026000001', outcome },
      });
    }
  });

  test('status yang tidak dikenal tidak pernah menjadi GAGAL', async () => {
    const { request, rawBody } = signedRequest({
      transaction_status: 'status-baru-dari-provider',
    });
    const result = await provider.resolveWebhook(request, rawBody);

    expect(result.type === 'event' && result.event.outcome).toBe('PENDING');
  });
});

describe('@amwal/core/payment/signed-webhook — masukan rusak', () => {
  const verifyNothing = () => true;

  test('JSON tidak valid ditolak 400', () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: '{bukan json',
    });

    expect(resolveSignedWebhook(request, '{bukan json', verifyNothing)).toEqual(
      { type: 'rejected', status: 400, message: 'Invalid JSON body' }
    );
  });

  test('JSON sah tetapi bukan objek ditolak 400, bukan melempar TypeError', () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: 'null',
    });

    expect(resolveSignedWebhook(request, 'null', verifyNothing)).toEqual({
      type: 'rejected',
      status: 400,
      message: 'Invalid JSON body',
    });
  });

  test('tanpa order_id ditolak sebelum verifikasi dianggap lolos', () => {
    const rawBody = JSON.stringify({ signature_key: 'apa-saja' });
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: rawBody,
    });

    expect(resolveSignedWebhook(request, rawBody, verifyNothing)).toEqual({
      type: 'rejected',
      status: 403,
      message: 'Invalid webhook signature',
    });
  });
});

describe('@amwal/core/payment/midtrans.provider — kontrak v2', () => {
  test('memakai jalur resolusi yang sama dengan Mock', async () => {
    const provider = new MidtransPaymentProvider(SERVER_KEY);
    const { request, rawBody } = signedRequest({});

    expect(provider.name).toBe('MIDTRANS');
    expect(await provider.resolveWebhook(request, rawBody)).toEqual({
      type: 'event',
      event: { orderId: '801026000001', outcome: 'LUNAS' },
    });
  });
});

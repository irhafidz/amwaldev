import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Putaran 17, Batch 6 — closes the WhatsApp settlement-notification gap
 * flagged at the end of Batch 5. Proves the full trigger chain works end
 * to end: `handlePaymentWebhook`'s `onSettled` hook (wired in
 * `apps/web/src/routes/api/webhooks/payment.ts`) calls
 * `@amwal/core/whatsapp/notify`'s `notifySettlement`, which POSTs the
 * correct phone + templated message to the Baileys microservice exactly
 * once per real settlement — never on a replayed/idempotent webhook, and
 * never in a way that can affect the webhook's own HTTP response even if
 * the notification fails.
 *
 * Runs a real ephemeral HTTP server (`Bun.serve`) standing in for wa-bot,
 * rather than mocking `fetch` — this is the same "prove it over the wire"
 * discipline used for the SHA-512/idempotency cURL proofs in earlier
 * batches, just in-process instead of against a long-running dev server.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createPayment } = await import('@amwal/core/payment/service');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { notifySettlement } = await import('@amwal/core/whatsapp/notify');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { toDisbursementDestination } = await import('@amwal/core/payment/types');
const { createMidtransSignatureKey } = await import(
  '@amwal/core/payment/signature'
);

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-P17-B6-whatsapp-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);
const internalSecret = 'p17-b6-test-internal-secret';
const now = () => new Date().toISOString();

interface CapturedRequest {
  phone: string;
  message: string;
  internalSecretHeader: string | null;
}

function startFakeWaBot(): {
  url: string;
  requests: CapturedRequest[];
  stop: () => void;
} {
  const requests: CapturedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (
        request.method === 'POST' &&
        new URL(request.url).pathname === '/send-message'
      ) {
        const body = (await request.json()) as {
          phone: string;
          message: string;
        };
        requests.push({
          phone: body.phone,
          message: body.message,
          internalSecretHeader: request.headers.get('x-internal-secret'),
        });
        return Response.json({ ok: true });
      }
      return new Response('Not Found', { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => server.stop(true),
  };
}

function webhookRequest(
  orderId: string,
  amount: `${number}`,
  transactionStatus: string
): Request {
  const payload = {
    order_id: orderId,
    status_code: '200',
    gross_amount: amount,
    transaction_status: transactionStatus,
    payment_type: 'qris',
    fraud_status: 'accept',
  };
  const signature = createMidtransSignatureKey(payload, serverKey);

  return new Request('http://localhost/api/webhooks/payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, signature_key: signature }),
  });
}

describe('WhatsApp settlement notification (@amwal/core/whatsapp)', () => {
  test('notifySettlement POSTs the waqf thank-you template with the donor phone', async () => {
    const waBot = startFakeWaBot();
    const runId = ulid().toLowerCase();
    const nadzirUserId = `p17b6-${runId}-nadzir-user`;
    const nadzirProfileId = `p17b6-${runId}-nadzir-profile`;
    const programId = `p17b6-${runId}-program`;
    const wakifUserId = `p17b6-${runId}-wakif`;

    await database.insert(schema.users).values([
      { id: nadzirUserId, name: 'Nadzir P17-B6', updatedAt: now() },
      { id: wakifUserId, name: 'Wakif P17-B6', updatedAt: now() },
    ]);
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      updatedAt: now(),
    });
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: 'Program WhatsApp Test',
      targetDana: '10000000',
      jenisWakaf: 'HABIS_PAKAI',
      status: 'LIVE',
      updatedAt: now(),
    });

    const payment = await createPayment(
      {
        module: 'WAQF',
        userId: wakifUserId,
        grossAmount: '50000.00',
        paymentType: 'qris',
        disbursementDestination: toDisbursementDestination(
          'Badan Pengelola Wakaf'
        ),
        order: {
          nomorKwitansi: `KW-P17B6-${runId}`,
          waqfProgramId: programId,
          namaWakif: 'Donatur WA Test',
          noTelepon: '081311112222',
          isAnonymous: false,
          bentukWakaf: 'UANG',
          nominal: '50000.00',
          metodePembayaran: 'QRIS',
        },
      },
      { database, paymentProvider: mockProvider }
    );

    try {
      await notifySettlement(database, 'WAQF', payment.orderId, '50000.00', {
        baileysServiceUrl: waBot.url,
        internalSecret,
      });

      expect(waBot.requests).toHaveLength(1);
      expect(waBot.requests[0]?.phone).toBe('081311112222');
      expect(waBot.requests[0]?.message).toContain('Donatur WA Test');
      expect(waBot.requests[0]?.message).toContain('Program WhatsApp Test');
      expect(waBot.requests[0]?.message).toContain('50.000');
      expect(waBot.requests[0]?.internalSecretHeader).toBe(internalSecret);
    } finally {
      waBot.stop();
      await database
        .delete(schema.waqfOrders)
        .where(eq(schema.waqfOrders.id, payment.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      await database
        .delete(schema.waqfPrincipalLedgers)
        .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, wakifUserId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, nadzirUserId));
    }
  });

  test('an anonymous donor is greeted as Hamba Allah, never by name', async () => {
    const waBot = startFakeWaBot();
    const runId = ulid().toLowerCase();
    const userId = `p17b6-${runId}-muzakki`;
    await database.insert(schema.users).values({
      id: userId,
      name: 'Muzakki Rahasia',
      updatedAt: now(),
    });

    const payment = await createPayment(
      {
        module: 'ZAKAT',
        userId,
        grossAmount: '75000.00',
        paymentType: 'qris',
        disbursementDestination: toDisbursementDestination(`ZAKAT_${runId}`),
        order: {
          nomorKwitansi: `KW-P17B6-${runId}`,
          namaMuzakki: 'Muzakki Rahasia',
          noTelepon: '081322223333',
          isAnonymous: true,
          jenisZakat: 'MAAL_PENGHASILAN',
          metodePembayaran: 'TRANSFER',
          nominal: '75000.00',
        },
      },
      { database, paymentProvider: mockProvider }
    );

    try {
      await notifySettlement(database, 'ZAKAT', payment.orderId, '75000.00', {
        baileysServiceUrl: waBot.url,
        internalSecret,
      });

      expect(waBot.requests).toHaveLength(1);
      expect(waBot.requests[0]?.message).toContain('Hamba Allah');
      expect(waBot.requests[0]?.message).not.toContain('Muzakki Rahasia');
    } finally {
      waBot.stop();
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, payment.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('a donor with no phone on file is silently skipped (no request, no throw)', async () => {
    const waBot = startFakeWaBot();
    const runId = ulid().toLowerCase();
    const userId = `p17b6-${runId}-nophone`;
    await database.insert(schema.users).values({
      id: userId,
      name: 'No Phone Donor',
      updatedAt: now(),
    });

    const payment = await createPayment(
      {
        module: 'INFAQ',
        userId,
        grossAmount: '25000.00',
        paymentType: 'qris',
        disbursementDestination: toDisbursementDestination('INFAQ_INFAQ_UMUM'),
        order: {
          namaPenginfaq: 'No Phone Donor',
          teleponPenginfaq: null,
          emailPenginfaq: null,
          nominal: '25000.00',
          jenis: 'INFAQ_UMUM',
          doa: null,
        },
      },
      { database, paymentProvider: mockProvider }
    );

    try {
      await expect(
        notifySettlement(database, 'INFAQ', payment.orderId, '25000.00', {
          baileysServiceUrl: waBot.url,
          internalSecret,
        })
      ).resolves.toBeUndefined();

      expect(waBot.requests).toHaveLength(0);
    } finally {
      waBot.stop();
      await database
        .delete(schema.infaqOrders)
        .where(eq(schema.infaqOrders.orderId, payment.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('an unreachable Baileys service never throws (best-effort)', async () => {
    const runId = ulid().toLowerCase();
    const userId = `p17b6-${runId}-unreachable`;
    await database.insert(schema.users).values({
      id: userId,
      name: 'Unreachable Test',
      updatedAt: now(),
    });

    const payment = await createPayment(
      {
        module: 'INFAQ',
        userId,
        grossAmount: '15000.00',
        paymentType: 'qris',
        disbursementDestination: toDisbursementDestination('INFAQ_INFAQ_UMUM'),
        order: {
          namaPenginfaq: 'Unreachable Test',
          teleponPenginfaq: '081399998888',
          emailPenginfaq: null,
          nominal: '15000.00',
          jenis: 'INFAQ_UMUM',
          doa: null,
        },
      },
      { database, paymentProvider: mockProvider }
    );

    try {
      await expect(
        notifySettlement(database, 'INFAQ', payment.orderId, '15000.00', {
          // Nothing is listening on this port — connection refused.
          baileysServiceUrl: 'http://127.0.0.1:1',
          internalSecret,
        })
      ).resolves.toBeUndefined();
    } finally {
      await database
        .delete(schema.infaqOrders)
        .where(eq(schema.infaqOrders.orderId, payment.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });
});

describe('WhatsApp notification wired through the payment webhook', () => {
  test('settlement triggers exactly one notification; an idempotent replay triggers none', async () => {
    const waBot = startFakeWaBot();
    const runId = ulid().toLowerCase();
    const userId = `p17b6-${runId}-webhook-muzakki`;
    await database.insert(schema.users).values({
      id: userId,
      name: 'Webhook WA Donor',
      updatedAt: now(),
    });

    const payment = await createPayment(
      {
        module: 'ZAKAT',
        userId,
        grossAmount: '60000.00',
        paymentType: 'qris',
        disbursementDestination: toDisbursementDestination(`ZAKAT_${runId}`),
        order: {
          nomorKwitansi: `KW-P17B6-${runId}`,
          namaMuzakki: 'Webhook WA Donor',
          noTelepon: '081344445555',
          isAnonymous: false,
          jenisZakat: 'MAAL_PENGHASILAN',
          metodePembayaran: 'TRANSFER',
          nominal: '60000.00',
        },
      },
      { database, paymentProvider: mockProvider }
    );

    try {
      // Mirrors apps/web/src/routes/api/webhooks/payment.ts's `handle()` —
      // same handlePaymentWebhook call, same onSettled wiring, just with a
      // fake wa-bot in place of the real Baileys service.
      const onSettled = (
        module: 'WAQF' | 'ZAKAT' | 'QURBAN' | 'INFAQ',
        orderId: string,
        amount: string
      ) =>
        notifySettlement(database, module, orderId, amount, {
          baileysServiceUrl: waBot.url,
          internalSecret,
        });

      const first = await handlePaymentWebhook(
        webhookRequest(payment.orderId, '60000.00', 'settlement'),
        { database, paymentProvider: mockProvider, onSettled }
      );
      expect(first.status).toBe(200);

      const replay = await handlePaymentWebhook(
        webhookRequest(payment.orderId, '60000.00', 'settlement'),
        { database, paymentProvider: mockProvider, onSettled }
      );
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({
        ok: true,
        message: 'Already processed',
      });

      // Idempotency extends to the notification: exactly one, from the
      // first settlement, never a second from the replay.
      expect(waBot.requests).toHaveLength(1);
      expect(waBot.requests[0]?.phone).toBe('081344445555');
    } finally {
      waBot.stop();
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, payment.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });
});

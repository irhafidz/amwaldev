import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import type { Database } from '../../src/lib/db';
import { router } from '../../src/lib/orpc/router';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

const connectionUrl = assertTestDatabase();
const { createDatabase } = await import('../../src/lib/db');
const database: Database = createDatabase(connectionUrl);

describe('WhatsApp Gateway Pairing & Status (Sprint 11.1)', () => {
  test('admin.wa.getStatus returns SCAN_QR and data URL when wa-bot is waiting for scan', async () => {
    const fakeQr =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const fakeServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (
          req.method === 'GET' &&
          (url.pathname === '/api/wa/status' || url.pathname === '/status')
        ) {
          expect(req.headers.get('x-internal-secret')).toBeTruthy();
          return Response.json({
            status: 'SCAN_QR',
            qrCodeDataUrl: fakeQr,
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeServer.port}`;

    try {
      const adminCtx = await createTestCaller({
        database,
        user: { userId: 'admin-user-wa-1', role: 'ADMIN' },
      });

      const result = await call(router.admin.wa.getStatus, undefined, {
        context: adminCtx,
      });

      expect(result.data.status).toBe('SCAN_QR');
      expect(result.data.qrCodeDataUrl).toBe(fakeQr);
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
      fakeServer.stop(true);
    }
  });

  test('admin.settings.baileysQr returns status and qrCodeBase64 relay', async () => {
    const fakeQr = 'data:image/png;base64,testQrData';
    const fakeServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (req.method === 'GET' && url.pathname === '/api/wa/status') {
          return Response.json({
            status: 'SCAN_QR',
            qrCodeDataUrl: fakeQr,
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeServer.port}`;

    try {
      const adminCtx = await createTestCaller({
        database,
        user: { userId: 'admin-user-wa-2', role: 'ADMIN' },
      });

      const result = await call(router.admin.settings.baileysQr, undefined, {
        context: adminCtx,
      });

      expect(result.data.status).toBe('SCAN_QR');
      expect(result.data.qrCodeBase64).toBe(fakeQr);
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
      fakeServer.stop(true);
    }
  });

  test('admin.wa.getStatus degrades to SERVICE_OFFLINE unreachable when service port is closed (no 500)', async () => {
    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    // Port 59999 is closed locally
    process.env.BAILEYS_SERVICE_URL = 'http://127.0.0.1:59999';

    try {
      const adminCtx = await createTestCaller({
        database,
        user: { userId: 'admin-user-wa-3', role: 'ADMIN' },
      });

      const result = await call(router.admin.wa.getStatus, undefined, {
        context: adminCtx,
      });

      expect(result.data.status).toBe('SERVICE_OFFLINE');
      expect(result.data.reason).toBe('unreachable');
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
    }
  });

  test('admin.wa.disconnect sends POST /api/wa/logout and returns updated status', async () => {
    let logoutCalled = false;
    const fakeServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (req.method === 'POST' && url.pathname === '/api/wa/logout') {
          logoutCalled = true;
          return Response.json({ status: 'DISCONNECTED' });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeServer.port}`;

    try {
      const adminCtx = await createTestCaller({
        database,
        user: { userId: 'admin-user-wa-4', role: 'ADMIN' },
      });

      const result = await call(router.admin.wa.disconnect, undefined, {
        context: adminCtx,
      });

      expect(logoutCalled).toBe(true);
      expect(result.data.status).toBe('DISCONNECTED');
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
      fakeServer.stop(true);
    }
  });

  test('sendDonationSuccessNotification sends friendly WhatsApp receipt to /api/wa/send', async () => {
    const { ulid } = await import('ulidx');
    const { eq } = await import('drizzle-orm');
    const schema = await import('../../src/lib/db/schema');
    const { sendDonationSuccessNotification } = await import(
      '../../src/lib/whatsapp'
    );

    const receivedPayloads: Array<{
      headers: Record<string, string>;
      message: string;
      to: string;
    }> = [];

    const fakeServer = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (req.method === 'POST' && url.pathname === '/api/wa/send') {
          const body = (await req.json()) as { message: string; to: string };
          receivedPayloads.push({
            headers: {
              'x-internal-secret': req.headers.get('x-internal-secret') ?? '',
            },
            message: body.message,
            to: body.to,
          });
          return Response.json({ ok: true, success: true });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeServer.port}`;

    const runId = ulid().toLowerCase();
    const userId = `wa-test-user-${runId}`;
    const orderId = `6009260000${Math.floor(10 + Math.random() * 89)}`;
    const now = new Date().toISOString();

    try {
      await database.insert(schema.users).values({
        id: userId,
        name: 'Donatur Khairul',
        updatedAt: now,
      });
      await database.insert(schema.zakatOrders).values({
        id: orderId,
        jenisZakat: 'FITRAH',
        metodePembayaran: 'TRANSFER',
        namaMuzakki: 'Donatur Khairul',
        noTelepon: '081234567890',
        nominal: '100000.00',
        nomorKwitansi: `KW-WA-${runId}`,
        muzakkiId: userId,
        status: 'TERVERIFIKASI',
      });

      await sendDonationSuccessNotification(
        database,
        'ZAKAT',
        orderId,
        '100000.00'
      );

      expect(receivedPayloads).toHaveLength(1);
      const payload = receivedPayloads[0];
      expect(payload?.to).toBe('081234567890');
      expect(payload?.message).toContain('Donatur Khairul');
      expect(payload?.message).toContain('100.000');
      expect(payload?.message).toContain('FITRAH');
      expect(payload?.message).toContain(orderId);
      expect(payload?.message).toContain('sertifikat');
      expect(payload?.headers['x-internal-secret']).toBeTruthy();
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
      fakeServer.stop(true);
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, orderId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('Mayar payment simulator triggers automatic WhatsApp settlement notification', async () => {
    const { ulid } = await import('ulidx');
    const { eq } = await import('drizzle-orm');
    const schema = await import('../../src/lib/db/schema');
    const { createPayment } = await import('@amwal/core/payment/service');
    const { toDisbursementDestination } = await import(
      '@amwal/core/payment/types'
    );
    const { handle: handleSimulatorWebhook } = await import(
      '../../src/routes/api/dev/mock-webhook'
    );

    const receivedPayloads: Array<{ message: string; to: string }> = [];

    const fakeServer = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (req.method === 'POST' && url.pathname === '/api/wa/send') {
          const body = (await req.json()) as { message: string; to: string };
          receivedPayloads.push(body);
          return Response.json({ ok: true });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const originalUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = `http://127.0.0.1:${fakeServer.port}`;

    const runId = ulid().toLowerCase();
    const userId = `p11-sim-wa-${runId}`;
    const destination = `FUND_SIM_WA_${runId}`;
    const providerRef = `mayar-sim-wa-${runId}`;
    let orderId = '';
    const now = new Date().toISOString();

    try {
      await database.insert(schema.users).values({
        id: userId,
        name: 'Donatur Simulasi WA',
        updatedAt: now,
      });

      const payment = await createPayment(
        {
          disbursementDestination: toDisbursementDestination(destination),
          grossAmount: '75000.00',
          module: 'INFAQ',
          order: {
            jenis: 'INFAQ_UMUM',
            namaPenginfaq: 'Donatur Simulasi WA',
            teleponPenginfaq: '081299887766',
            nominal: '75000.00',
          },
          paymentType: 'qris',
          userId,
        },
        {
          database,
          paymentProvider: {
            createTransaction: () =>
              Promise.resolve({
                paymentType: 'qris',
                providerRef,
                redirectUrl: `https://amwal-its.myr.lat/invoices/${providerRef}`,
              }),
            verifyWebhookSignature: () => true,
          },
        }
      );
      orderId = payment.orderId;

      const simResponse = await handleSimulatorWebhook({
        request: new Request('http://localhost/api/dev/mock-webhook', {
          body: JSON.stringify({ mode: 'mayar', orderId: payment.orderId }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      });
      expect(simResponse.status).toBe(200);

      expect(receivedPayloads).toHaveLength(1);
      const waMessage = receivedPayloads[0];
      expect(waMessage?.to).toBe('081299887766');
      expect(waMessage?.message).toContain('Donatur Simulasi WA');
      expect(waMessage?.message).toContain('75.000');
      expect(waMessage?.message).toContain('INFAQ_UMUM');
      expect(waMessage?.message).toContain(orderId);
      expect(waMessage?.message).toContain('kuitansi');
    } finally {
      process.env.BAILEYS_SERVICE_URL = originalUrl;
      fakeServer.stop(true);
      await database
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userId));
      await database
        .delete(schema.infaqOrders)
        .where(eq(schema.infaqOrders.orderId, orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.wakifId, userId));
      await database
        .delete(schema.fundPools)
        .where(eq(schema.fundPools.kode, destination));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });
});

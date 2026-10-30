import { createSettlementNotification } from '@amwal/core/notification';
import { MayarPaymentProvider } from '@amwal/core/payment/mayar.provider';
import { moduleFromOrderId } from '@amwal/core/payment/order-id';
import { createMidtransSignatureKey } from '@amwal/core/payment/signature';
import { handlePaymentWebhook } from '@amwal/core/payment/webhook';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '@/env/server';
import { db } from '@/lib/db';
import {
  infaqOrders,
  qurbanOrders,
  transactions,
  waqfOrders,
  zakatOrders,
} from '@/lib/db/schema';
import { notifySettlement } from '@/lib/whatsapp';
import { handle as handlePaymentWebhookRoute } from '@/routes/api/webhooks/payment';

/**
 * Dev-only payment simulator bridge.
 *
 * Dua mode:
 * - Midtrans/MOCK lama: menandatangani payload dan meneruskannya ke webhook
 *   produksi, sehingga jalur signature + idempotensi + onSettled tetap sama.
 * - Simulator Mayar sandbox: memakai `MayarPaymentProvider` dengan fetch palsu
 *   yang mengembalikan detail `paid`, lalu tetap masuk lewat
 *   `handlePaymentWebhook` dan `applyProviderEvent`. Tidak ada request jaringan
 *   ke Mayar dan tidak ada secret yang pernah dikirim ke browser.
 *
 * GET dipakai simulator untuk membaca detail order sebelum/sesudah aksi.
 */

const DEV_WEBHOOK_TOKEN = 'dev-mayar-webhook-token';
const DEV_API_KEY = 'dev-mayar-api-key';

const devRouteEnabled = env.NODE_ENV !== 'production';
const midtransMockEnabled =
  devRouteEnabled && env.PAYMENT_PROVIDER === 'MOCK_SANDBOX';

const midtransWebhookSchema = z.object({
  fraud_status: z.string().optional(),
  gross_amount: z.string().min(1),
  order_id: z.string().min(1),
  payment_type: z.string().optional(),
  status_code: z.string().min(1),
  transaction_status: z.string().min(1),
});

const mayarSimulationSchema = z.object({
  mode: z.literal('mayar'),
  orderId: z.string().min(1),
});

type SimulatorModule = 'Wakaf' | 'Zakat' | 'Infaq' | 'Sedekah' | 'Qurban';

interface SimulatorOrder {
  amount: string | null;
  module: SimulatorModule;
  orderId: string;
  orderStatus: string;
  paymentMethod: string | null;
  provider: string;
  providerRef: string | null;
  redirectUrl: string | null;
  status: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function moduleLabel(
  module: string,
  jenisInfaq?: string | null
): SimulatorModule {
  if (module === 'INFAQ') {
    return jenisInfaq?.startsWith('SEDEKAH_') ? 'Sedekah' : 'Infaq';
  }
  if (module === 'WAQF') {
    return 'Wakaf';
  }
  if (module === 'ZAKAT') {
    return 'Zakat';
  }
  return 'Qurban';
}

async function buildSimulatorOrder(
  orderId: string,
  module: SimulatorModule,
  orderStatus: string,
  transactionId: string | null,
  redirectUrl: string | null
): Promise<SimulatorOrder> {
  if (!transactionId) {
    return {
      amount: null,
      module,
      orderId,
      orderStatus,
      paymentMethod: null,
      provider: env.PAYMENT_PROVIDER,
      providerRef: null,
      redirectUrl,
      status: orderStatus,
    };
  }

  const [transaction] = await db
    .select({
      amount: transactions.amount,
      paymentGatewayRef: transactions.paymentGatewayRef,
      paymentMethod: transactions.paymentMethod,
      statusPembayaran: transactions.statusPembayaran,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  if (!transaction) {
    return {
      amount: null,
      module,
      orderId,
      orderStatus,
      paymentMethod: null,
      provider: env.PAYMENT_PROVIDER,
      providerRef: null,
      redirectUrl,
      status: orderStatus,
    };
  }

  return {
    amount: transaction.amount,
    module,
    orderId,
    orderStatus,
    paymentMethod: transaction.paymentMethod,
    provider: env.PAYMENT_PROVIDER,
    providerRef: transaction.paymentGatewayRef,
    redirectUrl,
    status: transaction.statusPembayaran,
  };
}

async function resolveSimulatorOrder(
  orderId: string
): Promise<SimulatorOrder | null> {
  const detectedModule = moduleFromOrderId(orderId);
  if (!detectedModule) {
    return null;
  }

  if (detectedModule === 'WAQF') {
    const [order] = await db
      .select({
        status: waqfOrders.status,
        transactionId: waqfOrders.transactionId,
      })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId));

    return order
      ? buildSimulatorOrder(
          orderId,
          'Wakaf',
          order.status,
          order.transactionId,
          null
        )
      : null;
  }

  if (detectedModule === 'ZAKAT') {
    const [order] = await db
      .select({
        status: zakatOrders.status,
        transactionId: zakatOrders.transactionId,
      })
      .from(zakatOrders)
      .where(eq(zakatOrders.id, orderId));

    return order
      ? buildSimulatorOrder(
          orderId,
          'Zakat',
          order.status,
          order.transactionId,
          null
        )
      : null;
  }

  if (detectedModule === 'INFAQ') {
    const [order] = await db
      .select({
        jenis: infaqOrders.jenis,
        orderId: infaqOrders.orderId,
        redirectUrl: infaqOrders.snapRedirectUrl,
        status: infaqOrders.status,
        transactionId: infaqOrders.transactionId,
      })
      .from(infaqOrders)
      .where(eq(infaqOrders.orderId, orderId));

    return order
      ? buildSimulatorOrder(
          order.orderId,
          moduleLabel('INFAQ', order.jenis),
          order.status,
          order.transactionId,
          order.redirectUrl
        )
      : null;
  }

  const [order] = await db
    .select({
      status: qurbanOrders.statusPembayaran,
      transactionId: qurbanOrders.transactionId,
    })
    .from(qurbanOrders)
    .where(eq(qurbanOrders.id, orderId));

  return order
    ? buildSimulatorOrder(
        orderId,
        'Qurban',
        order.status,
        order.transactionId,
        null
      )
    : null;
}

async function handleLookup(request: Request): Promise<Response> {
  if (!devRouteEnabled) {
    return jsonResponse({ error: 'Simulator is disabled' }, 403);
  }

  const orderId = new URL(request.url).searchParams.get('orderId')?.trim();
  if (!orderId) {
    return jsonResponse({ error: 'orderId is required' }, 400);
  }

  const order = await resolveSimulatorOrder(orderId);
  return order
    ? jsonResponse({ data: order })
    : jsonResponse({ error: 'Order tidak ditemukan' }, 404);
}

async function handleMayarSimulation(
  request: Request,
  orderId: string
): Promise<Response> {
  const order = await resolveSimulatorOrder(orderId);
  if (!order) {
    return jsonResponse({ error: 'Order tidak ditemukan' }, 404);
  }
  if (!(order.amount && order.providerRef)) {
    return jsonResponse(
      {
        error:
          'Order belum punya anchor transaksi digital dengan paymentGatewayRef',
      },
      409
    );
  }

  const providerRef = order.providerRef;
  const amount = Number(order.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: 'Nominal order tidak valid' }, 400);
  }

  const webhookToken = env.MAYAR_WEBHOOK_TOKEN ?? DEV_WEBHOOK_TOKEN;
  const provider = new MayarPaymentProvider({
    apiKey: env.MAYAR_API_KEY ?? DEV_API_KEY,
    fetchImpl: (input) => {
      if (String(input).includes(`/transactions/${providerRef}`)) {
        return Promise.resolve(
          jsonResponse({
            data: { amount, id: providerRef, status: 'paid' },
            messages: 'success',
            statusCode: 200,
          })
        );
      }

      return Promise.resolve(
        jsonResponse({ messages: 'Not Found', statusCode: 404 }, 404)
      );
    },
    retryDelaysMs: [],
    webhookSecret: webhookToken,
  });
  const webhookRequest = new Request(
    new URL('/api/webhooks/payment', request.url),
    {
      body: JSON.stringify({
        data: {
          id: providerRef,
          status: 'SUCCESS',
          transactionId: providerRef,
        },
        event: 'payment.received',
      }),
      headers: {
        'content-type': 'application/json',
        'x-callback-token': webhookToken,
      },
      method: 'POST',
    }
  );

  return await handlePaymentWebhook(webhookRequest, {
    database: db,
    paymentProvider: provider,
    onSettled: async (module, orderId, amount) => {
      try {
        await notifySettlement(db, module, orderId, amount);
      } catch {
        // Best-effort WhatsApp notification
      }
      try {
        await createSettlementNotification(db, module, orderId);
      } catch {
        // Best-effort in-app settlement notification
      }
    },
  });
}

async function handleMidtransSimulation(
  request: Request,
  body: Record<string, unknown>
): Promise<Response> {
  if (!midtransMockEnabled) {
    return jsonResponse({ error: 'Mock webhook is disabled' }, 403);
  }

  const parsed = midtransWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validasi gagal', details: z.flattenError(parsed.error) },
      400
    );
  }

  const signature = createMidtransSignatureKey(
    {
      ...parsed.data,
      gross_amount: parsed.data.gross_amount as `${number}`,
    },
    env.PAYMENT_SERVER_KEY ?? 'mock-server-key-not-a-real-secret'
  );
  const signedRequest = new Request(
    new URL('/api/webhooks/payment', request.url),
    {
      body: JSON.stringify({ ...parsed.data, signature_key: signature }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }
  );

  return await handlePaymentWebhookRoute({ request: signedRequest });
}

export async function handle({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!devRouteEnabled) {
    return jsonResponse({ error: 'Simulator is disabled' }, 403);
  }

  if (request.method === 'GET') {
    return await handleLookup(request);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Body bukan JSON yang valid' }, 400);
  }

  const mayar = mayarSimulationSchema.safeParse(body);
  if (mayar.success) {
    return await handleMayarSimulation(request, mayar.data.orderId);
  }

  if (body === null || typeof body !== 'object') {
    return jsonResponse({ error: 'Payload tidak valid' }, 400);
  }

  return await handleMidtransSimulation(
    request,
    body as Record<string, unknown>
  );
}

export const ServerRoute = createServerFileRoute(
  '/api/dev/mock-webhook'
).methods({
  GET: handle,
  POST: handle,
});

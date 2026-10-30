import { env } from '@/env/server';
import { safePublicOrigin } from '@/lib/public-url';
import { callWaBot } from '@/lib/whatsapp/bot-client';
import { adminProcedure } from '../../procedures';

/**
 * oRPC admin.settings router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/settings.ts`: a server-side proxy to the
 * standalone `wa-bot` (Baileys) microservice.
 *
 * The browser NEVER talks to wa-bot directly (AMW-02): wa-bot has no
 * published port and its endpoints are guarded by `X-Internal-Secret`. This
 * admin-only proxy forwards the secret from server memory and relays status
 * / QR back. A missing `BAILEYS_SERVICE_URL` or an unreachable service
 * degrades to a clear OFFLINE payload rather than a 500.
 */

const SANDBOX_PROVIDER = /SANDBOX|MOCK/;

async function proxyWaBot(path: string): Promise<unknown> {
  const result = await callWaBot(path);
  return result.ok ? result.body : { status: 'OFFLINE', reason: result.reason };
}

const baileysStatus = adminProcedure.handler(async () => {
  return { data: await proxyWaBot('/api/wa/status') };
});

const baileysQr = adminProcedure.handler(async () => {
  const body = (await proxyWaBot('/api/wa/status')) as {
    phone?: string;
    qrCodeDataUrl?: string;
    reason?: string;
    status?: string;
  };

  return {
    data: {
      qrCodeBase64: body.qrCodeDataUrl ?? null,
      status: body.status ?? 'SERVICE_OFFLINE',
      phone: body.phone,
      reason: body.reason,
    },
  };
});

/**
 * Non-secret view of how this deployment is configured. Settings are managed
 * through environment variables and server deploys (there is no settings
 * table), so the admin page reads them here instead of offering fake inputs.
 */
const runtime = adminProcedure.handler(({ context }) => ({
  data: {
    paymentProvider: env.PAYMENT_PROVIDER,
    isSandbox: SANDBOX_PROVIDER.test(env.PAYMENT_PROVIDER),
    publicAppUrl: safePublicOrigin(context.request),
    nodeEnv: env.NODE_ENV,
    cronConfigured: Boolean(env.CRON_SECRET),
  },
}));

export const settings = {
  baileysStatus,
  baileysQr,
  runtime,
};

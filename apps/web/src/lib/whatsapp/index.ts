import type { PaymentModule } from '@amwal/core/payment/order-id';
import { notifySettlement as coreNotifySettlement } from '@amwal/core/whatsapp/notify';
import {
  sendWhatsAppNotification as coreSendWhatsAppNotification,
  type SendWhatsAppDeps,
} from '@amwal/core/whatsapp/service';
import { env } from '@/env/server';
import type { Database } from '@/lib/db';

/**
 * Composition shim (Putaran 17, Batch 6) — closes the WhatsApp settlement
 * notification gap flagged in Batch 5: the orchestration and message
 * templates now live in `@amwal/core/whatsapp/notify`, wired here to this
 * app's own `env.BAILEYS_SERVICE_URL`/`env.INTERNAL_SECRET` (a shared
 * package cannot assume any one app's environment — Batch 1's rule). Same
 * call signature `apps/server`'s original `notifySettlement` had, so the
 * webhook route's `onSettled` hook is a one-line wire-up.
 */
export function getWhatsAppServiceDeps(): SendWhatsAppDeps {
  return {
    baileysServiceUrl:
      process.env.BAILEYS_SERVICE_URL ||
      process.env.WA_BOT_URL ||
      env.BAILEYS_SERVICE_URL,
    // [Sprint 11.1] `env.INTERNAL_SECRET` sudah wajib diisi (lihat
    // `env/server.ts`) — tidak ada lagi fallback hardcoded di sini.
    internalSecret: env.INTERNAL_SECRET,
  };
}

export function notifySettlement(
  database: Database,
  module: PaymentModule,
  orderId: string,
  amount: string
): Promise<void> {
  return coreNotifySettlement(
    database,
    module,
    orderId,
    amount,
    getWhatsAppServiceDeps()
  );
}

/**
 * Semantic alias for sending successful donation WhatsApp notifications.
 */
export function sendDonationSuccessNotification(
  database: Database,
  module: PaymentModule,
  orderId: string,
  amount: string
): Promise<void> {
  return notifySettlement(database, module, orderId, amount);
}

/**
 * Sends a raw arbitrary text WhatsApp notification.
 */
export function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<boolean> {
  return coreSendWhatsAppNotification(to, message, getWhatsAppServiceDeps());
}

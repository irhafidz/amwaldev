import {
  MayarPaymentProvider,
  resolveMayarBaseUrl,
} from '@amwal/core/payment/mayar.provider';
import { MidtransPaymentProvider } from '@amwal/core/payment/midtrans.provider';
import { MockPaymentProvider } from '@amwal/core/payment/mock.provider';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { env } from '@/env/server';

/**
 * Payment-provider composition (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/lib/payment/index.ts`. The provider classes themselves
 * live in `@amwal/core/payment/{midtrans,mock,mayar}` (pure, no env
 * access); only the env-bound factory stays per-app.
 *
 * Seluruh nilai dibaca dari `env` yang sudah divalidasi Zod, bukan dari
 * `process.env` mentah — jembatan sementara Selasa sudah dicabut.
 */
function requireMayarSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is required when PAYMENT_PROVIDER is ${env.PAYMENT_PROVIDER}`
    );
  }
  return value;
}

function requirePaymentServerKey(): string {
  if (!env.PAYMENT_SERVER_KEY) {
    throw new Error(
      `PAYMENT_SERVER_KEY is required when PAYMENT_PROVIDER is ${env.PAYMENT_PROVIDER}`
    );
  }
  return env.PAYMENT_SERVER_KEY;
}

/**
 * Pembuatan pembayaran dan pembacaan transaksi memakai API v2 (v1 sudah
 * dideprecate Mayar). `resolveMayarBaseUrl` menerima akar polos maupun
 * akhiran `/hl/v1`/`/hl/v2` dan selalu menghasilkan satu `/hl/v2`. Nama lama
 * `MAYAR_API_BASE_URL` masih dibaca supaya `.env` yang sudah ada tidak patah.
 */
function mayarBaseUrl(): string {
  return resolveMayarBaseUrl(env.MAYAR_BASE_URL ?? env.MAYAR_API_BASE_URL);
}

export function getPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case 'MOCK_SANDBOX':
      return new MockPaymentProvider(requirePaymentServerKey());
    case 'MIDTRANS_SANDBOX':
    case 'MIDTRANS_PRODUCTION':
      return new MidtransPaymentProvider(requirePaymentServerKey());
    case 'MAYAR_SANDBOX':
    case 'MAYAR_PRODUCTION':
      return new MayarPaymentProvider({
        apiKey: requireMayarSecret('MAYAR_API_KEY', env.MAYAR_API_KEY),
        webhookSecret: requireMayarSecret(
          'MAYAR_WEBHOOK_SECRET',
          env.MAYAR_WEBHOOK_SECRET ?? env.MAYAR_WEBHOOK_TOKEN
        ),
        baseUrl: mayarBaseUrl(),
      });
    default:
      throw new Error(
        `Unsupported payment provider: ${String(env.PAYMENT_PROVIDER)}`
      );
  }
}

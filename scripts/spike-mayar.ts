import { formatOrderId } from '../packages/core/src/payment/order-id';

const MAYAR_API_BASE_URL =
  process.env.MAYAR_API_BASE_URL?.replace(/\/+$/, '') ??
  'https://api.mayar.io/hl/v1';
const MAYAR_CREATE_PAYMENT_URL = `${MAYAR_API_BASE_URL}/payment/create`;

function requireMayarApiKey(): string {
  const apiKey = process.env.MAYAR_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('MAYAR_API_KEY is required');
  }

  return apiKey;
}

function redactSecret(value: string, secret: string): string {
  return value.replaceAll(secret, '[REDACTED]');
}

async function main(): Promise<void> {
  const apiKey = requireMayarApiKey();
  const orderId = formatOrderId({
    module: 'INFAQ',
    at: new Date(),
    seq: 1,
  });
  const requestBody = {
    name: 'Bara Tester',
    email: 'bara@example.com',
    amount: 10_000,
    mobile: '081234567890',
    description: `Donasi Infaq Uji Coba ${orderId}`,
    redirectUrl: 'https://example.com/finish',
  };

  console.log('Mayar sandbox spike');
  console.log(`Endpoint: ${MAYAR_CREATE_PAYMENT_URL}`);
  console.log(`Order ID v2: ${orderId}`);
  console.log('Request body:');
  console.log(JSON.stringify(requestBody, null, 2));

  const response = await fetch(MAYAR_CREATE_PAYMENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const rawBody = await response.text();
  const safeBody = redactSecret(rawBody, apiKey);

  console.log(`HTTP status: ${response.status} ${response.statusText}`);
  console.log('Raw response body:');
  console.log(safeBody);

  if (!response.ok) {
    throw new Error(`Mayar create payment failed with HTTP ${response.status}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Mayar sandbox spike failed: ${message}`);
  process.exit(1);
});

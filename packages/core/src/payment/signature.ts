import { createHash, timingSafeEqual } from 'node:crypto';
import type { GrossAmount, WebhookPayload } from './types';

export type SignatureSource = Pick<
  WebhookPayload,
  'order_id' | 'status_code'
> & {
  gross_amount: GrossAmount;
};

export function createMidtransSignatureKey(
  source: SignatureSource,
  serverKey: string
): string {
  const rawSignature = `${source.order_id}${source.status_code}${source.gross_amount}${serverKey}`;
  return createHash('sha512').update(rawSignature, 'utf8').digest('hex');
}

export function verifySha512Signature(
  expectedSignature: string,
  actualSignature: string
): boolean {
  if (expectedSignature.length === 0 || actualSignature.length === 0) {
    return false;
  }

  const expected = Buffer.from(expectedSignature.toLowerCase());
  const actual = Buffer.from(actualSignature.toLowerCase());

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

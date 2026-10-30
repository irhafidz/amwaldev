import { paymentMethodLabel as methodLabel } from '@amwal/core/payment/methods';

export function paymentMethodLabel(method: string | null): string {
  if (!method) {
    return '—';
  }
  return methodLabel(method);
}

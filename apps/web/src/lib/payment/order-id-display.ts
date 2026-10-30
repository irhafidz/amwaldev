import { parseOrderId } from '@amwal/core/payment/order-id';

/**
 * Format tampilan ID v2 tanpa mengubah nilai yang dikirim ke API:
 * `600926000001` -> `60 09 26 00 0001`. ID legacy dibiarkan apa adanya.
 */
export function formatOrderIdDisplay(orderId: string): string {
  if (!parseOrderId(orderId)) {
    return orderId;
  }

  return [
    orderId.slice(0, 2),
    orderId.slice(2, 4),
    orderId.slice(4, 6),
    orderId.slice(6, 8),
    orderId.slice(8, 12),
  ].join(' ');
}

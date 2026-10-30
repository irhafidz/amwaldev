'use client';

import { Link } from '@tanstack/react-router';
import { ChevronRight, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatRupiah } from '@/lib/amwal-api/format';
import {
  type DeviceOrder,
  listDeviceOrders,
} from '@/lib/payment/device-orders';

/**
 * "Donasi dari perangkat ini" untuk tamu (QA-03, D2). Dibaca setelah mount
 * supaya markup server dan klien sama; kosong = tidak dirender sama sekali.
 */
export function DeviceOrdersList({ limit = 5 }: { limit?: number }) {
  const [orders, setOrders] = useState<DeviceOrder[]>([]);
  useEffect(() => setOrders(listDeviceOrders().slice(0, limit)), [limit]);

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 space-y-2" data-testid="device-orders">
      <p className="flex items-center gap-1.5 font-semibold text-gray-600 text-xs dark:text-slate-300">
        <Smartphone aria-hidden="true" className="size-3.5" />
        Donasi dari perangkat ini
      </p>
      {orders.map((order) => (
        <Link
          className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-sm transition hover:border-[#356152]/30 dark:border-slate-800 dark:bg-slate-900"
          key={order.orderId}
          params={{ orderId: order.orderId }}
          to="/transaksi/$orderId"
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold text-gray-900 dark:text-white">
              {order.label}
            </span>
            <span className="font-mono text-[11px] text-gray-400">
              {order.orderId}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 font-bold text-[#356152] dark:text-emerald-400">
            {formatRupiah(order.amount)}
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
        </Link>
      ))}
    </div>
  );
}

import { moduleFromOrderId } from '@amwal/core/payment/order-id';

/**
 * Daftar pesanan yang dibuat dari perangkat ini (QA-03, D2).
 *
 * Donasi tamu tanpa email/HP tercatat atas akun sistem anonim, jadi Riwayat
 * akun tidak bisa menampilkannya. Perangkat donatur menyimpan order ID-nya di
 * `localStorage` agar transaksi tetap bisa dibuka lagi lewat
 * `/transaksi/$orderId`. Hanya ID, label, dan nominal — tanpa data pribadi —
 * dan semua akses storage boleh gagal diam-diam (mode privat, diblokir).
 */

const STORAGE_KEY = 'amwal_device_orders';
export const MAX_DEVICE_ORDERS = 20;

export type DeviceOrderModule = 'WAQF' | 'INFAQ' | 'ZAKAT' | 'QURBAN';

export interface DeviceOrder {
  orderId: string;
  module: DeviceOrderModule;
  label: string;
  amount: number;
  createdAt: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isDeviceOrder(value: unknown): value is DeviceOrder {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.orderId === 'string' &&
    typeof entry.module === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.amount === 'number' &&
    typeof entry.createdAt === 'string'
  );
}

/** Pesanan di perangkat ini, terbaru dulu. Isi rusak diabaikan. */
export function listDeviceOrders(): DeviceOrder[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isDeviceOrder) : [];
  } catch {
    return [];
  }
}

export function rememberDeviceOrder(entry: {
  orderId: string;
  label: string;
  amount: number;
  module?: DeviceOrderModule;
}): void {
  const module = entry.module ?? moduleFromOrderId(entry.orderId);
  if (!module) {
    return;
  }
  const next: DeviceOrder = {
    orderId: entry.orderId,
    module,
    label: entry.label,
    amount: entry.amount,
    createdAt: new Date().toISOString(),
  };
  const rest = listDeviceOrders().filter(
    (item) => item.orderId !== entry.orderId
  );
  try {
    storage()?.setItem(
      STORAGE_KEY,
      JSON.stringify([next, ...rest].slice(0, MAX_DEVICE_ORDERS))
    );
  } catch {
    // Penyimpanan penuh/diblokir: tautan status tetap tampil di layar.
  }
}

/** Tautan status tunggal untuk semua modul (D2). */
export function orderStatusPath(orderId: string): string {
  return `/transaksi/${encodeURIComponent(orderId)}`;
}

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  listDeviceOrders,
  MAX_DEVICE_ORDERS,
  orderStatusPath,
  rememberDeviceOrder,
} from '../../src/lib/payment/device-orders';

/** localStorage tiruan di memori; dipasang/dilepas per tes. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  return store;
}

let store: Map<string, string>;
beforeEach(() => {
  store = installStorage();
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('device orders (QA-03, D2)', () => {
  test('menyimpan pesanan tamu, terbaru dulu, modul dibaca dari order ID', () => {
    rememberDeviceOrder({
      orderId: '601026000001',
      label: 'Wakaf Masjid',
      amount: 250_000,
    });
    rememberDeviceOrder({
      orderId: '801026000002',
      label: 'Infaq Umum',
      amount: 50_000,
    });

    const orders = listDeviceOrders();
    expect(orders.map((order) => order.orderId)).toEqual([
      '801026000002',
      '601026000001',
    ]);
    expect(orders[1]?.module).toBe('WAQF');
    expect(orders[1]?.amount).toBe(250_000);
  });

  test('pesanan yang sama tidak tercatat dua kali dan daftar dibatasi', () => {
    for (let i = 0; i < MAX_DEVICE_ORDERS + 5; i += 1) {
      rememberDeviceOrder({
        orderId: `6010260${String(i).padStart(5, '0')}`,
        label: 'Wakaf',
        amount: 1000,
      });
    }
    rememberDeviceOrder({
      orderId: '601026000003',
      label: 'Wakaf',
      amount: 1000,
    });
    const orders = listDeviceOrders();
    expect(orders).toHaveLength(MAX_DEVICE_ORDERS);
    expect(
      orders.filter((order) => order.orderId === '601026000003')
    ).toHaveLength(1);
    expect(orders[0]?.orderId).toBe('601026000003');
  });

  test('isi rusak, ID tak dikenal, dan storage yang diblokir tidak pernah melempar', () => {
    store.set('amwal_device_orders', '{bukan json');
    expect(listDeviceOrders()).toEqual([]);

    rememberDeviceOrder({ orderId: 'tidak-dikenal', label: 'x', amount: 1 });
    expect(listDeviceOrders()).toEqual([]);

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(() =>
      rememberDeviceOrder({
        orderId: '601026000009',
        label: 'Wakaf',
        amount: 1,
      })
    ).not.toThrow();
    expect(listDeviceOrders()).toEqual([]);
  });

  test('tautan status tunggal untuk semua modul', () => {
    expect(orderStatusPath('601026000001')).toBe('/transaksi/601026000001');
  });
});

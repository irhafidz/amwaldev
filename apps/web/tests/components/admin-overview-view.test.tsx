import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

/**
 * The admin overview reads live procedures; this proves it renders honest
 * empty/zero states (no crash, no "dummy data") and a real error state, with
 * the API layer mocked.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/admin',
});

const DOM_GLOBALS = {
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  MouseEvent: dom.window.MouseEvent,
  navigator: dom.window.navigator,
  Node: dom.window.Node,
  window: dom.window,
} as const;
const previousGlobals = new Map<string, unknown>();
for (const [name, value] of Object.entries(DOM_GLOBALS)) {
  previousGlobals.set(name, (globalThis as Record<string, unknown>)[name]);
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const actualAdminApi = { ...(await import('@/lib/amwal-api/admin')) };
const actualRouter = { ...(await import('@tanstack/react-router')) };

const zeroMonths = Array.from({ length: 12 }, (_, index) => ({
  label: `2026-${String(index + 1).padStart(2, '0')}`,
  amount: 0,
  cumulativeAmount: 0,
}));
const zeroSegments = {
  items: [],
  total: 0,
  page: 1,
  limit: 1,
  totalDonors: 0,
  segmentCounts: {
    Champion: 0,
    Loyal: 0,
    New: 0,
    'At-Risk': 0,
    Lapsed: 0,
    Situational: 0,
  },
};
const emptyLedger = {
  summary: { totalCount: 0, totalVolume: 0, uniqueDonors: 0 },
  allocations: [],
  items: [],
  total: 0,
  page: 1,
  limit: 8,
};

const api = {
  kpi: mock(() =>
    Promise.resolve({
      totalFundsCollected: '0',
      paidTransactions: 0,
      totalTransactions: 0,
      activePrograms: 0,
    })
  ),
  segments: mock(() => Promise.resolve(zeroSegments)),
  accumulation: mock(() => Promise.resolve(zeroMonths)),
  composition: mock(() =>
    Promise.resolve(
      ['Wakaf', 'Zakat', 'Infaq', 'Sedekah', 'Qurban'].map((module) => ({
        module,
        amount: 0,
      }))
    )
  ),
  ledger: mock((): Promise<unknown> => Promise.resolve(emptyLedger)),
};

mock.module('@/lib/amwal-api/admin', () => ({
  ...actualAdminApi,
  getAdminOverviewKpi: api.kpi,
  getAdminRfmSegments: api.segments,
  getAnalyticsAccumulation: api.accumulation,
  getAnalyticsComposition: api.composition,
  getAdminLedger: api.ledger,
}));
mock.module('@tanstack/react-router', () => ({
  ...actualRouter,
  useNavigate: () => () => {
    // navigation is not under test
  },
}));

const { act } = await import('react');
const { invalidateResources } = await import(
  '../../src/lib/amwal-api/resource-cache'
);
const { createRoot } = await import('react-dom/client');
const { AdminOverviewView } = await import(
  '../../src/components/admin/overview-view'
);

let unmount: (() => void) | null = null;

async function renderOverview(): Promise<string> {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };

  act(() => {
    root.render(createElement(AdminOverviewView, {}));
  });
  // Let every useResource promise settle and re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  return (container.textContent ?? '').replaceAll(' ', ' ');
}

afterEach(() => {
  unmount?.();
  unmount = null;
  // Resources are cached by key; every scenario must start from a clean slate.
  invalidateResources();
});

afterAll(() => {
  mock.module('@/lib/amwal-api/admin', () => actualAdminApi);
  mock.module('@tanstack/react-router', () => actualRouter);
  for (const [name, value] of previousGlobals) {
    if (value === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value,
      });
    }
  }
  dom.window.close();
});

describe('AdminOverviewView', () => {
  test('renders zero and empty production data without crashing or dummy tags', async () => {
    const text = await renderOverview();

    expect(text).toContain('Total Penghimpunan');
    expect(text).toContain('Rp 0');
    expect(text).toContain('0 / 0');
    expect(text).toContain('Belum ada donasi lunas pada tahun');
    expect(text).toContain('Belum ada donatur dengan donasi lunas.');
    expect(text).toContain('Belum ada dana yang dihimpun.');
    expect(text).toContain('Belum ada transaksi lunas.');
    expect(text).not.toContain('using dummy data');
  });

  test('shows real ledger figures and recent activity', async () => {
    api.kpi.mockImplementationOnce(() =>
      Promise.resolve({
        totalFundsCollected: '1500000.00',
        paidTransactions: 3,
        totalTransactions: 5,
        activePrograms: 2,
      })
    );
    api.ledger.mockImplementationOnce(() =>
      Promise.resolve({
        ...emptyLedger,
        allocations: [
          {
            kind: 'program',
            label: 'Wakaf Sumur Desa',
            total: 1_500_000,
            txCount: 3,
            donors: 2,
            share: 100,
          },
        ],
        items: [
          {
            id: 'TX-1',
            donorName: 'Hamba Allah',
            isAnonymous: true,
            amount: 500_000,
            akad: 'WAKAF',
            program: 'Wakaf Sumur Desa',
            createdAt: '2026-09-17 05:00:00.000',
            paymentMethod: 'qris',
          },
        ],
      })
    );

    const text = await renderOverview();

    expect(text).toContain('Rp 1.500.000');
    expect(text).toContain('3 / 5');
    expect(text).toContain('Hamba Allah · Wakaf Sumur Desa');
    expect(text).toContain('17 Sep 2026, 12:00:00 WIB');
    expect(text).toContain('Rp 500.000');
  });

  test('shows an error state instead of throwing when a procedure fails', async () => {
    api.ledger.mockImplementationOnce(() =>
      Promise.reject(new Error('Unauthorized'))
    );

    const text = await renderOverview();

    expect(text).toContain('Gagal memuat data.');
    expect(text).toContain('Total Penghimpunan');
  });
});

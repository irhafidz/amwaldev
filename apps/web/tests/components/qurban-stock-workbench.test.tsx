import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

/**
 * Issue #54 — shohibul registration must live inside the stock workbench's
 * animal/slot context, not in a standalone page-level section. These tests pin
 * the contract the module view relies on: only empty slots offer the quick
 * action, and clicking one hands the caller the locked slot label.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/admin/qurban',
});

const DOM_PROPERTY_NAMES = [
  'document',
  'Event',
  'HTMLElement',
  'KeyboardEvent',
  'MouseEvent',
  'navigator',
  'Node',
  'window',
] as const;

let restoreDom: (() => void) | null = null;

function installDom() {
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: dom.window.document },
    Event: { configurable: true, value: dom.window.Event },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    navigator: { configurable: true, value: dom.window.navigator },
    Node: { configurable: true, value: dom.window.Node },
    window: { configurable: true, value: dom.window },
  });
}

function installDomWithRestore() {
  const previous = new Map<(typeof DOM_PROPERTY_NAMES)[number], unknown>();
  for (const name of DOM_PROPERTY_NAMES) {
    previous.set(name, (globalThis as Record<string, unknown>)[name]);
  }

  installDom();
  restoreDom = () => {
    for (const name of DOM_PROPERTY_NAMES) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: previous.get(name),
      });
    }
  };
}

installDom();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BATCH = {
  id: 'HWB-TEST-54',
  jenisHewan: 'SAPI',
  totalSlot: 3,
  hargaPerSlot: '2500000',
  status: 'TERSEDIA',
  ras: 'Sapi 02',
  kelasGrade: null,
  wilayahPenyaluran: null,
  namaBatch: null,
  slots: [
    { id: 'SLT-54-1', nomorSlot: 1, status: 'TERISI' },
    { id: 'SLT-54-2', nomorSlot: 2, status: 'TERSEDIA' },
    { id: 'SLT-54-3', nomorSlot: 3, status: 'TERSEDIA' },
  ],
  slotTerpakai: 1,
  slotTotal: 3,
  createdAt: '2026-09-20T00:00:00.000Z',
};

mock.module('@/lib/amwal-api/admin', () => ({
  getAdminHewanBatches: () => Promise.resolve([BATCH]),
}));

const { cleanup, fireEvent, render, waitFor } = await import(
  '@testing-library/react'
);
const { QurbanStockWorkbench } = await import(
  '../../src/components/admin/qurban-stock-workbench'
);
type SlotRegistrationTarget =
  import('../../src/components/admin/qurban-stock-workbench').SlotRegistrationTarget;

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
});

beforeEach(installDomWithRestore);

async function openWorkbench(
  onRegisterShohibul: (target: SlotRegistrationTarget) => void
) {
  const view = render(
    createElement(QurbanStockWorkbench, {
      isOpen: true,
      onClose: () => null,
      onRegisterShohibul,
    })
  );
  fireEvent.click(await view.findByRole('button', { name: 'Detail Slot' }));
  return view;
}

describe('QurbanStockWorkbench slot-level registration [#54]', () => {
  test('renders nothing while closed', () => {
    const view = render(
      createElement(QurbanStockWorkbench, {
        isOpen: false,
        onClose: () => null,
        onRegisterShohibul: () => null,
      })
    );
    expect(view.queryByText('Workbench Kelola Stok Qurban')).toBeNull();
  });

  test('offers the quick action only on slots that are still empty', async () => {
    const view = await openWorkbench(() => null);

    await waitFor(() =>
      expect(view.getAllByText('Daftarkan Shohibul')).toHaveLength(2)
    );
    // Slot 1 is TERISI — shown as a read-only tile, never as a quick action.
    expect(view.getByText('TERISI')).toBeDefined();
  });

  test('hands the locked batch + slot to the caller', async () => {
    const onRegisterShohibul = mock((_target: SlotRegistrationTarget) => null);
    const view = await openWorkbench(onRegisterShohibul);

    const quickActions = await view.findAllByText('Daftarkan Shohibul');
    const firstAction = quickActions.at(0);
    expect(firstAction).toBeDefined();
    fireEvent.click(firstAction as HTMLElement);

    expect(onRegisterShohibul).toHaveBeenCalledTimes(1);
    expect(onRegisterShohibul.mock.calls.at(0)?.at(0)).toEqual({
      batchId: 'HWB-TEST-54',
      nomorSlot: 2,
      label: 'Slot 2/3 SAPI (Sapi 02)',
    });
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
});

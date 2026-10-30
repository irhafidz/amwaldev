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

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/program/kebaikan',
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

const { cleanup, fireEvent, render, waitFor, within } = await import(
  '@testing-library/react'
);
const { ShareButton, ShareModal } = await import(
  '../../src/components/share/share-modal'
);

const SHARE_PARAMS = {
  category: 'WAKAF' as const,
  title: 'Wakaf Pendidikan',
  url: 'https://amwal.id/program/wakaf-pendidikan',
};

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(dom.window.navigator, 'share', {
    configurable: true,
    value: undefined,
  });
});

beforeEach(installDomWithRestore);

describe('ShareModal [I-3]', () => {
  test('falls back to a dialog with WhatsApp, X, and copy actions', async () => {
    const view = render(
      createElement(ShareButton, {
        ...SHARE_PARAMS,
        triggerLabel: 'Bagikan Program',
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Bagikan Program' }));

    expect(await view.findByRole('dialog')).toBeDefined();
    expect(
      view.getByRole('link', { name: 'Bagikan ke WhatsApp' })
    ).toBeDefined();
    expect(
      view.getByRole('link', { name: 'Bagikan ke X atau Twitter' })
    ).toBeDefined();
    expect(view.getByRole('button', { name: 'Salin tautan' })).toBeDefined();
  });

  test('copies the URL and shows temporary Tersalin feedback', async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const view = render(
      createElement(ShareModal, {
        ...SHARE_PARAMS,
        copyFeedbackDurationMs: 50,
        onOpenChange: mock((_open: boolean) => null),
        open: true,
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Salin tautan' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(SHARE_PARAMS.url)
    );
    expect(await view.findByText('Tersalin!')).toBeDefined();
  });

  test('uses navigator.share when available and skips the fallback dialog', async () => {
    const share = mock(() => Promise.resolve());
    Object.defineProperty(dom.window.navigator, 'share', {
      configurable: true,
      value: share,
    });

    const view = render(createElement(ShareButton, { ...SHARE_PARAMS }));
    fireEvent.click(view.getByRole('button', { name: 'Bagikan' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(view.queryByRole('dialog')).toBeNull();
  });

  test('does not open fallback when native share is cancelled by the user', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    const share = mock(() => Promise.reject(abortError));
    Object.defineProperty(dom.window.navigator, 'share', {
      configurable: true,
      value: share,
    });

    const view = render(createElement(ShareButton, { ...SHARE_PARAMS }));
    fireEvent.click(view.getByRole('button', { name: 'Bagikan' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(view.queryByRole('dialog')).toBeNull();
  });

  test('closes on Escape and traps Tab focus inside the dialog', async () => {
    const view = render(
      createElement(ShareButton, {
        ...SHARE_PARAMS,
        triggerLabel: 'Bagikan Program',
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Bagikan Program' }));

    const dialog = await view.findByRole('dialog');
    const focusable = within(dialog).getAllByRole('button');
    const closeButton = view.getByRole('button', {
      name: 'Tutup dialog bagikan',
    });
    const lastButton = focusable.at(-1);
    expect(lastButton).toBeDefined();

    lastButton?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
});

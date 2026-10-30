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
import type { SessionUser } from '../../src/lib/auth/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/afiliasi',
});

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

installDom();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, waitFor } = await import(
  '@testing-library/react'
);
const { AffiliateDashboardView } = await import('../../src/routes/afiliasi');

const USER: SessionUser = {
  name: 'Codex Bara',
  role: 'WAKIF',
  userId: 'p11-affiliate-user',
};

const DASHBOARD = {
  code: 'BARA123',
  totalAttributedDonations: 3,
  totalClicks: 12,
};

afterEach(() => {
  cleanup();
  installDom();
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

beforeEach(() => {
  installDom();
});

function renderDashboard(user: SessionUser | null = USER) {
  return render(
    createElement(AffiliateDashboardView, {
      data: DASHBOARD,
      error: null,
      isLoading: false,
      onReload: mock(() => null),
      referralOrigin: 'https://amwal.id',
      user,
    })
  );
}

describe('/afiliasi dashboard [I-4]', () => {
  test('renders referral code, full link, stats, and share actions', () => {
    const view = renderDashboard();

    expect(view.getByText('BARA123')).toBeDefined();
    expect(view.getByText('https://amwal.id/r/BARA123')).toBeDefined();
    expect(view.getByText('12')).toBeDefined();
    expect(view.getByText('Donasi Teratribusi')).toBeDefined();
    expect(view.getAllByText('3').length).toBeGreaterThan(0);
    expect(
      view.getByRole('button', { name: 'Salin tautan referral' })
    ).toBeDefined();
    expect(view.getByRole('button', { name: 'Bagikan' })).toBeDefined();
    expect(view.getByText('Salin tautan')).toBeDefined();
    expect(view.getByText('Sebarkan ke kerabat')).toBeDefined();
    expect(view.getByText('Raih pahala jariyah')).toBeDefined();
  });

  test('copies the referral link and shows Tersalin feedback', async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const view = renderDashboard();

    fireEvent.click(
      view.getByRole('button', { name: 'Salin tautan referral' })
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://amwal.id/r/BARA123')
    );
    expect(await view.findByText('Tersalin!')).toBeDefined();
  });

  test('shows a login invitation for guests without fetching affiliate data', () => {
    const view = renderDashboard(null);

    expect(
      view.getByRole('link', { name: 'Masuk untuk Bergabung' })
    ).toBeDefined();
    expect(view.queryByText('BARA123')).toBeNull();
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
  // This file installs its DOM globals once and never restores them per test;
  // leaving `window` behind makes the next file's first `env/server` import
  // believe it runs in a browser.
  for (const name of [
    'document',
    'Event',
    'HTMLElement',
    'KeyboardEvent',
    'MouseEvent',
    'navigator',
    'Node',
    'window',
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

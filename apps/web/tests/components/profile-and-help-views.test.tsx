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
  url: 'https://amwal.id/bantuan',
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

function installDomWithRestore() {
  const previous = new Map<(typeof DOM_PROPERTY_NAMES)[number], unknown>();
  for (const name of DOM_PROPERTY_NAMES) {
    previous.set(name, (globalThis as Record<string, unknown>)[name]);
  }

  installDom();
  restoreDom = () => {
    for (const name of DOM_PROPERTY_NAMES) {
      if (previous.get(name) === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          value: previous.get(name),
        });
      }
    }
  };
}

installDom();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Snapshot the real module first. Bun's `mock.module` leaks into every other
// test file in the same process, so the mock spreads the real exports (nothing
// goes missing for files that run later) and is restored in `afterAll`.
const actualRouter = { ...(await import('@tanstack/react-router')) };

mock.module('@tanstack/react-router', () => ({
  ...actualRouter,
  Link: ({
    children,
    className,
    to,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    className?: string;
    to?: string;
    onClick?: () => void;
    'aria-label'?: string;
  }) =>
    createElement(
      'a',
      {
        href: typeof to === 'string' ? to : '#',
        className,
        onClick,
        'aria-label': ariaLabel,
      },
      children
    ),
  useRouter: () => ({
    navigate: () => {
      // no-op in test mock
    },
  }),
  useLocation: () => ({ pathname: '/bantuan' }),
  useRouteContext: () => ({ user: null }),
}));

const { cleanup, fireEvent, render, waitFor } = await import(
  '@testing-library/react'
);
const { ToastProvider } = await import('../../src/components/ui/toast');
const { HelpCenterView } = await import(
  '../../src/components/help/help-center-view'
);
const { ProfileSecurityView } = await import(
  '../../src/components/profile/profile-security-view'
);

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
});

beforeEach(installDomWithRestore);

afterAll(() => {
  mock.module('@tanstack/react-router', () => actualRouter);
  cleanup();
  for (const name of DOM_PROPERTY_NAMES) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('HelpCenterView [Screen 5 - Figma Node: 2966-9278]', () => {
  test('renders hero banner, contact services, and accordion FAQs', () => {
    const view = render(
      createElement(ToastProvider, null, createElement(HelpCenterView))
    );

    expect(view.getByText('Pusat Bantuan')).toBeDefined();
    expect(view.getByText('Halo, ada yang bisa kami bantu?')).toBeDefined();
    expect(view.getByText('0812-3456-7890')).toBeDefined();
    expect(view.getByText('support@amwal.id')).toBeDefined();
    expect(view.getByText('021-27874080')).toBeDefined();
    expect(
      view.getByText('Bagaimana cara menunaikan wakaf uang di Amwal?')
    ).toBeDefined();
    expect(view.getByText('Tanya AI Syariah')).toBeDefined();
  });

  test('filters FAQ items interactively by search query', async () => {
    const view = render(
      createElement(ToastProvider, null, createElement(HelpCenterView))
    );

    const searchInput = view.getByPlaceholderText(
      'Cari topik bantuan atau pertanyaan...'
    );

    fireEvent.change(searchInput, { target: { value: 'Sertifikat' } });

    await waitFor(() => {
      expect(
        view.getByText('Kapan saya mendapatkan Sertifikat Wakaf Uang (SWU)?')
      ).toBeDefined();
      expect(
        view.queryByText('Bagaimana cara menunaikan wakaf uang di Amwal?')
      ).toBeNull();
    });
  });

  test('filters FAQ items by category pill', async () => {
    const view = render(
      createElement(ToastProvider, null, createElement(HelpCenterView))
    );

    const legalitasButton = view.getByRole('button', { name: 'Legalitas' });
    fireEvent.click(legalitasButton);

    await waitFor(() => {
      expect(
        view.getByText(
          'Apakah seluruh Nazhir di Amwal telah resmi terdaftar di BWI?'
        )
      ).toBeDefined();
      expect(
        view.queryByText('Bagaimana cara menunaikan wakaf uang di Amwal?')
      ).toBeNull();
    });
  });

  test('expands and collapses FAQ answers on click', () => {
    const view = render(
      createElement(ToastProvider, null, createElement(HelpCenterView))
    );

    const faqButton = view.getByText(
      'Kapan saya mendapatkan Sertifikat Wakaf Uang (SWU)?'
    );
    fireEvent.click(faqButton);

    expect(
      view.getByText(
        /Sertifikat Wakaf Uang \(SWU\) digital otomatis diterbitkan/
      )
    ).toBeDefined();
  });
});

describe('ProfileSecurityView [Screen 4 - Figma Node: 2966-9225]', () => {
  const dummyUser = {
    userId: 'test-user-1',
    role: 'WAKIF' as const,
    name: 'Donatur Uji',
  };

  test('validates minimum 8 characters for new password', async () => {
    const view = render(
      createElement(
        ToastProvider,
        null,
        createElement(ProfileSecurityView, { user: dummyUser })
      )
    );

    const newPasswordInput = view.getByPlaceholderText('Minimal 8 karakter');
    fireEvent.change(newPasswordInput, { target: { value: '123' } });

    await waitFor(() => {
      expect(
        view.getByText('Kata sandi baru harus memiliki minimal 8 karakter.')
      ).toBeDefined();
    });
  });

  test('validates confirmation password mismatch', async () => {
    const view = render(
      createElement(
        ToastProvider,
        null,
        createElement(ProfileSecurityView, { user: dummyUser })
      )
    );

    const newPasswordInput = view.getByPlaceholderText('Minimal 8 karakter');
    const confirmInput = view.getByPlaceholderText(
      'Ketik ulang kata sandi baru'
    );

    fireEvent.change(newPasswordInput, {
      target: { value: 'passwordRahasia123' },
    });
    fireEvent.change(confirmInput, { target: { value: 'passwordBeda123' } });

    await waitFor(() => {
      expect(
        view.getByText(
          'Konfirmasi kata sandi tidak cocok dengan kata sandi baru.'
        )
      ).toBeDefined();
    });
  });

  test('toggles password visibility between text and password input type', () => {
    const view = render(
      createElement(
        ToastProvider,
        null,
        createElement(ProfileSecurityView, { user: dummyUser })
      )
    );

    const currentInput = view.getByPlaceholderText(
      'Masukkan kata sandi saat ini'
    ) as HTMLInputElement;
    expect(currentInput.type).toBe('password');

    const toggleButtons = view.getAllByLabelText('Tampilkan kata sandi');
    fireEvent.click(toggleButtons[0]);

    expect(currentInput.type).toBe('text');
  });
});

describe('BottomNav Integration [Profil Highlighting]', () => {
  test('renders 5 navigation items including Profil', async () => {
    const { BottomNav } = await import('../../src/components/bottom-nav');
    const view = render(createElement(BottomNav));

    expect(view.getByText('Beranda')).toBeDefined();
    expect(view.getByText('Wakaf')).toBeDefined();
    expect(view.getByText('Riwayat')).toBeDefined();
    expect(view.getByText('Edukasi')).toBeDefined();
    expect(view.getByText('Profil')).toBeDefined();
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
});

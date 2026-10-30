import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentMethodSelector } from '../../src/components/payment/payment-method-selector';

const changes: string[] = [];

const render = (value: Parameters<typeof PaymentMethodSelector>[0]['value']) =>
  renderToStaticMarkup(
    <PaymentMethodSelector
      onChange={(code) => changes.push(code)}
      value={value}
    />
  );

/** Tab yang terpilih, dibaca dari markup (aria-selected="true"). */
function selectedTab(html: string): string | null {
  const match = html.match(
    /<button[^>]*aria-selected="true"[^>]*>(?:.*?<span>)([^<]+)<\/span>/
  );
  return match?.[1] ?? null;
}

describe('PaymentMethodSelector', () => {
  test('exposes the three Mayar categories as an accessible tablist', () => {
    const html = render('qris');

    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('QRIS');
    expect(html).toContain('Virtual Account');
    expect(html).toContain('E-Wallet');
    expect(html).toContain('role="tabpanel"');
  });

  test('QRIS is the active tab with no bank or wallet list', () => {
    const html = render('qris');

    expect(selectedTab(html)).toBe('QRIS');
    expect(html).not.toContain('BNI');
    expect(html).not.toContain('GoPay</button>');
    expect(html).toContain('Metode terpilih:');
  });

  test('a va/* value activates the Virtual Account tab and lists every bank', () => {
    const html = render('va/bni');

    expect(selectedTab(html)).toBe('Virtual Account');
    for (const bank of [
      'BSI',
      'Mandiri',
      'BNI',
      'BRI',
      'Permata',
      'CIMB Niaga',
      'BJB',
    ]) {
      expect(html).toContain(`>${bank}</button>`);
    }
    // The picked bank is pressed and named in the summary.
    expect(html).toMatch(/aria-pressed="true"[^>]*>BNI<\/button>/);
    expect(html).toContain('<strong');
    expect(html).toContain('VA BNI');
  });

  test('an ewallet/* value activates the E-Wallet tab and lists the wallets', () => {
    const html = render('ewallet/gopay');

    expect(selectedTab(html)).toBe('E-Wallet');
    for (const wallet of ['GoPay', 'DANA', 'ShopeePay', 'LinkAja']) {
      expect(html).toContain(`>${wallet}</button>`);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>GoPay<\/button>/);
  });

  test('does not offer methods Mayar cannot take through the API', () => {
    const html = `${render('va/bsi')}${render('ewallet/dana')}`;

    expect(html).not.toContain('>OVO</button>');
    expect(html).not.toContain('>Jenius</button>');
    expect(html).not.toContain('>Flip</button>');
  });

  test('tab buttons are reachable only for the active tab (roving tabindex)', () => {
    const html = render('va/bsi');

    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  });
});

describe('PaymentMethodSelector — batas QRIS (QA-05)', () => {
  const renderWithAmount = (
    value: Parameters<typeof PaymentMethodSelector>[0]['value'],
    amount: number
  ) =>
    renderToStaticMarkup(
      <PaymentMethodSelector
        amount={amount}
        onChange={(code) => changes.push(code)}
        value={value}
      />
    );
  const qrisTab = (html: string) =>
    html.match(/<button[^>]*id="[^"]*-tab-qris"[^>]*>/)?.[0] ?? '';

  test('di atas Rp 10 juta tab QRIS nonaktif dengan penjelasan yang mengarahkan ke VA', () => {
    const html = renderWithAmount('va/bsi', 15_000_000);

    expect(qrisTab(html)).toContain('disabled');
    expect(qrisTab(html)).toContain('aria-disabled="true"');
    expect(qrisTab(html)).toContain('title="QRIS hanya bisa dipakai');
    expect(html).toContain('data-testid="qris-limit-note"');
    expect(html).toContain('Gunakan Virtual Account');
  });

  test('tepat Rp 10 juta atau tanpa nominal, QRIS tetap bisa dipilih', () => {
    for (const html of [renderWithAmount('qris', 10_000_000), render('qris')]) {
      expect(qrisTab(html)).not.toContain('disabled');
      expect(html).not.toContain('qris-limit-note');
    }
  });
});

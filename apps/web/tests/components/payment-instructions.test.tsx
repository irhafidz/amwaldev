import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { isChatWidgetPath } from '../../src/components/chat/floating-chat-widget';
import { PaymentInstructionsPanel } from '../../src/components/payment/payment-instructions';

const render = (props: Parameters<typeof PaymentInstructionsPanel>[0]) =>
  renderToStaticMarkup(<PaymentInstructionsPanel {...props} />);

describe('PaymentInstructionsPanel', () => {
  test('QRIS shows the QR image, a save link and the expiry', () => {
    const html = render({
      orderId: 'ORD-1',
      hostedUrl: 'https://pay.example/x',
      instructions: {
        type: 'qris',
        qrString: '000201',
        qrImage: 'data:image/png;base64,AAAA',
        expiresAt: '2026-10-08T05:17:38.397Z',
      },
    });

    expect(html).toContain('Scan QRIS');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('alt="Kode QRIS pembayaran"');
    expect(html).toContain('download="QRIS-Amwal-ORD-1.png"');
    expect(html).toContain('Bayar sebelum');
    // The hosted page stays reachable as a fallback, not as the main path.
    expect(html).toContain('Buka halaman pembayaran Mayar');
  });

  test('Virtual Account shows the bank, a selectable number and a copy button', () => {
    const html = render({
      orderId: 'ORD-2',
      instructions: {
        type: 'virtual_account',
        bank: 'BNI',
        accountNumber: '8808862065326583',
      },
    });

    expect(html).toContain('Virtual Account BNI');
    expect(html).toContain('8808862065326583');
    expect(html).toContain('aria-label="Salin nomor Virtual Account"');
    expect(html).toContain('Salin');
  });

  test('e-wallet shows an open-app button pointing at the action URL', () => {
    const html = render({
      orderId: 'ORD-3',
      instructions: {
        type: 'ewallet',
        wallet: 'GOPAY',
        actionUrl: 'https://gopay.co.id/app/merchanttransfer?tref=A1',
        actionType: 'DEEPLINK',
      },
    });

    expect(html).toContain('Bayar dengan GoPay');
    expect(html).toContain('Buka GoPay');
    expect(html).toContain(
      'href="https://gopay.co.id/app/merchanttransfer?tref=A1"'
    );
  });

  test('without instructions only the Mayar link is offered (other device or cleared cache)', () => {
    const html = render({
      orderId: 'ORD-4',
      hostedUrl: 'https://pay.example/x',
    });

    expect(html).toContain('Lanjutkan Pembayaran');
    expect(html).toContain('href="https://pay.example/x"');
    expect(html).not.toContain('Scan QRIS');
  });
});

describe('chat widget visibility', () => {
  test.each(['/dashboard', '/dashboard/', '/beranda'])(
    '%s shows it',
    (path) => {
      expect(isChatWidgetPath(path)).toBe(true);
    }
  );

  test.each([
    '/',
    '/wakaf',
    '/wakaf/abc/donasi',
    '/wakaf/status',
    '/infaq',
    '/zakat/checkout',
    '/qurban/checkout',
    '/riwayat',
    '/profil/pengaturan',
    '/dashboard/poin-berkah',
    '/tanya-ai',
    '/admin',
  ])('%s hides it', (path) => {
    expect(isChatWidgetPath(path)).toBe(false);
  });
});

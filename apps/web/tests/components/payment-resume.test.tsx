import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumePaymentCard } from '../../src/components/history/transaction-detail';
import { OrderLinkCard } from '../../src/components/payment/order-link-card';
import { PaymentCountdown } from '../../src/components/payment/payment-countdown';
import type { TransactionDetail } from '../../src/lib/amwal-api/types';

const inMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const base: TransactionDetail = {
  id: 'AMW-TXN-1',
  orderId: '601026000001',
  amount: '250000.00',
  statusPembayaran: 'PENDING',
  createdAt: new Date().toISOString(),
};

describe('ResumePaymentCard (QA-02, D1)', () => {
  test('menampilkan instruksi, tautan, dan hitung mundur selama bisa dilanjutkan', () => {
    const html = renderToStaticMarkup(
      <ResumePaymentCard
        data={{
          ...base,
          resume: {
            instructions: {
              type: 'virtual_account',
              bank: 'BNI',
              accountNumber: '8808001026000001',
            },
            url: 'https://pay.example/x',
            expiresAt: inMinutes(30),
          },
        }}
      />
    );
    expect(html).toContain('Lanjutkan Pembayaran');
    expect(html).toContain('8808001026000001');
    expect(html).toContain('data-testid="payment-countdown"');
  });

  test('tidak dirender bila tidak ada yang bisa dilanjutkan', () => {
    expect(
      renderToStaticMarkup(
        <ResumePaymentCard data={{ ...base, resume: null }} />
      )
    ).toBe('');
  });
});

describe('PaymentCountdown', () => {
  test('format jam:menit:detik, dan "Kedaluwarsa" setelah lewat', () => {
    expect(
      renderToStaticMarkup(<PaymentCountdown expiresAt={inMinutes(90)} />)
    ).toMatch(/Sisa waktu <time[^>]*>01:(29|30):\d\d<\/time>/);
    expect(
      renderToStaticMarkup(<PaymentCountdown expiresAt={inMinutes(-1)} />)
    ).toContain('Kedaluwarsa');
  });
});

describe('OrderLinkCard (QA-03, D2)', () => {
  test('menampilkan kode transaksi dan tautan status tunggal yang bisa disalin', () => {
    const html = renderToStaticMarkup(<OrderLinkCard orderId="601026000001" />);
    expect(html).toContain('601026000001');
    expect(html).toContain('href="/transaksi/601026000001"');
    expect(html).toContain('Salin tautan status');
  });
});

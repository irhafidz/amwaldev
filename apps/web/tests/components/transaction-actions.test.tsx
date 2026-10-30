import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ActionControls,
  hasCertificate,
} from '../../src/components/history/transaction-detail';
import type { TransactionDetail } from '../../src/lib/amwal-api/types';

const base: TransactionDetail = {
  id: 'AMW-TXN-1',
  amount: '250000.00',
  statusPembayaran: 'LUNAS',
  createdAt: '2026-10-09 01:42:00.000',
  jenisTransaksi: 'WAKAF',
};

describe('hasCertificate (QA-11)', () => {
  test('only settled transactions of a supported type', () => {
    for (const jenis of ['WAKAF', 'ZAKAT', 'INFAQ', 'QURBAN']) {
      expect(hasCertificate({ jenisTransaksi: jenis }, true)).toBe(true);
      expect(hasCertificate({ jenisTransaksi: jenis }, false)).toBe(false);
    }
    expect(hasCertificate({ jenisTransaksi: 'LAINNYA' }, true)).toBe(false);
    expect(hasCertificate({ jenisTransaksi: undefined }, true)).toBe(false);
  });
});

describe('ActionControls', () => {
  const render = (data: TransactionDetail, settled: boolean) =>
    renderToStaticMarkup(<ActionControls data={data} settled={settled} />);

  test('shows "Unduh PDF" for a settled transaction', () => {
    const html = render(base, true);
    expect(html).toContain('Unduh PDF');
    expect(html).toContain('Lihat Kuitansi');
  });

  test('hides the download button (not a disabled one) until the document is ready', () => {
    for (const data of [
      { ...base, statusPembayaran: 'PENDING' as const },
      { ...base, statusPembayaran: 'GAGAL' as const },
    ]) {
      const html = render(data, false);
      expect(html).not.toContain('Unduh PDF');
      expect(html).not.toContain('disabled');
      expect(html).toContain('Lihat Kuitansi');
    }
  });
});

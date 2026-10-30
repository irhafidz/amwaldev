import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopSummaryCard } from '../../src/components/wakaf/waqf-donate-form';
import type { WaqfProgram } from '../../src/lib/amwal-api/types';

const program = {
  judul: 'Wakaf Pembangunan Masjid',
  kategori: 'Masjid',
  nadzirProfile: { namaLembaga: 'Yayasan Wakaf Contoh' },
} as unknown as WaqfProgram;

describe('DesktopSummaryCard (QA-18)', () => {
  test('the grid item itself is sticky, like the infaq summary', () => {
    const html = renderToStaticMarkup(
      <DesktopSummaryCard
        amount={250_000}
        program={program}
        submitting={false}
      />
    );
    const aside = html.match(/<aside[^>]*>/)?.[0] ?? '';

    // Grid induk memakai `items-start`: hanya item grid (aside) yang bisa
    // menempel saat digulir; `sticky` di div dalam tidak berefek.
    expect(aside).toContain('lg:sticky');
    expect(aside).toContain('lg:top-24');
    expect(html.slice(aside.length)).not.toMatch(/class="[^"]*\bsticky\b/);
    expect(html).toContain('Rp');
  });
});

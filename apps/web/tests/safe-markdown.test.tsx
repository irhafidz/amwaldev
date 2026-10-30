import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeMarkdown } from '../src/components/admin/safe-markdown';
import { safeHttpUrl, slugify } from '../src/lib/amwal-api/cms';

/**
 * Regresi XSS untuk konten CMS: desain acuan merender body lewat
 * `dangerouslySetInnerHTML`. Perender pengganti tidak boleh pernah
 * meloloskan markup aktif dari basis data.
 */

function render(content: string): string {
  return renderToStaticMarkup(<SafeMarkdown content={content} />);
}

describe('SafeMarkdown', () => {
  test('tag script & atribut event warisan editor lama tidak dirender', () => {
    const html = render(
      '<p onclick="alert(1)">Halo</p><script>alert(1)</script><img src=x onerror=alert(1)>'
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<img');
    expect(html).toContain('Halo');
  });

  test('tautan javascript: tidak menjadi anchor', () => {
    const html = render('[klik](javascript:alert(1))');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('<a');
  });

  test('tautan https menjadi anchor dengan rel noopener', () => {
    const html = render('[BWI](https://www.bwi.go.id)');
    expect(html).toContain('href="https://www.bwi.go.id"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('subset markdown dirender sebagai elemen React', () => {
    const html = render(
      '## Subjudul\n\n- satu\n- **dua**\n\n> 🕋 Dalil: QS 3:92'
    );
    expect(html).toContain('<h2');
    expect(html).toContain('<ul');
    expect(html).toContain('<strong');
    expect(html).toContain('Rujukan Fiqih');
  });
});

describe('cms helpers', () => {
  test('safeHttpUrl hanya menerima http(s)', () => {
    expect(safeHttpUrl('https://a.test/x.jpg')).toBe('https://a.test/x.jpg');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });

  test('slugify menghasilkan slug kebab-case sesuai SLUG_REGEX', () => {
    expect(slugify('Panduan Fiqih Wakaf & Sukuk 2026!')).toBe(
      'panduan-fiqih-wakaf-sukuk-2026'
    );
  });
});

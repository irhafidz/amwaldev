import { describe, expect, test } from 'bun:test';
import { sanitizeRichHtml } from '../src/components/admin/sanitize-rich-html';

/**
 * Regresi XSS untuk konten editor edukasi. `education-management-view`
 * dipulihkan 1:1 dari origin/awan (PR #28) dan tetap merender HTML kaya
 * lewat `dangerouslySetInnerHTML`; pembersih inilah yang menjaga agar
 * markup aktif dari basis data tidak pernah ikut dieksekusi.
 */

describe('sanitizeRichHtml', () => {
  test('membuang <script> beserta isinya', () => {
    const html = sanitizeRichHtml('<p>Halo</p><script>alert(1)</script>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('<p>Halo</p>');
  });

  test('membuang atribut penangan kejadian', () => {
    const html = sanitizeRichHtml('<div onclick="steal()" class="a">x</div>');
    expect(html).not.toContain('onclick');
    expect(html).toContain('class="a"');
  });

  test('membuang <img onerror> karena img bukan tag yang diizinkan', () => {
    const html = sanitizeRichHtml('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });

  test('membuang iframe dan style', () => {
    const html = sanitizeRichHtml(
      '<iframe src="https://evil.test"></iframe><div style="position:fixed">y</div>'
    );
    expect(html).not.toContain('iframe');
    expect(html).not.toContain('style=');
    expect(html).toContain('y');
  });

  test('tautan javascript: tidak dipertahankan', () => {
    const html = sanitizeRichHtml('<a href="javascript:alert(1)">klik</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('klik');
  });

  test('tautan http(s) dipertahankan dan diberi rel aman', () => {
    const html = sanitizeRichHtml('<a href="https://bwi.go.id">BWI</a>');
    expect(html).toContain('href="https://bwi.go.id"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('markup sah dari editor lama tidak berubah maknanya', () => {
    const source =
      '<h2 class="text-lg">Judul</h2><p class="my-2">Isi <strong>tebal</strong></p><ul class="list-disc"><li>satu</li></ul>';
    const html = sanitizeRichHtml(source);
    expect(html).toContain('<h2 class="text-lg">');
    expect(html).toContain('<strong>');
    expect(html).toContain('<li>satu</li>');
    expect(html).toContain('class="list-disc"');
  });

  test('atribut align dipertahankan (dipakai pembungkus perataan)', () => {
    expect(sanitizeRichHtml('<div align="center">x</div>')).toContain(
      'align="center"'
    );
  });
});

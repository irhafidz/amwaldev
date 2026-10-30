/**
 * Pembersih HTML kaya untuk konten editor edukasi.
 *
 * Komponen `education-management-view` dipulihkan 1:1 dari `origin/awan`
 * (PR #28) dan merender `education_contents.body` lewat
 * `dangerouslySetInnerHTML`. Isinya ditulis admin lewat CMS lalu disimpan di
 * basis data, jadi tanpa pembersihan satu akun admin (atau tempelan dari
 * sumber luar) bisa menanam skrip yang berjalan di peramban admin lain —
 * stored XSS.
 *
 * Elemen `<div className="google-docs-content …">` beserta seluruh kelasnya
 * TIDAK diubah; yang dibersihkan hanya string HTML yang masuk ke dalamnya,
 * sehingga tampilan konten yang sah tetap identik.
 *
 * Pendekatannya daftar-putih: apa pun di luar daftar tag/atribut di bawah
 * dibuang. Murni string — tidak menyentuh DOM, jadi aman dipanggil saat SSR.
 */

/** Tag yang dihasilkan `convertContentToDocHtml()` dan editor lama. */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'a',
]);

/** Elemen yang dibuang BESERTA isinya. */
const VOID_CONTENT =
  /<\s*(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
/** Sisa tag berbahaya yang tidak berpasangan. */
const DANGEROUS_SELF =
  /<\s*\/?\s*(script|style|iframe|object|embed|noscript|form|input|button|link|meta|base)\b[^>]*>/gi;
const TAG = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const ATTR = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;
const SELF_CLOSING_PATTERN = /\/\s*$/;

function sanitizeAttributes(tagName: string, rawAttrs: string): string {
  const kept: string[] = [];

  for (const match of rawAttrs.matchAll(ATTR)) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? '';

    // `on*` (onclick, onerror, …) dan `style` tidak pernah lolos.
    if (name.startsWith('on') || name === 'style') {
      continue;
    }
    if (name === 'class' || name === 'align') {
      kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
      continue;
    }
    if (name === 'href' && tagName === 'a' && SAFE_HREF.test(value.trim())) {
      kept.push(`href="${value.replace(/"/g, '&quot;')}"`);
    }
  }

  // Tautan selalu dibuka aman bila bertarget luar.
  if (tagName === 'a' && kept.some((a) => a.startsWith('href='))) {
    kept.push('rel="noopener noreferrer"');
  }

  return kept.length > 0 ? ` ${kept.join(' ')}` : '';
}

const HTML_TAG = /<[^>]*>/g;
const HTML_ENTITY = /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g;
const WHITESPACE_RUN = /\s+/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(_whole: string, entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const code = Number.parseInt(entity.slice(2), 16);
    return Number.isNaN(code) ? _whole : String.fromCodePoint(code);
  }
  if (entity.startsWith('#')) {
    const code = Number.parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? _whole : String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[entity.toLowerCase()] ?? _whole;
}

/**
 * Plain-text excerpt of rich HTML — for card/modal teasers, never for
 * rendering. Same "pure string, no DOM" approach as `sanitizeRichHtml` so it
 * is safe during SSR: a `DOMParser` call would throw on the server.
 */
export function stripHtmlTags(html: string): string {
  if (!html) {
    return '';
  }
  return html
    .replace(HTML_TAG, ' ')
    .replace(HTML_ENTITY, decodeEntity)
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

export function sanitizeRichHtml(html: string): string {
  if (!html) {
    return '';
  }

  return html
    .replace(VOID_CONTENT, '')
    .replace(DANGEROUS_SELF, '')
    .replace(
      TAG,
      (_whole, closing: string | undefined, name: string, attrs: string) => {
        const tagName = name.toLowerCase();
        if (!ALLOWED_TAGS.has(tagName)) {
          // Tag tak dikenal dibuang, isinya (teks) tetap ditampilkan.
          return '';
        }
        if (closing) {
          return `</${tagName}>`;
        }
        const selfClosing = SELF_CLOSING_PATTERN.test(attrs) ? ' /' : '';
        return `<${tagName}${sanitizeAttributes(tagName, attrs)}${selfClosing}>`;
      }
    );
}

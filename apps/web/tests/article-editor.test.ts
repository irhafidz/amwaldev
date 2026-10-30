import { describe, expect, test } from 'bun:test';
import {
  isHtmlBlank,
  LEGACY_PLACEHOLDER_HTML,
  normalizeArticleHtml,
} from '../src/lib/article-editor';

/** Murni, tanpa DOM. Editor artikel admin: petunjuk bukan isi (UAT #4). */
describe('isHtmlBlank', () => {
  test('kosong: string kosong, paragraf/div kosong, <br>, spasi, &nbsp;', () => {
    for (const html of [
      '',
      '<p></p>',
      '<p><br></p>',
      '<div><br></div>',
      '  <p>&nbsp;</p>  ',
      '<p> </p><p></p>',
    ]) {
      expect(isHtmlBlank(html)).toBe(true);
    }
  });

  test('berisi: teks, gambar, tabel, daftar, kutipan, garis', () => {
    for (const html of [
      '<p>Halo</p>',
      '<p><img src="a.png"></p>',
      '<table><tr><td></td></tr></table>',
      '<ul><li></li></ul>',
      '<blockquote></blockquote>',
      '<hr>',
    ]) {
      expect(isHtmlBlank(html)).toBe(false);
    }
  });
});

describe('normalizeArticleHtml', () => {
  test('editor kosong disimpan sebagai string kosong', () => {
    expect(normalizeArticleHtml('<p><br></p>')).toBe('');
    expect(normalizeArticleHtml('')).toBe('');
  });

  test('kalimat petunjuk lama dibuang, tulisan penulis dipertahankan', () => {
    expect(normalizeArticleHtml(LEGACY_PLACEHOLDER_HTML)).toBe('');
    expect(
      normalizeArticleHtml(`${LEGACY_PLACEHOLDER_HTML}<p>Isi saya</p>`)
    ).toBe('<p>Isi saya</p>');
  });

  test('isi biasa tidak diubah', () => {
    expect(normalizeArticleHtml('<h2>Judul</h2><p>Isi</p>')).toBe(
      '<h2>Judul</h2><p>Isi</p>'
    );
  });
});

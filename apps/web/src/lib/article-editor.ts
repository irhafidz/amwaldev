/**
 * Isi editor artikel (UAT #4 / temuan sesi pemulihan draf): kalimat petunjuk
 * "Mulai ketik materi ..." dulu ditanam sebagai isi sungguhan saat editor
 * kosong, sehingga tulisan penulis bercampur dengannya dan ikut tersimpan.
 * Kini petunjuk hanya tampilan; editor kosong = string kosong.
 */

export const LEGACY_PLACEHOLDER_HTML =
  '<p>Mulai ketik materi edukasi fiqih, rujukan hadits, dan panduan syariah di sini...</p>';

const MEDIA_OR_STRUCTURE = /<(img|hr|table|iframe|li|blockquote)\b/i;
const TAGS = /<[^>]*>/g;
const NBSP = /&nbsp;| /g;

/** HTML tanpa teks dan tanpa gambar/tabel/daftar dianggap kosong ("<p><br></p>", "<div></div>"). */
export function isHtmlBlank(html: string): boolean {
  if (MEDIA_OR_STRUCTURE.test(html)) {
    return false;
  }
  return html.replace(TAGS, '').replace(NBSP, ' ').trim() === '';
}

/**
 * Isi yang akan disimpan: buang kalimat petunjuk lama yang tertanam di
 * artikel/draf terdahulu, dan ubah isi kosong menjadi ''.
 */
export function normalizeArticleHtml(html: string): string {
  const cleaned = html.split(LEGACY_PLACEHOLDER_HTML).join('');
  return isHtmlBlank(cleaned) ? '' : cleaned;
}

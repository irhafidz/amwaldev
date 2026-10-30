import { z } from 'zod';

/**
 * Video edukasi Amwal HANYA berupa sematan YouTube — tidak ada lagi unggah
 * berkas video (hemat penyimpanan dan bandwidth). Satu-satunya jalan masuk
 * adalah tautan YouTube, jadi pengurai ini adalah gerbang keamanan: URL dari
 * admin dibongkar menjadi ID 11 karakter dan sisanya dibuang, sehingga yang
 * pernah disimpan dan di-embed selalu `youtube.com/watch?v=<ID>` buatan kita
 * sendiri, bukan teks bebas.
 *
 * Host dicocokkan persis dengan daftar putih (bukan `includes`/regex pada
 * seluruh string), sehingga `youtube.com.evil.example`, `evil.example/?youtube.com`
 * atau `https://youtube.com@evil.example/...` tidak lolos.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HAS_SCHEME = /^https?:\/\//i;
const MAX_INPUT_LENGTH = 300;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Segmen pertama path yang membawa ID: /embed/ID, /shorts/ID, /live/ID, /v/ID. */
const ID_PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v']);

function idFromPath(url: URL): string | undefined {
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be') {
    return first;
  }
  if (first === 'watch') {
    return url.searchParams.get('v') ?? undefined;
  }
  return first && ID_PATH_PREFIXES.has(first) ? second : undefined;
}

/** ID video YouTube dari tautan apa pun yang lazim, atau `null` bila bukan YouTube. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > MAX_INPUT_LENGTH) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // WHATWG URL sudah memakai huruf kecil untuk hostname.
  const host = url.hostname;
  if (url.username || url.password) {
    return null;
  }
  if (host !== 'youtu.be' && !YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  const id = idFromPath(url);
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Bentuk baku yang disimpan di `education_videos.video_url`. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Alamat iframe. Domain `-nocookie` tidak memasang cookie pelacak sebelum diputar. */
export function youtubeEmbedUrl(
  id: string,
  options: { autoplay?: boolean } = {}
): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (options.autoplay) {
    params.set('autoplay', '1');
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Skema Zod untuk kolom "Tautan Video YouTube": menolak apa pun yang bukan
 * tautan YouTube dan mengubah yang valid menjadi URL tonton baku.
 */
export const youtubeLinkSchema = z
  .string()
  .trim()
  .min(1, 'Tautan video YouTube wajib diisi')
  .max(MAX_INPUT_LENGTH, 'Tautan terlalu panjang')
  .refine(
    (value) => parseYoutubeVideoId(value) !== null,
    'Tautan bukan video YouTube yang valid'
  )
  .transform((value) => youtubeWatchUrl(parseYoutubeVideoId(value) as string));

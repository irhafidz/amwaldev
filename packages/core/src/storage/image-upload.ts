/**
 * Aturan umum unggahan gambar ke volume media: tipe yang diizinkan, ekstensi
 * yang SELALU dipilih server dari tipe (tidak pernah dari nama berkas klien),
 * dan batas ukuran per bucket yang dapat ditulis lewat URL PUT bertanda tangan.
 */
export const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type ImageMimeType = keyof typeof IMAGE_EXTENSIONS;

export const IMAGE_MIME_TYPES = Object.keys(IMAGE_EXTENSIONS) as [
  ImageMimeType,
  ...ImageMimeType[],
];

const FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const PATH_SEPARATORS = /[/]/g;

/** Bucket yang boleh ditulis lewat PUT bertanda tangan, dengan batas ukurannya. */
export const UPLOAD_LIMIT_BYTES = {
  'user-avatars': 2 * 1024 * 1024,
  'qurban-photos': 5 * 1024 * 1024,
} as const;

export type UploadBucket = keyof typeof UPLOAD_LIMIT_BYTES;

export function isUploadBucket(value: string): value is UploadBucket {
  return Object.hasOwn(UPLOAD_LIMIT_BYTES, value);
}

/** Ekstensi nama berkas klien (huruf kecil), tanpa bagian direktori; untuk validasi saja. */
export function hasImageFileExtension(fileName: string): boolean {
  const base = fileName.replace(PATH_SEPARATORS, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 && FILE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}

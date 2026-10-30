/**
 * Menyimpan `Blob` sebagai berkas unduhan (QA-11: "Unduh PDF" tidak jalan).
 *
 * Dua penyebab klasik unduhan blob gagal, keduanya ditutup di sini:
 * 1. Anchor yang tidak dipasang di dokumen: Firefox mengabaikan `click()`.
 * 2. `URL.revokeObjectURL` langsung setelah `click()`: pengunduhan dimulai
 *    secara asinkron, sehingga URL yang sudah dicabut membuat unduhan batal
 *    (berkas 0 byte atau "Gagal – tidak ada berkas"). Pencabutan ditunda
 *    sampai unduhan pasti sudah dimulai.
 */

/** Cukup lama untuk browser lambat memulai unduhan, cukup singkat untuk membebaskan memori. */
export const REVOKE_DELAY_MS = 30_000;

export interface SaveBlobEnv {
  createObjectURL: (blob: Blob) => string;
  document: Pick<Document, 'body' | 'createElement'>;
  revokeObjectURL: (url: string) => void;
  setTimeout: (callback: () => void, ms: number) => unknown;
}

const browserEnv = (): SaveBlobEnv => ({
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  document,
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
});

export function saveBlobAs(
  blob: Blob,
  fileName: string,
  env: SaveBlobEnv = browserEnv()
): void {
  const url = env.createObjectURL(blob);
  const anchor = env.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  env.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    env.setTimeout(() => env.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

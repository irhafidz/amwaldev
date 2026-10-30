import {
  isAllowedReceiptMimeType,
  MAX_RECEIPT_FILE_SIZE_BYTES,
} from '@amwal/core/storage/mime';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;

/** "812 KB" / "3,4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_PER_MB) {
    return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB`;
  }
  return `${(bytes / BYTES_PER_MB).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Pemeriksaan berkas lampiran (kuitansi, bukti donasi) SEBELUM diunggah:
 * tipe dan batas 5 MB yang sama dengan server, supaya pengguna tidak
 * menunggu unggahan penuh hanya untuk ditolak.
 */
export function validateReceiptFile(
  file: Pick<File, 'size' | 'type'>
): { title: string; description: string } | null {
  if (!isAllowedReceiptMimeType(file.type)) {
    return {
      title: 'Format Berkas Tidak Didukung',
      description: 'Pilih foto JPG, PNG, WebP, atau berkas PDF.',
    };
  }
  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return {
      title: 'Berkas Terlalu Besar',
      description: `Ukuran berkas ${formatFileSize(file.size)} melebihi batas 5 MB. Perkecil atau kompres fotonya, lalu pilih lagi.`,
    };
  }
  return null;
}

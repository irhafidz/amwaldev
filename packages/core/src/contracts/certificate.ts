import { z } from 'zod';

/**
 * Certificate verification contract (Sprint 11, `I-5` — Zone 1).
 *
 * The only certificate surface that is **public**: anyone who scans a QR code
 * on a printed certificate may call it. The response is therefore minimised
 * by design — number, validity, module & program title, transaction date-time,
 * and the donor name (masked when anonymous). Nominal and internal ids never
 * leave the server.
 */
export const verifyCertificateSchema = z.object({
  nomor: z
    .string()
    .trim()
    .min(1, 'Nomor sertifikat wajib diisi')
    .max(64, 'Nomor sertifikat terlalu panjang'),
});

export const certificateVerificationSchema = z.object({
  nomor: z.string(),
  valid: z.boolean(),
  jenis: z.string().nullable(),
  programTitle: z.string().nullable(),
  namaDonatur: z.string().nullable(),
  tanggalTransaksi: z.string(),
  tanggalTransaksiLabel: z.string(),
});

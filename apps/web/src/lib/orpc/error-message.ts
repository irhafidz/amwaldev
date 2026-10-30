import { ORPCError } from '@orpc/client';

const FIELD_LABELS: Record<string, string> = {
  judul: 'Nama program',
  deskripsi: 'Deskripsi',
  kategori: 'Kategori',
  targetDana: 'Target dana',
  durasiHari: 'Durasi',
  bannerUrl: 'Banner',
  rabDocumentUrl: 'Dokumen RAB',
  dokumenLegalitasUrl: 'Dokumen legalitas',
  namaBank: 'Bank',
  nomorRekeningBank: 'Nomor rekening',
  atasNamaRekening: 'Atas nama rekening',
  hargaPerSlot: 'Harga per slot',
  totalSlot: 'Jumlah slot',
  estimasiBeratKg: 'Estimasi berat',
  targetPenerimaManfaat: 'Target penerima manfaat',
  tanggalPenyembelihanEstimasi: 'Tanggal penyembelihan',
  fotoUrl: 'Foto hewan',
  nominalDibayar: 'Nominal dibayar',
};

interface ValidationIssue {
  message?: string;
  path?: Array<string | number | { key: string | number }>;
}

function issueField(issue: ValidationIssue): string | undefined {
  const segment = issue.path?.at(0);
  const key = typeof segment === 'object' ? segment?.key : segment;
  return key === undefined ? undefined : String(key);
}

/**
 * Turns an oRPC failure into something an admin can act on. Input-validation
 * rejections (`BAD_REQUEST`) otherwise surface as the opaque "Input
 * validation failed"; UAT admin 2026-10-02 asked for the message to say
 * which field is missing or invalid.
 */
export function describeRpcError(error: unknown, fallback: string): string {
  if (error instanceof ORPCError) {
    const issues = (error.data as { issues?: ValidationIssue[] } | undefined)
      ?.issues;
    if (error.code === 'BAD_REQUEST' && issues?.length) {
      return issues
        .map((issue) => {
          const field = issueField(issue);
          const label = field ? (FIELD_LABELS[field] ?? field) : undefined;
          const message = issue.message || 'tidak valid';
          return label ? `${label}: ${message}` : message;
        })
        .join('; ');
    }
    if (error.code === 'UNAUTHORIZED') {
      return 'Sesi Anda berakhir. Silakan masuk kembali.';
    }
    if (error.message) {
      return error.message;
    }
  }
  return (error instanceof Error && error.message) || fallback;
}

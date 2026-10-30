import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import {
  certificates,
  infaqOrders,
  nadzirProfiles,
  qurbanOrders,
  transactions,
  waqfOrders,
  waqfPrograms,
  zakatOrders,
} from '../db/schema';
import type { Database } from '../db/types';
import {
  formatWibDateTime,
  maskDonorNameForPublic,
  toInstant,
} from './display';
import {
  type CertificateData,
  type CertificateInstitution,
  DEFAULT_INSTITUTION_NAME,
} from './generator';

export {
  ANONYMOUS_DONOR_LABEL,
  buildVerificationUrl,
  formatWibDate,
  formatWibDateTime,
  initialsOf,
  maskDonorName,
  maskDonorNameForPublic,
  toInstant,
} from './display';

/**
 * Ported from `apps/server/src/routes/certificate.ts` (Putaran 17, Batch 3)
 * — the DB-orchestration half, already fully DI-clean (`database` was
 * always a required parameter). Route/transport wiring (HTTP status codes,
 * PDF vs JSON response) stays in each app's own thin route file.
 */

type TransactionRow = typeof transactions.$inferSelect;
type WaqfOrderRow = typeof waqfOrders.$inferSelect;

export async function findTransactionContext(
  database: Database,
  identifier: string
): Promise<{
  transaction: TransactionRow;
  waqfOrder: WaqfOrderRow | undefined;
} | null> {
  let [transaction] = await database
    .select()
    .from(transactions)
    .where(eq(transactions.id, identifier));
  let waqfOrder: WaqfOrderRow | undefined;

  if (!transaction) {
    const [order] = await database
      .select()
      .from(waqfOrders)
      .where(eq(waqfOrders.id, identifier));
    if (order?.transactionId) {
      [transaction] = await database
        .select()
        .from(transactions)
        .where(eq(transactions.id, order.transactionId));
      waqfOrder = order;
    }
  }

  if (transaction && !waqfOrder) {
    const [order] = await database
      .select()
      .from(waqfOrders)
      .where(eq(waqfOrders.transactionId, transaction.id));
    waqfOrder = order;
  }

  return transaction ? { transaction, waqfOrder } : null;
}

export async function findOrCreateCertificate(
  database: Database,
  transaction: TransactionRow
): Promise<typeof certificates.$inferSelect> {
  let [certificate] = await database
    .select()
    .from(certificates)
    .where(eq(certificates.transactionId, transaction.id));

  if (certificate) {
    return certificate;
  }

  const year = new Date().getFullYear();
  const [countRow] = await database
    .select({ count: sql<number>`count(*)` })
    .from(certificates);
  const nomorInternalAmwal = `CERT-AMW-${year}-${String(
    Number(countRow?.count ?? 0) + 1
  ).padStart(4, '0')}`;

  [certificate] = await database
    .insert(certificates)
    .values({
      id: `CERT-${ulid()}`,
      transactionId: transaction.id,
      jenisSertifikat: transaction.jenisTransaksi || 'WAKAF',
      nomorInternalAmwal,
      nomorRegistrasiBwi: null,
      issuedAt: new Date().toISOString(),
    })
    .returning();

  return certificate;
}

export async function loadProgramContext(
  database: Database,
  waqfOrder: WaqfOrderRow | undefined
): Promise<{ programTitle: string; nadzirProfileId: string | null }> {
  if (!waqfOrder) {
    return { programTitle: '', nadzirProfileId: null };
  }

  const [program] = await database
    .select({
      judul: waqfPrograms.judul,
      nadzirProfileId: waqfPrograms.nadzirProfileId,
    })
    .from(waqfPrograms)
    .where(eq(waqfPrograms.id, waqfOrder.waqfProgramId));

  return {
    programTitle: program?.judul ?? '',
    nadzirProfileId: program?.nadzirProfileId ?? null,
  };
}

/** Read-only — never creates a row. Callers gate on this before issuing anything. */
export function isSettled(context: {
  transaction: TransactionRow;
  waqfOrder: WaqfOrderRow | undefined;
}): boolean {
  return (
    context.transaction.statusPembayaran === 'LUNAS' ||
    context.waqfOrder?.status === 'TERVERIFIKASI'
  );
}

interface CertificateDonor {
  name: string | null;
  isAnonymous: boolean;
  nomorKwitansi: string | null;
  shohibul?: string[];
}

const NO_DONOR: CertificateDonor = {
  name: null,
  isAnonymous: false,
  nomorKwitansi: null,
};

/**
 * Nama donatur dari pesanan modulnya sendiri. Dulu hanya `waqf_orders` yang
 * dibaca, sehingga sertifikat zakat/infaq/qurban selalu tercetak atas nama
 * "Wakif Dermawan" (QA-11).
 */
async function loadDonor(
  database: Database,
  transaction: TransactionRow,
  waqfOrder: WaqfOrderRow | undefined
): Promise<CertificateDonor> {
  if (waqfOrder) {
    return {
      name: waqfOrder.namaWakif,
      isAnonymous: waqfOrder.isAnonymous,
      nomorKwitansi: waqfOrder.nomorKwitansi,
    };
  }
  if (transaction.jenisTransaksi === 'ZAKAT') {
    const [order] = await database
      .select({
        name: zakatOrders.namaMuzakki,
        isAnonymous: zakatOrders.isAnonymous,
        nomorKwitansi: zakatOrders.nomorKwitansi,
      })
      .from(zakatOrders)
      .where(eq(zakatOrders.transactionId, transaction.id));
    return order ?? NO_DONOR;
  }
  if (transaction.jenisTransaksi === 'INFAQ') {
    const [order] = await database
      .select({ name: infaqOrders.namaPenginfaq })
      .from(infaqOrders)
      .where(eq(infaqOrders.transactionId, transaction.id));
    // Infaq anonim sudah disimpan sebagai "Hamba Allah" saat order dibuat.
    return order
      ? { name: order.name, isAnonymous: false, nomorKwitansi: null }
      : NO_DONOR;
  }
  if (transaction.jenisTransaksi === 'QURBAN') {
    const [order] = await database
      .select({
        name: qurbanOrders.namaPengqurban,
        namaShohibul: qurbanOrders.namaShohibul,
        namaShohibulList: qurbanOrders.namaShohibulList,
      })
      .from(qurbanOrders)
      .where(eq(qurbanOrders.transactionId, transaction.id));
    if (!order) {
      return NO_DONOR;
    }
    // Pesanan sebelum QA-13 hanya punya teks gabungan `nama_shohibul`.
    const shohibul =
      order.namaShohibulList ??
      (order.namaShohibul ? [order.namaShohibul] : []);
    return {
      name: order.name,
      isAnonymous: false,
      nomorKwitansi: null,
      shohibul,
    };
  }
  return NO_DONOR;
}

/**
 * Creates (idempotently) the certificate row and assembles its
 * `CertificateData`. Callers MUST check `isSettled()` on the transaction
 * context first — this function has no gate of its own and, like
 * `findOrCreateCertificate`, will happily mint a certificate row for a
 * transaction that isn't actually paid yet if called unconditionally.
 */
export async function assembleCertificateData(
  database: Database,
  transaction: TransactionRow,
  waqfOrder: WaqfOrderRow | undefined,
  /**
   * `PUBLIC_APP_URL` — basis QR. Required: `generateCertificatePdf()` refuses
   * to issue a PDF whose QR points away from `/verifikasi/$nomor`.
   */
  publicAppUrl?: string,
  /** Letterhead/signatory details for this deployment (all optional). */
  institution?: CertificateInstitution
): Promise<{
  certificate: typeof certificates.$inferSelect;
  certData: CertificateData;
}> {
  const certificate = await findOrCreateCertificate(database, transaction);
  const programContext = await loadProgramContext(database, waqfOrder);
  const donor = await loadDonor(database, transaction, waqfOrder);
  const [nadzir] = programContext.nadzirProfileId
    ? await database
        .select({ namaLembaga: nadzirProfiles.namaLembaga })
        .from(nadzirProfiles)
        .where(eq(nadzirProfiles.id, programContext.nadzirProfileId))
    : [];

  const certData: CertificateData = {
    certificateId: certificate.id,
    nomorInternalAmwal: certificate.nomorInternalAmwal,
    nomorRegistrasiBwi: certificate.nomorRegistrasiBwi,
    jenisTransaksi: transaction.jenisTransaksi || 'WAKAF',
    namaDonatur: donor.name || 'Hamba Allah',
    nominal: Number(transaction.amount),
    programTitle:
      programContext.programTitle ||
      `${transaction.jenisTransaksi} Terpadu Amwal`,
    tanggalTransaksi: transaction.createdAt,
    namaLembaga: nadzir?.namaLembaga || DEFAULT_INSTITUTION_NAME,
    ...institution,
    nomorKwitansi: donor.nomorKwitansi ?? undefined,
    isAnonymous: donor.isAnonymous,
    shohibulList: donor.shohibul,
    verifyBaseUrl: publicAppUrl,
  };

  return { certificate, certData };
}

/**
 * Public verification payload (`I-5`) — deliberately minimal: certificate
 * number, validity, module & program title, transaction date-time, and the
 * donor name (masked when the donation is anonymous). **The nominal is never
 * exposed**, which is the whole point of a public read that anyone holding a
 * certificate link can reach.
 */
export interface CertificateVerification {
  nomor: string;
  valid: boolean;
  jenis: string | null;
  programTitle: string | null;
  namaDonatur: string | null;
  /** ISO instant of the underlying transaction, for machine consumers. */
  tanggalTransaksi: string;
  /** `17 September 2026, 00:30:00 WIB` — formatted server-side, in WIB. */
  tanggalTransaksiLabel: string;
}

/**
 * Read-only lookup by certificate number. Returns `null` when the number is
 * unknown; a known number whose transaction is not settled comes back with
 * `valid: false` (the certificate row exists, the donation does not).
 */
export async function verifyCertificate(
  database: Database,
  nomor: string
): Promise<CertificateVerification | null> {
  const [row] = await database
    .select({
      nomor: certificates.nomorInternalAmwal,
      jenisSertifikat: certificates.jenisSertifikat,
      jenisTransaksi: transactions.jenisTransaksi,
      statusPembayaran: transactions.statusPembayaran,
      createdAt: transactions.createdAt,
      programTitle: waqfPrograms.judul,
      namaWakif: waqfOrders.namaWakif,
      isAnonymous: waqfOrders.isAnonymous,
      waqfOrderStatus: waqfOrders.status,
    })
    .from(certificates)
    .innerJoin(transactions, eq(transactions.id, certificates.transactionId))
    .leftJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
    .leftJoin(waqfPrograms, eq(waqfPrograms.id, waqfOrders.waqfProgramId))
    .where(eq(certificates.nomorInternalAmwal, nomor))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    nomor: row.nomor,
    valid:
      row.statusPembayaran === 'LUNAS' ||
      row.waqfOrderStatus === 'TERVERIFIKASI',
    jenis: row.jenisTransaksi ?? row.jenisSertifikat ?? null,
    programTitle: row.programTitle ?? null,
    namaDonatur: maskDonorNameForPublic(
      row.namaWakif,
      row.isAnonymous ?? false
    ),
    tanggalTransaksi: toInstant(row.createdAt).toISOString(),
    tanggalTransaksiLabel: formatWibDateTime(row.createdAt),
  };
}

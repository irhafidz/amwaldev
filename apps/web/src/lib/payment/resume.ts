import { withQrImage } from '@amwal/core/payment/mayar-instructions';
import {
  type ResumablePayment,
  resumablePayment,
} from '@amwal/core/payment/resume';
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { transactions } from '@/lib/db/schema';

/**
 * Instruksi bayar tersimpan untuk halaman status pesanan (QA-02, QA-03): bila
 * donatur membuka ulang tautan status di tab/perangkat lain, sessionStorage
 * checkout sudah tidak ada — instruksinya diambil dari `transactions`.
 *
 * Hanya dikirim selama transaksi PENDING dan belum kedaluwarsa. Isinya tujuan
 * pembayaran (QR / nomor VA / tautan e-wallet), bukan data pribadi donatur,
 * sehingga aman untuk tampilan publik pesanan (yang sudah memuat nominal dan
 * status); setelah lunas atau kedaluwarsa nilainya selalu `null`.
 */
export async function loadResumePayment(
  database: Database,
  transactionId: string | null | undefined
): Promise<ResumablePayment | null> {
  if (!transactionId) {
    return null;
  }
  const [row] = await database
    .select({
      statusPembayaran: transactions.statusPembayaran,
      paymentInstructions: transactions.paymentInstructions,
      paymentUrl: transactions.paymentUrl,
      paymentExpiresAt: transactions.paymentExpiresAt,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);
  if (!row) {
    return null;
  }
  const resume = resumablePayment(row, Date.now());
  return resume
    ? { ...resume, instructions: await withQrImage(resume.instructions) }
    : null;
}

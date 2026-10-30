import { AKAD_LABELS } from '@amwal/core/analytics/akad-category';
import { jsPDF } from 'jspdf';
import type {
  AdminLedgerRow,
  AdminRealizationRow,
} from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { formatWibDateTime } from '@/lib/format-wib';
import { paymentMethodLabel } from './admin-format';

const MARGIN_X = 15;
const TOP = 18;
const BOTTOM = 15;

/** A4 report: verified donations followed by the fund realization log. */
export function buildTransparencyPdf(
  ledger: readonly AdminLedgerRow[],
  realization: readonly AdminRealizationRow[]
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - MARGIN_X * 2;
  let y = TOP;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };
  const rule = () => {
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_X, y, pageWidth - MARGIN_X, y);
    y += 8;
  };
  const heading = (text: string) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(text, MARGIN_X, y);
    y += 6;
  };
  const entry = (
    title: string,
    right: string,
    lines: string[],
    note: string
  ) => {
    ensureSpace(8 + lines.length * 4.5 + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(title, MARGIN_X, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(right, pageWidth - MARGIN_X, y, { align: 'right' });
    y += 4.5;
    for (const line of lines) {
      doc.text(line, MARGIN_X, y, { maxWidth: textWidth });
      y += 4.5;
    }
    doc.setTextColor(148, 163, 184);
    doc.text(note, MARGIN_X, y, { maxWidth: textWidth });
    y += 6;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(27, 94, 32);
  doc.text('Laporan Transparansi & Log Realisasi Dana', MARGIN_X, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Amwal — dibuat pada ${new Date().toLocaleString('id-ID', {
      dateStyle: 'long',
      timeStyle: 'short',
    })}`,
    MARGIN_X,
    y
  );
  y += 8;
  rule();

  heading(`Transaksi Terverifikasi (${ledger.length})`);
  for (const tx of ledger) {
    entry(
      `${tx.id} — ${formatRupiah(tx.amount)}`,
      'LUNAS',
      [`${tx.donorName} · ${AKAD_LABELS[tx.akad]}`, tx.program],
      `${formatWibDateTime(tx.createdAt)} · ${paymentMethodLabel(tx.paymentMethod)}`
    );
  }

  y += 2;
  ensureSpace(10);
  rule();
  heading(`Log Realisasi Dana (${realization.length})`);
  for (const log of realization) {
    entry(
      `${log.id} — ${log.progress === null ? 'progres belum dilaporkan' : `${log.progress}% fisik`}`,
      log.verification,
      [
        log.programTitle,
        log.activity,
        `Pencairan: ${log.nominal === null ? '—' : formatRupiah(log.nominal)} · Diunggah: ${log.uploaderName ?? '—'}`,
      ],
      `Bukti: ${log.fileName} · ${formatWibDateTime(log.createdAt)}`
    );
  }

  return doc;
}

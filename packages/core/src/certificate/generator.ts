import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  ANONYMOUS_DONOR_LABEL,
  buildVerificationUrl,
  formatWibDate,
  formatWibDateTime,
  maskDonorName,
} from './display';
import { BODY_BOTTOM_MM, drawLetterhead } from './letterhead';

export {
  ANONYMOUS_DONOR_LABEL,
  buildVerificationUrl,
  formatWibDate,
  formatWibDateTime,
  initialsOf,
  maskDonorName,
  maskDonorNameForPublic,
} from './display';

/** Teks per jenis transaksi; jenis tak dikenal memakai bentuk wakaf. */
const JENIS_COPY: Record<
  string,
  {
    title: string;
    donorLabel: string;
    status: string;
    noticeTitle: string;
    notice: string;
  }
> = {
  WAKAF: {
    title: 'SERTIFIKAT WAKAF UANG DIGITAL',
    donorLabel: 'NAMA WAKIF / DONATUR:',
    status: 'TERVERIFIKASI SAH & AKAD IJAB QOBUL SELESAI',
    noticeTitle: 'NOMOR REGISTRASI BADAN WAKAF INDONESIA (BWI)',
    notice: '',
  },
  ZAKAT: {
    title: 'SERTIFIKAT ZAKAT DIGITAL',
    donorLabel: 'NAMA MUZAKKI:',
    status: 'TERVERIFIKASI SAH & ZAKAT DITERIMA AMIL',
    noticeTitle: 'PENYALURAN',
    notice: 'Disalurkan kepada 8 asnaf yang berhak melalui lembaga amil Amwal',
  },
  INFAQ: {
    title: 'SERTIFIKAT INFAQ & SEDEKAH DIGITAL',
    donorLabel: 'NAMA PENGINFAQ / DONATUR:',
    status: 'TERVERIFIKASI SAH & DANA DITERIMA',
    noticeTitle: 'PENYALURAN',
    notice: 'Disalurkan sesuai peruntukan infaq dan sedekah yang dipilih',
  },
  QURBAN: {
    title: 'SERTIFIKAT QURBAN DIGITAL',
    donorLabel: 'NAMA PENGQURBAN:',
    status: 'TERVERIFIKASI SAH & AKAD WAKALAH DITERIMA',
    noticeTitle: 'PENYEMBELIHAN & PENDISTRIBUSIAN',
    notice: 'Dokumentasi penyembelihan dikirim ke WhatsApp pemesan',
  },
};

const copyFor = (jenis: string) => JENIS_COPY[jenis] ?? JENIS_COPY.WAKAF;

/** Baris maksimum untuk daftar shohibul, dan tingginya per baris (mm). */
const MAX_SHOHIBUL_LINES = 3;
const SHOHIBUL_LINE_MM = 3.6;

/** Isi lama dirancang dari y=26; kop baru memajukan awal isi sejauh ini. */
const BODY_SHIFT_MM = 20;

export interface CertificateData {
  certificateId: string;
  nomorInternalAmwal: string;
  nomorRegistrasiBwi?: string | null;
  jenisTransaksi: 'WAKAF' | 'ZAKAT' | 'INFAQ' | 'QURBAN' | string;
  namaDonatur: string;
  nominal: number;
  programTitle: string;
  tanggalTransaksi: Date | string;
  namaLembaga?: string;
  /** Institution letterhead/signature details; each line is skipped when empty. */
  alamatLembaga?: string;
  kota?: string;
  namaPenandatangan?: string;
  jabatanPenandatangan?: string;
  nomorKwitansi?: string;
  isAnonymous?: boolean;
  /**
   * Qurban: nama shohibul bila berbeda dari pemesan (satu sapi utuh boleh
   * atas 1-7 nama, QA-13). Dicetak sebagai baris tersendiri, maks. 3 baris.
   */
  shohibulList?: string[];
  /**
   * Basis URL publik (`PUBLIC_APP_URL`) for the QR target
   * `<base>/verifikasi/<nomor>`. Required — see `buildVerificationUrl()`.
   */
  verifyBaseUrl?: string;
}

/** Letterhead details a deployment can set for its own institution. */
export type CertificateInstitution = Pick<
  CertificateData,
  'alamatLembaga' | 'kota' | 'namaPenandatangan' | 'jabatanPenandatangan'
>;

/** Printed when a program has no nadzir institution of its own. */
export const DEFAULT_INSTITUTION_NAME = 'Platform Amwal';

/**
 * Generates the official digital certificate PDF for Amwal. The institution
 * (name, address, city, signatory) comes from the data, never from this file,
 * so the template stays white-label.
 * Ported from the legacy `lib/certificate-generator.ts`.
 */
export async function generateCertificatePdf(
  data: CertificateData
): Promise<Uint8Array<ArrayBuffer>> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    // Logo PNG di kop membuat berkas ±2 MB tanpa kompresi.
    compress: true,
  });

  const width = 210;

  // Kop dan kaki resmi A4 menempati pinggir kertas; badan tetap putih polos.
  drawLetterhead(doc);

  // Isi dirancang pada koordinat lama (mulai y=26); badan baru dimulai di
  // bawah kop, jadi seluruh isi digeser turun dengan satu matriks transformasi.
  doc.saveGraphicsState();
  doc.setCurrentTransformationMatrix(
    doc.Matrix(1, 0, 0, 1, 0, -BODY_SHIFT_MM * doc.internal.scaleFactor)
  );

  doc.setTextColor(27, 94, 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const institutionName = data.namaLembaga || DEFAULT_INSTITUTION_NAME;
  doc.text(institutionName.toUpperCase(), width / 2, 26, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text(
    'PENGELOLAAN DANA SOSIAL SYARIAH MELALUI PLATFORM AMWAL',
    width / 2,
    31,
    { align: 'center' }
  );
  if (data.alamatLembaga) {
    doc.text(data.alamatLembaga, width / 2, 35, { align: 'center' });
  }

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.4);
  doc.line(22, 39, width - 22, 39);

  doc.setTextColor(27, 94, 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const copy = copyFor(data.jenisTransaksi);
  doc.text(copy.title, width / 2, 50, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 83, 9);
  doc.text(`Nomor: ${data.nomorInternalAmwal}`, width / 2, 56, {
    align: 'center',
  });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(55, 65, 81);
  doc.text(
    "Dengan memohon rahmat dan ridho Allah Subhanahu wa Ta'ala, sertifikat ini diberikan sebagai bukti atas penerimaan dan pengikatan komitmen:",
    width / 2,
    66,
    { align: 'center', maxWidth: 160 }
  );

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.roundedRect(22, 74, width - 44, 48, 3, 3, 'FD');

  const displayName =
    maskDonorName(data.namaDonatur, Boolean(data.isAnonymous)) ??
    ANONYMOUS_DONOR_LABEL;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(copy.donorLabel, width / 2, 83, { align: 'center' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(displayName, width / 2, 91, { align: 'center' });

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(30, 97, width - 60, 18, 2, 2, 'FD');

  const formattedNominal = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(data.nominal);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text('JUMLAH NOMINAL DITERIMA:', width / 2, 103, { align: 'center' });

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 94, 32);
  doc.text(formattedNominal, width / 2, 110, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);

  const startY = 130;
  const col1 = 26;
  const col2 = 68;

  doc.setFont('helvetica', 'bold');
  doc.text('Program Penyaluran', col1, startY);
  doc.text(':', col2 - 3, startY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.programTitle, col2, startY, { maxWidth: 115 });

  const row2Y = startY + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Nazhir Pengelola', col1, row2Y);
  doc.text(':', col2 - 3, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(institutionName, col2, row2Y);

  const row3Y = row2Y + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Tanggal Transaksi', col1, row3Y);
  doc.text(':', col2 - 3, row3Y);
  doc.setFont('helvetica', 'normal');
  // `DD MMMM YYYY, HH:mm:ss WIB`, always in Asia/Jakarta — the transaction
  // row carries the clock (D4), unlike the signature block below.
  const formattedDateTime = formatWibDateTime(data.tanggalTransaksi);
  doc.text(formattedDateTime, col2, row3Y);

  const row4Y = row3Y + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Status Fiqih / Akad', col1, row4Y);
  doc.text(':', col2 - 3, row4Y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text(copy.status, col2, row4Y);

  // Baris shohibul qurban (QA-13): hanya bila ada nama yang berbeda dari
  // pemesan. Teks dibungkus maks. 3 baris; kotak di bawahnya turun secukupnya.
  const shohibul = (data.shohibulList ?? []).filter(Boolean);
  const showShohibul =
    shohibul.length > 1 ||
    (shohibul.length === 1 && shohibul[0] !== data.namaDonatur);
  let shift = 0;
  if (showShohibul) {
    const row5Y = row4Y + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text('Atas Nama', col1, row5Y);
    doc.text(':', col2 - 3, row5Y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = (
      doc.splitTextToSize(shohibul.join(', '), 118) as string[]
    ).slice(0, MAX_SHOHIBUL_LINES);
    doc.text(lines, col2, row5Y, { lineHeightFactor: 1.2 });
    shift = Math.max(
      0,
      row5Y + SHOHIBUL_LINE_MM * (lines.length - 1) + 4 - 168
    );
  }

  const bwiBoxY = 168 + shift;
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.7);
  doc.roundedRect(22, bwiBoxY, width - 44, 22, 2.5, 2.5, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(146, 64, 14);
  doc.text(copy.noticeTitle, width / 2, bwiBoxY + 7, { align: 'center' });

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  // Registrasi BWI hanya relevan untuk wakaf; jenis lain menampilkan
  // keterangan penyaluran dalam kotak yang sama.
  const bwiText =
    copy.notice ||
    (data.nomorRegistrasiBwi && data.nomorRegistrasiBwi.trim() !== ''
      ? data.nomorRegistrasiBwi.toUpperCase()
      : 'Menunggu Proses Registrasi BWI');
  doc.setTextColor(180, 83, 9);
  doc.text(bwiText, width / 2, bwiBoxY + 15, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(75, 85, 99);
  doc.text(
    "“Semoga Allah Subhanahu wa Ta'ala menerima amal jariyah ini, melipatgandakan pahala kebaikan yang abadi, serta menjadikan manfaatnya mengalir tiada henti bagi kemaslahatan umat.”",
    width / 2,
    198 + shift,
    { align: 'center', maxWidth: 160 }
  );

  // QR menunjuk ke rute publik `/verifikasi/$nomor` milik aplikasi ini,
  // bukan alamat lama yang tidak punya rute (D4).
  const verifyUrl = buildVerificationUrl(
    data.nomorInternalAmwal,
    data.verifyBaseUrl ?? ''
  );
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 200,
    color: { dark: '#1B5E20', light: '#FFFFFF' },
  });

  doc.addImage(qrDataUrl, 'PNG', 26, 212, 28, 28);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text('Pindai untuk verifikasi', 40, 243, { align: 'center' });
  doc.text('keabsahan sertifikat', 40, 246, { align: 'center' });

  const sigX = 135;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  const place = data.kota ? `${data.kota}, ` : '';
  doc.text(`${place}${formatWibDate(data.tanggalTransaksi)}`, sigX, 215, {
    align: 'center',
  });
  doc.text(`Pengurus ${institutionName}`, sigX, 219, { align: 'center' });

  doc.setDrawColor(27, 94, 32);
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(sigX - 30, 223, 60, 14, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 94, 32);
  doc.text('TERTANDATANGANI SECARA ELEKTRONIK', sigX, 229, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('AMWAL SYSTEM v2.8', sigX, 234, { align: 'center' });

  if (data.namaPenandatangan) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(data.namaPenandatangan, sigX, 244, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(data.jabatanPenandatangan || 'Pengurus', sigX, 248, {
      align: 'center',
    });
  }

  doc.restoreGraphicsState();

  // Pernyataan dasar hukum di dasar badan, di atas kaki (tidak ikut digeser).
  doc.setFontSize(6.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 128, 140);
  doc.text(
    'Sertifikat ini diterbitkan secara otomatis oleh Platform AMWAL dan diakui secara sah sesuai Undang-Undang No. 41 Tahun 2004 tentang Wakaf.',
    width / 2,
    BODY_BOTTOM_MM + 0.5,
    { align: 'center' }
  );

  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}

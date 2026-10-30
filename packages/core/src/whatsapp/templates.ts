/**
 * Reusable WhatsApp notification templates for Waqf, Zakat, and Qurban.
 * Pure functions — no side effects, no imports beyond standard formatting.
 * Ported verbatim from `apps/server/src/lib/whatsapp/templates.ts` (Putaran
 * 17, Batch 6). Originally ported from the legacy
 * `lib/notification-templates.ts`.
 */

export function waqfThankYouMessage(params: {
  namaOrIsAnonymous: string;
  judulProgram: string;
  nominal: number;
  certificateUrl: string;
  orderId?: string;
}): string {
  const formattedNominal = params.nominal.toLocaleString('id-ID');
  const orderIdText = params.orderId
    ? `\nNo. Transaksi: ${params.orderId}`
    : '';
  return `Assalamu'alaikum ${params.namaOrIsAnonymous},\n\nJazakumullahu khairan atas wakaf Anda untuk program "${params.judulProgram}" sebesar Rp${formattedNominal}.${orderIdText}\n\nSertifikat wakaf digital Anda: ${params.certificateUrl}\n\n- Amwal · Platform Islamic Social Finance`;
}

export function zakatThankYouMessage(params: {
  namaOrIsAnonymous: string;
  jenisZakat: string;
  nominal: number;
  certificateUrl: string;
  orderId?: string;
}): string {
  const formattedNominal = params.nominal.toLocaleString('id-ID');
  const orderIdText = params.orderId
    ? `\nNo. Transaksi: ${params.orderId}`
    : '';
  return `Assalamu'alaikum ${params.namaOrIsAnonymous},\n\nAlhamdulillah, pembayaran zakat ${params.jenisZakat} Anda sebesar Rp${formattedNominal} telah berhasil diverifikasi dan masuk ke kas asnaf mustahiq.${orderIdText}\n\nSertifikat & bukti setor zakat Anda: ${params.certificateUrl}\n\nSemoga Allah mensucikan harta dan memberkahi rezeki Anda sekeluarga.\n\n- Amwal · Platform Islamic Social Finance`;
}

export function infaqThankYouMessage(params: {
  namaOrIsAnonymous: string;
  jenis: string;
  nominal: number;
  orderId?: string;
  receiptUrl?: string;
}): string {
  const formattedNominal = params.nominal.toLocaleString('id-ID');
  const orderIdText = params.orderId
    ? `\nNo. Transaksi: ${params.orderId}`
    : '';
  const receiptText = params.receiptUrl
    ? `\n\nKuitansi & bukti donasi Anda: ${params.receiptUrl}`
    : '';
  return `Assalamu'alaikum ${params.namaOrIsAnonymous},\n\nJazakumullahu khairan, donasi ${params.jenis} Anda sebesar Rp${formattedNominal} telah kami terima dengan baik.${orderIdText}${receiptText}\n\nSemoga Allah melipatgandakan pahala dan memberkahi rezeki Anda sekeluarga.\n\n- Amwal · Platform Islamic Social Finance`;
}

export function qurbanThankYouMessage(params: {
  namaOrIsAnonymous: string;
  jenisHewan: string;
  tipeKepemilikan: string;
  statusPembayaran: string;
  nominal: number;
  sisaTagihan?: number;
  certificateUrl?: string;
  orderId?: string;
}): string {
  const formattedNominal = params.nominal.toLocaleString('id-ID');
  const isLunas = params.statusPembayaran === 'LUNAS';
  const orderIdText = params.orderId
    ? `\nNo. Transaksi: ${params.orderId}`
    : '';

  if (isLunas) {
    const certText = params.certificateUrl
      ? `\n\nSertifikat shohibul qurban digital Anda: ${params.certificateUrl}`
      : '';
    return `Assalamu'alaikum ${params.namaOrIsAnonymous},\n\nAlhamdulillah, pembayaran qurban ${params.jenisHewan} (${params.tipeKepemilikan}) Anda sebesar Rp${formattedNominal} telah LUNAS.${orderIdText}\n\nAkad wakalah qurban Anda telah sah tercatat.${certText}\n\nSemoga menjadi amal ibadah yang diterima di sisi Allah SWT.\n\n- Amwal · Platform Islamic Social Finance`;
  }

  const sisa = (params.sisaTagihan || 0).toLocaleString('id-ID');
  return `Assalamu'alaikum ${params.namaOrIsAnonymous},\n\nTerima kasih, pembayaran uang muka (DP) qurban ${params.jenisHewan} (${params.tipeKepemilikan}) Anda sebesar Rp${formattedNominal} telah kami terima.${orderIdText}\n\nSisa tagihan qurban Anda: Rp${sisa}.\nMohon lakukan pelunasan sebelum batas waktu penyembelihan.\n\n- Amwal · Platform Islamic Social Finance`;
}

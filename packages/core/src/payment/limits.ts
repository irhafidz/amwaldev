/**
 * Nominal donasi paling kecil yang diterima Amwal (rupiah).
 *
 * Rp 1.000 adalah batas teknis transaksi QRIS/Mayar; di bawah itu pembayaran
 * tidak bisa dibuat. Satu konstanta ini dipakai UI (validasi + teks bantuan)
 * dan kontrak server, supaya batas yang dijanjikan form sama dengan yang
 * ditegakkan server — sebelumnya wakaf hanya dicek di browser, dan infaq di
 * server memakai angka berbeda.
 */
export const MIN_DONATION_RUPIAH = 1000;

export const MIN_DONATION_LABEL = 'Rp 1.000';

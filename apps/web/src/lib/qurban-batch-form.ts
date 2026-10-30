/**
 * Pemeriksaan form Tambah/Edit Hewan Qurban di sisi klien (UAT #4, Nurul:
 * "program qurban kambing belum bisa dibuat karena terhalang isian"). Pesan
 * galat dari server untuk isian angka terlalu umum ("Input validation
 * failed"), jadi isian yang tak lolos kontrak (`batchSchema`) dicegat di sini
 * dengan kalimat yang menyebut kolomnya.
 */

interface BatchNumbers {
  estimasiBeratKg: string;
  hargaPerSlot: string;
  targetPenerimaManfaat: string;
}

/** Pesan galat pertama, atau `null` bila isiannya lolos. */
export function validateBatchForm(form: BatchNumbers): string | null {
  if (!(Number(form.hargaPerSlot) > 0)) {
    return 'Harga per slot wajib diisi (lebih dari Rp 0).';
  }
  const berat = form.estimasiBeratKg.trim();
  if (berat !== '' && !(Number(berat) > 0)) {
    return 'Estimasi berat harus lebih dari 0 kg. Kosongkan bila belum diketahui.';
  }
  const target = form.targetPenerimaManfaat.trim();
  if (
    target !== '' &&
    !(Number.isInteger(Number(target)) && Number(target) > 0)
  ) {
    return 'Target penerima manfaat harus bilangan bulat lebih dari 0. Kosongkan bila belum ditentukan.';
  }
  return null;
}

/** Kambing/domba selalu 1 ekor = 1 slot, apa pun isi kolom slot yang tersisa. */
export function slotCountFor(form: {
  jenisHewan: 'SAPI' | 'KAMBING';
  totalSlot: string;
}): number {
  return form.jenisHewan === 'KAMBING' ? 1 : Number(form.totalSlot);
}

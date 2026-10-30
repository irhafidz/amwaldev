/**
 * Akad category of a verified transaction. One definition shared by the
 * transparency ledger, RFM-D diversity and retention cohorts so the filters in
 * the three admin screens always agree.
 *
 * Sedekah is told apart from Infaq by the infaq order's `jenis`
 * (`SEDEKAH_*` vs `INFAQ_*`), exactly like `admin.analytics.composition`.
 */
export const AKAD_CATEGORIES = [
  'WAKAF',
  'ZAKAT',
  'INFAQ',
  'SEDEKAH',
  'QURBAN',
] as const;

export type AkadCategory = (typeof AKAD_CATEGORIES)[number];

export const AKAD_LABELS: Record<AkadCategory, string> = {
  WAKAF: 'Wakaf',
  ZAKAT: 'Zakat',
  INFAQ: 'Infaq',
  SEDEKAH: 'Sedekah',
  QURBAN: 'Qurban',
};

export function akadCategory(
  jenisTransaksi: string,
  jenisInfaq?: string | null
): AkadCategory {
  if (jenisInfaq?.startsWith('SEDEKAH_')) {
    return 'SEDEKAH';
  }
  switch (jenisTransaksi) {
    case 'WAKAF':
      return 'WAKAF';
    case 'ZAKAT':
      return 'ZAKAT';
    case 'QURBAN':
      return 'QURBAN';
    default:
      return 'INFAQ';
  }
}

import type { InfaqJenis } from '@/lib/amwal-api/types';

/**
 * One card per real `INFAQ_JENIS` value (`@amwal/core/contracts/infaq`) — the
 * DB CHECK constraint only accepts these five, so every card books into the
 * category it names instead of a look-alike fund.
 */
export const INFAQ_PROGRAMS: {
  id: InfaqJenis;
  title: string;
  description: string;
}[] = [
  {
    id: 'INFAQ_SUBUH',
    title: 'Infaq Subuh',
    description: 'Sedekah rutin di waktu subuh untuk kebaikan umat.',
  },
  {
    id: 'INFAQ_JUMAT',
    title: 'Infaq Jumat',
    description: 'Sedekah pekanan di hari Jumat yang penuh berkah.',
  },
  {
    id: 'INFAQ_UMUM',
    title: 'Infaq Umum',
    description:
      'Disalurkan amil pada program prioritas yayasan sesuai ketentuan syariah.',
  },
  {
    id: 'SEDEKAH_YATIM',
    title: 'Sedekah Yatim',
    description: 'Dukungan untuk anak yatim dan kebutuhan pendidikannya.',
  },
  {
    id: 'SEDEKAH_OPERASIONAL',
    title: 'Sedekah Operasional',
    description: 'Membantu operasional lembaga agar program tetap berjalan.',
  },
];

export function infaqLabel(jenis: string): string {
  return INFAQ_PROGRAMS.find((p) => p.id === jenis)?.title ?? jenis;
}

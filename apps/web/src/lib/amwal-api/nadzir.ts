import { orpc } from '@/lib/orpc/client';

export interface NadzirProgramRow {
  id: string;
  judul: string;
  kategori: string | null;
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';
  status: string;
  targetDana: string;
  bannerUrl: string | null;
  createdAt: string;
  namaLembaga: string | null;
  pokokDanaTerkumpul: string | null;
  totalHasilAvailable: string | null;
  hasilInvestasiTersalurkan: string | null;
}

/** LIVE waqf programs visible to the session (own lembaga for NADZIR, all for ADMIN). */
export function getNadzirPrograms(): Promise<NadzirProgramRow[]> {
  return orpc.nadzir.programs().then((r) => r.data);
}

import { DEFAULT_AKAD_WAKALAH_QURBAN } from '@amwal/core/contracts/admin-qurban';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from './index';
import { hewanBatches, qurbanAnimalSlots, qurbanOrders } from './schema';

/**
 * Data demo modul Qurban admin — isi yang sebelumnya di-hardcode di
 * `qurban-module-view.tsx` (katalog, kelompok patungan, shohibul), kini
 * disimpan sebagai baris nyata. Semua ID berawalan `DEMO-` agar mudah
 * dibersihkan:
 *
 *   bun run db:seed:qurban-demo           # isi (idempoten, dilewati bila ada)
 *   bun run db:seed:qurban-demo --reset   # hapus data demo lalu isi ulang
 *   bun run db:seed:qurban-demo --remove  # hapus data demo saja
 *
 * Nomor WhatsApp sengaja dikosongkan: data demo tidak boleh memicu laporan
 * WhatsApp ke nomor sungguhan.
 */

const PREFIX = 'DEMO-';

const SAPI_FOTO =
  'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=800&auto=format&fit=crop&q=80';
const KAMBING_FOTO =
  'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=800&auto=format&fit=crop&q=80';
const SAPI_UTUH_FOTO =
  'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=800&auto=format&fit=crop&q=80';

interface DemoShohibul {
  pemesan: string;
  shohibul: string;
  opsiPesan?: 'PASRAH' | 'AMBIL_SENDIRI';
  metode?: 'TUNAI' | 'TRANSFER';
  acceptedAt: string;
}

interface DemoBatch {
  id: string;
  jenisHewan: 'SAPI' | 'KAMBING';
  totalSlot: number;
  hargaPerSlot: number;
  namaBatch: string;
  ras: string;
  kelasGrade?: string;
  estimasiBeratKg: number;
  wilayahPenyaluran: string;
  targetPenerimaManfaat: number;
  lokasiRph?: string;
  timJuleha?: string;
  foto: string;
  shohibul: DemoShohibul[];
}

const BATCHES: DemoBatch[] = [
  {
    id: `${PREFIX}HWB-SAPI01`,
    jenisHewan: 'SAPI',
    totalSlot: 7,
    hargaPerSlot: 2_950_000,
    namaBatch: 'Sapi 01 (PO Sukabumi)',
    ras: 'Peranakan Ongole (PO)',
    estimasiBeratKg: 240,
    wilayahPenyaluran: 'Pelosok Sukabumi & Cianjur Selatan',
    targetPenerimaManfaat: 350,
    lokasiRph: 'RPH Cisaat, Kab. Sukabumi',
    timJuleha: 'Ust. Ridwan & Tim Juleha DPD Sukabumi',
    foto: SAPI_FOTO,
    shohibul: [
      {
        pemesan: 'H. Danang Wijaya',
        shohibul: 'H. Danang Wijaya bin Wijaya',
        acceptedAt: '2026-08-22T02:14:22.000Z',
      },
      {
        pemesan: 'H. Danang Wijaya',
        shohibul: 'Hj. Siti Rahmawati binti Abdullah',
        acceptedAt: '2026-08-22T02:16:10.000Z',
      },
      {
        pemesan: 'H. Danang Wijaya',
        shohibul: 'Farhan Fauzi bin Danang',
        acceptedAt: '2026-08-22T02:17:45.000Z',
      },
      {
        pemesan: 'H. Danang Wijaya',
        shohibul: 'Anisa Fauzia binti Danang',
        acceptedAt: '2026-08-22T02:18:30.000Z',
      },
      {
        pemesan: 'dr. Irwan Setiawan',
        shohibul: 'dr. Irwan Setiawan bin Suparman',
        opsiPesan: 'AMBIL_SENDIRI',
        metode: 'TRANSFER',
        acceptedAt: '2026-08-21T07:20:10.000Z',
      },
      {
        pemesan: 'Keluarga Bpk. H. Mulyadi',
        shohibul: 'H. Mulyadi Pratama bin Pratama',
        acceptedAt: '2026-08-20T09:05:44.000Z',
      },
      {
        pemesan: 'Bpk. Subroto',
        shohibul: 'Keluarga Besar Bpk. Subroto',
        metode: 'TRANSFER',
        acceptedAt: '2026-08-19T04:40:00.000Z',
      },
    ],
  },
  {
    id: `${PREFIX}HWB-SAPI02`,
    jenisHewan: 'SAPI',
    totalSlot: 7,
    hargaPerSlot: 2_950_000,
    namaBatch: 'Sapi 02 (Limousin NTT)',
    ras: 'Limousin',
    estimasiBeratKg: 260,
    wilayahPenyaluran: 'Kawasan 3T Nusa Tenggara Timur & Banten',
    targetPenerimaManfaat: 380,
    lokasiRph: 'RPH Sentra Qurban Kupang, NTT',
    timJuleha: 'Ust. Haris & Juleha MUI NTT',
    foto: SAPI_FOTO,
    shohibul: [
      {
        pemesan: 'Bpk. H. Hendro',
        shohibul: 'Bpk. H. Hendro bin Suwarno',
        acceptedAt: '2026-08-18T03:00:00.000Z',
      },
      {
        pemesan: 'Bpk. H. Hendro',
        shohibul: 'Ibu Nuraeni binti Kasim',
        acceptedAt: '2026-08-18T03:02:00.000Z',
      },
      {
        pemesan: 'Bpk. H. Hendro',
        shohibul: 'Ahmad Syauqi bin Hendro',
        acceptedAt: '2026-08-18T03:04:00.000Z',
      },
      {
        pemesan: 'Bpk. H. Hendro',
        shohibul: 'Zaskia Adya binti Hendro',
        acceptedAt: '2026-08-18T03:06:00.000Z',
      },
      {
        pemesan: 'Hamba Allah',
        shohibul: 'Hamba Allah (Alm. H. Basri)',
        metode: 'TRANSFER',
        acceptedAt: '2026-08-17T11:30:00.000Z',
      },
    ],
  },
  {
    id: `${PREFIX}HWB-SAPI03`,
    jenisHewan: 'SAPI',
    totalSlot: 7,
    hargaPerSlot: 2_950_000,
    namaBatch: 'Sapi 03 (PO Cianjur)',
    ras: 'Peranakan Ongole (PO)',
    estimasiBeratKg: 230,
    wilayahPenyaluran: 'Pelosok Cianjur Selatan',
    targetPenerimaManfaat: 320,
    lokasiRph: 'RPH Terpadu Warungkondang, Cianjur',
    timJuleha: 'Ust. Asep Saepudin & Tim Halal',
    foto: SAPI_FOTO,
    shohibul: [
      {
        pemesan: 'Bpk. Denny Hermawan',
        shohibul: 'Bpk. Denny Hermawan bin Hermawan',
        acceptedAt: '2026-08-16T08:10:00.000Z',
      },
      {
        pemesan: 'Ibu Lilis Suryani',
        shohibul: 'Ibu Lilis Suryani binti Hasan',
        acceptedAt: '2026-08-16T09:25:00.000Z',
      },
    ],
  },
  {
    id: `${PREFIX}HWB-KMB01`,
    jenisHewan: 'KAMBING',
    totalSlot: 1,
    hargaPerSlot: 2_450_000,
    namaBatch: 'Kambing 01 (Jawa Randu)',
    ras: 'Kambing Jawa Randu',
    kelasGrade: 'Grade B',
    estimasiBeratKg: 25,
    wilayahPenyaluran: 'Pelosok Sukabumi & Cianjur Selatan',
    targetPenerimaManfaat: 40,
    lokasiRph: 'RPH Cisaat, Kab. Sukabumi',
    timJuleha: 'Ust. Ridwan & Tim Juleha DPD Sukabumi',
    foto: KAMBING_FOTO,
    shohibul: [
      {
        pemesan: 'Keluarga Bpk. H. Mulyadi',
        shohibul: 'Mulyadi Pratama bin Pratama',
        acceptedAt: '2026-08-20T09:05:44.000Z',
      },
    ],
  },
  {
    id: `${PREFIX}HWB-KMB02`,
    jenisHewan: 'KAMBING',
    totalSlot: 1,
    hargaPerSlot: 2_450_000,
    namaBatch: 'Kambing 02 (Jawa Randu)',
    ras: 'Kambing Jawa Randu',
    kelasGrade: 'Grade B',
    estimasiBeratKg: 26,
    wilayahPenyaluran: 'Pelosok Sukabumi & Cianjur Selatan',
    targetPenerimaManfaat: 40,
    foto: KAMBING_FOTO,
    shohibul: [],
  },
  {
    id: `${PREFIX}HWB-SAPIUTUH01`,
    jenisHewan: 'SAPI',
    totalSlot: 1,
    hargaPerSlot: 24_500_000,
    namaBatch: 'Sapi Utuh Simental Super',
    ras: 'Simental',
    kelasGrade: 'Super',
    estimasiBeratKg: 380,
    wilayahPenyaluran: 'Kornet / Rendang Kaleng Bencana Nasional',
    targetPenerimaManfaat: 500,
    foto: SAPI_UTUH_FOTO,
    shohibul: [],
  },
];

function report(line: string) {
  process.stdout.write(`${line}\n`);
}

async function removeDemo() {
  const batchIds = BATCHES.map((b) => b.id);
  await db.transaction(async (tx) => {
    await tx
      .delete(qurbanAnimalSlots)
      .where(inArray(qurbanAnimalSlots.hewanBatchId, batchIds));
    await tx.delete(qurbanOrders).where(like(qurbanOrders.id, `${PREFIX}%`));
    await tx.delete(hewanBatches).where(inArray(hewanBatches.id, batchIds));
  });
  report('✓ data demo qurban dihapus');
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Inserts one animal, its shohibul orders, and its slots; returns the last order number. */
async function insertDemoBatch(
  tx: Transaction,
  batch: DemoBatch,
  startSeq: number
): Promise<number> {
  await tx.insert(hewanBatches).values({
    id: batch.id,
    jenisHewan: batch.jenisHewan,
    totalSlot: batch.totalSlot,
    hargaPerSlot: String(batch.hargaPerSlot),
    status: batch.shohibul.length >= batch.totalSlot ? 'PENUH' : 'TERSEDIA',
    ras: batch.ras,
    kelasGrade: batch.kelasGrade ?? null,
    estimasiBeratKg: String(batch.estimasiBeratKg),
    wilayahPenyaluran: batch.wilayahPenyaluran,
    targetPenerimaManfaat: batch.targetPenerimaManfaat,
    tanggalPenyembelihanEstimasi: '2027-05-17',
    galeriFotoUrls: [batch.foto],
    namaBatch: batch.namaBatch,
    lokasiRph: batch.lokasiRph ?? null,
    timJuleha: batch.timJuleha ?? null,
  });

  const orders = batch.shohibul.map((person, index) => ({
    id: `${PREFIX}QRB-${String(startSeq + index + 1).padStart(3, '0')}`,
    namaPengqurban: person.pemesan,
    namaShohibul: person.shohibul,
    teleponPengqurban: null,
    jenisHewan: batch.jenisHewan,
    tipeKepemilikan:
      batch.totalSlot > 1 ? ('KOLEKTIF' as const) : ('INDIVIDU' as const),
    opsiPesan: person.opsiPesan ?? ('PASRAH' as const),
    metodePembayaran: person.metode ?? ('TUNAI' as const),
    statusPembayaran: 'LUNAS' as const,
    totalHarga: String(batch.hargaPerSlot),
    nominalDibayar: String(batch.hargaPerSlot),
    sisaTagihan: '0',
    akadWakalahText: DEFAULT_AKAD_WAKALAH_QURBAN,
    akadWakalahAcceptedAt: person.acceptedAt,
    createdAt: person.acceptedAt,
  }));
  if (orders.length > 0) {
    await tx.insert(qurbanOrders).values(orders);
  }

  await tx.insert(qurbanAnimalSlots).values(
    Array.from({ length: batch.totalSlot }, (_, index) => ({
      id: `${batch.id}-SLT-${index + 1}`,
      hewanBatchId: batch.id,
      nomorSlot: index + 1,
      qurbanOrderId: orders[index]?.id ?? null,
      status: orders[index] ? ('TERISI' as const) : ('TERSEDIA' as const),
    }))
  );
  report(
    `✓ ${batch.namaBatch.padEnd(28)} ${orders.length}/${batch.totalSlot} slot terisi`
  );
  return startSeq + orders.length;
}

async function seedDemo() {
  const [existing] = await db
    .select({ id: hewanBatches.id })
    .from(hewanBatches)
    .where(eq(hewanBatches.id, BATCHES[0]?.id ?? ''))
    .limit(1);
  if (existing) {
    report('✓ data demo qurban sudah ada — dilewati (pakai --reset)');
    return;
  }

  let orderSeq = 0;
  await db.transaction(async (tx) => {
    for (const batch of BATCHES) {
      orderSeq = await insertDemoBatch(tx, batch, orderSeq);
    }
  });
  report(`✓ ${orderSeq} pesanan shohibul demo dibuat`);
}

const args = new Set(process.argv.slice(2));
if (args.has('--remove') || args.has('--reset')) {
  await removeDemo();
}
if (!args.has('--remove')) {
  await seedDemo();
}
process.exit(0);

import {
  createMustahiqSchema,
  distributionSchema,
  fitrahConfigSchema,
  goldPriceSchema,
  recordZakatSchema,
  updateZakatOrderSchema,
} from '@amwal/core/contracts/admin-zakat';
import { encryptSecret } from '@amwal/core/crypto';
import { fetchLiveGoldPricePerGram } from '@amwal/core/zakat/gold-price';
import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { env } from '@/env/server';
import type { Database } from '@/lib/db';
import {
  mustahiqProfiles,
  zakatDistributions,
  zakatFitrahConfig,
  zakatGoldPriceHistory,
  zakatOrders,
} from '@/lib/db/schema';
import { createdAtWithin, yearField } from '../../period-filter';
import { adminProcedure } from '../../procedures';
import { assertJenisActive } from './master-data';

/**
 * oRPC admin.zakat router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/zakat.ts`. `mustahiqList` deliberately never
 * selects `mustahiqProfiles.nik` (SECURITY.md §6) — the encrypted NIK column
 * must never land in a browser response.
 */

const orderColumns = {
  id: zakatOrders.id,
  nomorKwitansi: zakatOrders.nomorKwitansi,
  namaMuzakki: zakatOrders.namaMuzakki,
  noTelepon: zakatOrders.noTelepon,
  alamat: zakatOrders.alamat,
  isAnonymous: zakatOrders.isAnonymous,
  jenisZakat: zakatOrders.jenisZakat,
  metodePembayaran: zakatOrders.metodePembayaran,
  nominal: zakatOrders.nominal,
  beratBerasKg: zakatOrders.beratBerasKg,
  jumlahJiwa: zakatOrders.jumlahJiwa,
  status: zakatOrders.status,
  notes: zakatOrders.notes,
  transactionId: zakatOrders.transactionId,
  createdAt: zakatOrders.createdAt,
};

const numericOrNull = (value: number | undefined) =>
  value === undefined ? null : String(value);

/** [I-8] Filter tahun WIB; zakat dilaporkan per tahun haul, bukan per bulan. */
const ordersList = adminProcedure
  .input(
    z.object({
      jenis: z.enum(['FITRAH', 'MAAL']).optional(),
      year: yearField,
    })
  )
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(orderColumns)
      .from(zakatOrders)
      .where(
        and(...createdAtWithin(zakatOrders.createdAt, { year: input.year }))
      )
      .orderBy(desc(zakatOrders.createdAt));

    const filtered = input.jenis
      ? rows.filter((r) =>
          input.jenis === 'FITRAH'
            ? r.jenisZakat === 'FITRAH'
            : r.jenisZakat !== 'FITRAH'
        )
      : rows;
    return { data: filtered };
  });

/**
 * Zakat yang diterima langsung oleh admin (kasir tunai, transfer yang sudah
 * dicek di mutasi rekening, atau beras). Langsung TERVERIFIKASI karena admin
 * sendiri yang menerima dananya — sama seperti `amil.offlineZakat`.
 */
const createOrder = adminProcedure
  .input(recordZakatSchema)
  .handler(async ({ input, context }) => {
    const admin = context.user;
    if (!admin) {
      throw new ORPCError('UNAUTHORIZED');
    }
    await assertJenisActive(context.db, 'JENIS_ZAKAT', input.jenisZakat);
    const isAnonymous = input.isAnonymous ?? false;
    const [row] = await context.db
      .insert(zakatOrders)
      .values({
        id: `ZAD-${ulid()}`,
        nomorKwitansi: `BSZ-${new Date().getFullYear()}-${ulid().slice(-10)}`,
        namaMuzakki: isAnonymous ? 'Hamba Allah' : input.namaMuzakki,
        noTelepon: input.noTelepon || null,
        alamat: input.alamat || null,
        isAnonymous,
        jenisZakat: input.jenisZakat,
        metodePembayaran: input.metodePembayaran,
        nominal: numericOrNull(input.nominal),
        beratBerasKg: numericOrNull(input.beratBerasKg),
        jumlahJiwa: input.jumlahJiwa ?? null,
        status: 'TERVERIFIKASI',
        notes: input.notes || null,
        enteredByAmilId: admin.userId,
        transactionId: null,
      })
      .returning(orderColumns);
    return { success: true, data: row };
  });

async function findOrder(context: { db: Database }, id: string) {
  const [existing] = await context.db
    .select(orderColumns)
    .from(zakatOrders)
    .where(eq(zakatOrders.id, id))
    .limit(1);
  if (!existing) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Transaksi zakat tidak ditemukan',
    });
  }
  return existing;
}

type ZakatOrderPatch = Omit<z.infer<typeof updateZakatOrderSchema>, 'id'>;
type ExistingZakatOrder = Awaited<ReturnType<typeof findOrder>>;

/**
 * Order yang dibayar lewat payment gateway (`transactionId` terisi) nominal &
 * identitasnya mengikuti data pembayaran, jadi hanya status verifikasi dan
 * catatannya yang boleh diubah admin.
 */
function assertPatchAllowed(
  existing: ExistingZakatOrder,
  patch: ZakatOrderPatch
) {
  if (existing.transactionId) {
    const locked = Object.keys(patch).filter(
      (key) => key !== 'status' && key !== 'notes'
    );
    if (locked.length > 0) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Transaksi dari payment gateway hanya dapat diubah status verifikasi dan catatannya',
      });
    }
  }

  const metode = patch.metodePembayaran ?? existing.metodePembayaran;
  const nominal = patch.nominal ?? Number(existing.nominal ?? 0);
  const beras = patch.beratBerasKg ?? Number(existing.beratBerasKg ?? 0);
  if (metode === 'BERAS' ? !beras : !nominal) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Metode BERAS wajib beratBerasKg; metode uang wajib nominal',
    });
  }
}

function identityPatch(existing: ExistingZakatOrder, patch: ZakatOrderPatch) {
  if (patch.namaMuzakki === undefined && patch.isAnonymous === undefined) {
    return {};
  }
  const isAnonymous = patch.isAnonymous ?? existing.isAnonymous;
  return {
    isAnonymous,
    namaMuzakki: isAnonymous
      ? 'Hamba Allah'
      : (patch.namaMuzakki ?? existing.namaMuzakki),
  };
}

const updateOrder = adminProcedure
  .input(updateZakatOrderSchema)
  .handler(async ({ input, context }) => {
    const { id, ...patch } = input;
    const existing = await findOrder(context, id);
    assertPatchAllowed(existing, patch);
    if (patch.jenisZakat && patch.jenisZakat !== existing.jenisZakat) {
      await assertJenisActive(context.db, 'JENIS_ZAKAT', patch.jenisZakat);
    }

    const optionalText = (value: string | undefined) =>
      value === undefined ? undefined : value || null;
    const [row] = await context.db
      .update(zakatOrders)
      .set({
        ...identityPatch(existing, patch),
        noTelepon: optionalText(patch.noTelepon),
        alamat: optionalText(patch.alamat),
        jenisZakat: patch.jenisZakat,
        metodePembayaran: patch.metodePembayaran,
        nominal:
          patch.nominal === undefined ? undefined : String(patch.nominal),
        beratBerasKg:
          patch.beratBerasKg === undefined
            ? undefined
            : String(patch.beratBerasKg),
        jumlahJiwa: patch.jumlahJiwa,
        status: patch.status,
        notes: optionalText(patch.notes),
      })
      .where(eq(zakatOrders.id, id))
      .returning(orderColumns);
    return { success: true, data: row };
  });

/**
 * Hanya entri manual (tanpa `transactionId`) yang boleh dihapus — order
 * payment gateway adalah jejak audit pembayaran; tolak lewat status DITOLAK.
 */
const deleteOrder = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const existing = await findOrder(context, input.id);
    if (existing.transactionId) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Transaksi dari payment gateway tidak dapat dihapus; ubah statusnya menjadi Ditolak',
      });
    }
    await context.db.delete(zakatOrders).where(eq(zakatOrders.id, input.id));
    return { success: true };
  });

const distributionsList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: zakatDistributions.id,
      jenisZakat: zakatDistributions.jenisZakat,
      nominal: zakatDistributions.nominal,
      beratBerasKg: zakatDistributions.beratBerasKg,
      status: zakatDistributions.status,
      notes: zakatDistributions.notes,
      createdAt: zakatDistributions.createdAt,
      mustahiqId: zakatDistributions.mustahiqId,
      namaMustahiq: mustahiqProfiles.namaMustahiq,
      kategoriAsnaf: mustahiqProfiles.kategoriAsnaf,
    })
    .from(zakatDistributions)
    .leftJoin(
      mustahiqProfiles,
      eq(mustahiqProfiles.id, zakatDistributions.mustahiqId)
    )
    .orderBy(desc(zakatDistributions.createdAt));
  return { data: rows };
});

const addDistribution = adminProcedure
  .input(distributionSchema)
  .handler(async ({ input, context }) => {
    const admin = context.user;
    if (!admin) {
      // adminProcedure guarantees this is unreachable — narrows the type.
      throw new ORPCError('UNAUTHORIZED');
    }
    const [mustahiq] = await context.db
      .select({ id: mustahiqProfiles.id })
      .from(mustahiqProfiles)
      .where(eq(mustahiqProfiles.id, input.mustahiqId))
      .limit(1);
    if (!mustahiq) {
      throw new ORPCError('NOT_FOUND', { message: 'Mustahiq tidak ditemukan' });
    }
    const [row] = await context.db
      .insert(zakatDistributions)
      .values({
        id: `ZDS-${ulid()}`,
        mustahiqId: input.mustahiqId,
        jenisZakat: input.jenisZakat,
        nominal: input.nominal === undefined ? null : String(input.nominal),
        beratBerasKg:
          input.beratBerasKg === undefined ? null : String(input.beratBerasKg),
        buktiPenerimaanUrl: input.buktiPenerimaanUrl ?? null,
        notes: input.notes ?? null,
        distributedByAmilId: admin.userId,
      })
      .returning();
    return { success: true, data: row };
  });

/**
 * Recipient (mustahik) list is internal audit only (SECURITY.md §6). The
 * encrypted `nik` column is deliberately NOT selected — it must never land
 * in a browser response or network log.
 */
const mustahiqList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: mustahiqProfiles.id,
      namaMustahiq: mustahiqProfiles.namaMustahiq,
      kategoriAsnaf: mustahiqProfiles.kategoriAsnaf,
      alamat: mustahiqProfiles.alamat,
      noTelepon: mustahiqProfiles.noTelepon,
      statusVerifikasi: mustahiqProfiles.statusVerifikasi,
      adminNotes: mustahiqProfiles.adminNotes,
      createdAt: mustahiqProfiles.createdAt,
    })
    .from(mustahiqProfiles)
    .orderBy(desc(mustahiqProfiles.createdAt));
  return { data: rows };
});

/**
 * Registers a mustahik (zakat recipient). NIK is AES-256-GCM encrypted at
 * rest (SECURITY.md §6) using `env.ENCRYPTION_KEY` — a raw `SELECT nik` shows
 * only ciphertext. The encrypted value is never returned to the caller.
 */
const createMustahiq = adminProcedure
  .input(createMustahiqSchema)
  .handler(async ({ input, context }) => {
    const encryptedNik = input.nik
      ? encryptSecret(input.nik, env.ENCRYPTION_KEY)
      : null;

    const [row] = await context.db
      .insert(mustahiqProfiles)
      .values({
        id: `MP-${ulid()}`,
        namaMustahiq: input.namaMustahiq,
        nik: encryptedNik,
        kategoriAsnaf: input.kategoriAsnaf,
        alamat: input.alamat ?? null,
        noTelepon: input.noTelepon ?? null,
        adminNotes: input.adminNotes ?? null,
        updatedAt: new Date().toISOString(),
      })
      .returning({
        id: mustahiqProfiles.id,
        namaMustahiq: mustahiqProfiles.namaMustahiq,
        kategoriAsnaf: mustahiqProfiles.kategoriAsnaf,
        alamat: mustahiqProfiles.alamat,
        noTelepon: mustahiqProfiles.noTelepon,
        statusVerifikasi: mustahiqProfiles.statusVerifikasi,
        adminNotes: mustahiqProfiles.adminNotes,
        createdAt: mustahiqProfiles.createdAt,
      });

    return { success: true, data: row };
  });

const goldPriceColumns = {
  id: zakatGoldPriceHistory.id,
  pricePerGram: zakatGoldPriceHistory.pricePerGram,
  source: zakatGoldPriceHistory.source,
  fetchedAt: zakatGoldPriceHistory.fetchedAt,
};

/** Harga acuan terakhir — baris yang sama yang dipakai kalkulator publik. */
const goldPriceLatest = adminProcedure.handler(async ({ context }) => {
  const [row] = await context.db
    .select(goldPriceColumns)
    .from(zakatGoldPriceHistory)
    .orderBy(desc(zakatGoldPriceHistory.fetchedAt))
    .limit(1);
  return { data: row ?? null };
});

/**
 * Tarik harga emas live sekarang juga dan catat sebagai `LIVE_API`. Karena
 * layanan harga emas memprioritaskan baris terbaru, ini sekaligus mencabut
 * harga manual yang sebelumnya diset admin.
 */
const syncGoldPrice = adminProcedure.handler(async ({ context }) => {
  let price: bigint;
  try {
    price = await fetchLiveGoldPricePerGram();
  } catch (error) {
    throw new ORPCError('SERVICE_UNAVAILABLE', {
      message:
        error instanceof Error
          ? `Gagal mengambil harga emas live: ${error.message}`
          : 'Gagal mengambil harga emas live',
    });
  }
  const [row] = await context.db
    .insert(zakatGoldPriceHistory)
    .values({
      id: `GOLD-${ulid()}`,
      pricePerGram: price.toString(),
      source: 'LIVE_API',
    })
    .returning(goldPriceColumns);
  return { success: true, data: row };
});

const fitrahConfigColumns = {
  id: zakatFitrahConfig.id,
  jenisBeras: zakatFitrahConfig.jenisBeras,
  konversiHargaPerJiwa: zakatFitrahConfig.konversiHargaPerJiwa,
  referensiSk: zakatFitrahConfig.referensiSk,
  tahunBerlaku: zakatFitrahConfig.tahunBerlaku,
  isActive: zakatFitrahConfig.isActive,
  updatedAt: zakatFitrahConfig.updatedAt,
};

/**
 * Konfigurasi aktif terbaru = tarif yang dipakai kalkulator fitrah publik
 * (`getActiveFitrahPricePerPerson`). Histori ikut dikirim untuk audit.
 */
const fitrahConfigList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select(fitrahConfigColumns)
    .from(zakatFitrahConfig)
    .orderBy(desc(zakatFitrahConfig.updatedAt));
  return { data: rows };
});

/**
 * Port dari `POST /api/admin/zakat-fitrah-config` (Next.js lama): config
 * aktif untuk jenis beras yang sama dinonaktifkan (histori, tidak dihapus),
 * lalu config baru disisipkan sebagai aktif.
 */
const saveFitrahConfig = adminProcedure
  .input(fitrahConfigSchema)
  .handler(async ({ input, context }) => {
    const now = new Date().toISOString();
    const row = await context.db.transaction(async (tx) => {
      await tx
        .update(zakatFitrahConfig)
        .set({ isActive: false, updatedAt: now })
        .where(
          and(
            eq(zakatFitrahConfig.jenisBeras, input.jenisBeras),
            eq(zakatFitrahConfig.isActive, true)
          )
        );
      const [created] = await tx
        .insert(zakatFitrahConfig)
        .values({
          id: `ZFC-${ulid()}`,
          jenisBeras: input.jenisBeras,
          konversiHargaPerJiwa: String(input.konversiHargaPerJiwa),
          referensiSk: input.referensiSk || null,
          tahunBerlaku: input.tahunBerlaku || null,
          isActive: true,
          updatedAt: now,
        })
        .returning(fitrahConfigColumns);
      return created;
    });
    return { success: true, data: row };
  });

const setGoldPrice = adminProcedure
  .input(goldPriceSchema)
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .insert(zakatGoldPriceHistory)
      .values({
        id: `GLD-${ulid()}`,
        pricePerGram: String(input.pricePerGram),
        source: 'MANUAL_FALLBACK',
      })
      .returning(goldPriceColumns);
    return { success: true, data: row };
  });

export const zakat = {
  ordersList,
  createOrder,
  updateOrder,
  deleteOrder,
  distributionsList,
  addDistribution,
  mustahiqList,
  createMustahiq,
  setGoldPrice,
  goldPriceLatest,
  syncGoldPrice,
  fitrahConfigList,
  saveFitrahConfig,
};

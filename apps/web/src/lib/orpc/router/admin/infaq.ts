import {
  createInfaqProgramSchema,
  createManualInfaqSchema,
  updateInfaqProgramSchema,
  updateManualInfaqSchema,
} from '@amwal/core/contracts/admin-infaq';
import {
  createReceiptSignedUrl,
  deleteReceiptFile,
  parseReceiptObjectKey,
} from '@amwal/core/storage/files';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, like, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import type { Database } from '@/lib/db';
import { infaqOrders, infaqPrograms, transactions } from '@/lib/db/schema';
import { createdAtWithin, monthField, yearField } from '../../period-filter';
import { adminProcedure } from '../../procedures';
import { assertJenisActive, assertMetodeInfaqActive } from './master-data';

/**
 * oRPC admin.infaq router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/infaq.ts`.
 *
 * [I-8] Filter bulan + tahun WIB, dengan pemisahan Infaq vs Sedekah.
 *
 * Pemisahannya diturunkan dari `infaq_orders.jenis` (`INFAQ_*` vs
 * `SEDEKAH_*`, ditegakkan CHECK di tabel), **bukan** dari digit 80/85 order
 * ID: order lama berformat `INF-<ULID>` tidak punya digit itu dan akan hilang
 * diam-diam dari laporan.
 *
 * Pencocokan awalan memakai garis bawah yang di-escape (`INFAQ\_%`). Tanpa
 * escape, `_` di LIKE berarti "satu karakter apa pun", sehingga `INFAQ_%`
 * juga akan cocok dengan jenis baru bernama `INFAQX…`.
 *
 * Program katalog (`infaq_programs`) dan donasi manual (`metode_manual`
 * terisi) dikelola penuh dari panel admin. Order payment gateway tetap
 * read-only di sini — sumber kebenarannya adalah webhook pembayaran.
 */

const orderColumns = {
  id: infaqOrders.id,
  orderId: infaqOrders.orderId,
  namaPenginfaq: infaqOrders.namaPenginfaq,
  teleponPenginfaq: infaqOrders.teleponPenginfaq,
  nominal: infaqOrders.nominal,
  jenis: infaqOrders.jenis,
  doa: infaqOrders.doa,
  status: infaqOrders.status,
  createdAt: infaqOrders.createdAt,
  programId: infaqOrders.programId,
  programNama: infaqPrograms.nama,
  /** Ada lampiran bukti (foto struk/PDF); berkasnya diambil lewat `proofUrl`. */
  hasBukti: sql<boolean>`${infaqOrders.buktiTransaksi} IS NOT NULL`,
  isManual: sql<boolean>`${infaqOrders.metodeManual} IS NOT NULL`,
  paymentMethod: sql<
    string | null
  >`coalesce(${infaqOrders.metodeManual}, ${transactions.paymentMethod})`,
};

function selectOrders(database: Database) {
  return database
    .select(orderColumns)
    .from(infaqOrders)
    .leftJoin(transactions, eq(transactions.id, infaqOrders.transactionId))
    .leftJoin(infaqPrograms, eq(infaqPrograms.id, infaqOrders.programId));
}

const ordersList = adminProcedure
  .input(
    z.object({
      jenis: z.string().optional(),
      kategori: z.enum(['INFAQ', 'SEDEKAH']).optional(),
      year: yearField,
      month: monthField,
    })
  )
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = createdAtWithin(infaqOrders.createdAt, input);

    if (input.kategori) {
      conditions.push(like(infaqOrders.jenis, `${input.kategori}\\_%`));
    }
    if (input.jenis) {
      conditions.push(eq(infaqOrders.jenis, input.jenis));
    }

    const rows = await selectOrders(context.db)
      .where(and(...conditions))
      .orderBy(desc(infaqOrders.createdAt));

    return { data: rows };
  });

async function findProgram(database: Database, id: string) {
  const [program] = await database
    .select({ id: infaqPrograms.id, jenis: infaqPrograms.jenis })
    .from(infaqPrograms)
    .where(eq(infaqPrograms.id, id))
    .limit(1);
  if (!program) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Program infaq tidak ditemukan',
    });
  }
  return program;
}

async function findManualOrder(database: Database, id: string) {
  const [order] = await database
    .select({
      id: infaqOrders.id,
      jenis: infaqOrders.jenis,
      metodeManual: infaqOrders.metodeManual,
      buktiTransaksi: infaqOrders.buktiTransaksi,
    })
    .from(infaqOrders)
    .where(eq(infaqOrders.id, id))
    .limit(1);
  if (!order) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Transaksi infaq tidak ditemukan',
    });
  }
  if (order.metodeManual === null) {
    throw new ORPCError('BAD_REQUEST', {
      message:
        'Transaksi dari payment gateway tidak dapat diubah atau dihapus dari panel admin',
    });
  }
  return order;
}

async function selectOrderById(database: Database, id: string) {
  const [row] = await selectOrders(database).where(eq(infaqOrders.id, id));
  return row;
}

/**
 * Donasi yang diterima di luar payment gateway (kotak infaq, kasir tunai,
 * transfer yang dicek manual). Dicatat langsung SETTLED karena dananya
 * sudah diterima admin.
 */
const createOrder = adminProcedure
  .input(createManualInfaqSchema)
  .handler(async ({ input, context }) => {
    const program = input.programId
      ? await findProgram(context.db, input.programId)
      : null;
    const jenis = program?.jenis ?? input.jenis ?? 'INFAQ_UMUM';
    await assertJenisActive(context.db, 'JENIS_INFAQ', jenis);
    await assertMetodeInfaqActive(context.db, input.metode);
    const id = `INFM-${ulid()}`;
    await context.db.insert(infaqOrders).values({
      id,
      orderId: `INF-MAN-${ulid()}`,
      namaPenginfaq: input.namaPenginfaq,
      teleponPenginfaq: input.teleponPenginfaq || null,
      nominal: String(input.nominal),
      jenis,
      doa: input.doa || null,
      status: 'SETTLED',
      programId: program?.id ?? null,
      metodeManual: input.metode,
    });
    return { success: true, data: await selectOrderById(context.db, id) };
  });

/**
 * Hanya nilai yang berubah yang divalidasi: entri lama dengan jenis/metode
 * yang kini nonaktif tetap bisa diedit kolom lainnya.
 */
async function assertChangedMasterValuesActive(
  database: Database,
  existing: { jenis: string; metodeManual: string | null },
  next: { jenis?: string; metode?: string }
) {
  if (next.jenis !== undefined && next.jenis !== existing.jenis) {
    await assertJenisActive(database, 'JENIS_INFAQ', next.jenis);
  }
  if (next.metode !== undefined && next.metode !== existing.metodeManual) {
    await assertMetodeInfaqActive(database, next.metode);
  }
}

const updateOrder = adminProcedure
  .input(updateManualInfaqSchema)
  .handler(async ({ input, context }) => {
    const existing = await findManualOrder(context.db, input.id);
    const program = input.programId
      ? await findProgram(context.db, input.programId)
      : null;
    await assertChangedMasterValuesActive(context.db, existing, {
      jenis: program?.jenis ?? input.jenis,
      metode: input.metode,
    });

    await context.db
      .update(infaqOrders)
      .set({
        ...(input.namaPenginfaq !== undefined && {
          namaPenginfaq: input.namaPenginfaq,
        }),
        ...(input.teleponPenginfaq !== undefined && {
          teleponPenginfaq: input.teleponPenginfaq || null,
        }),
        ...(input.nominal !== undefined && { nominal: String(input.nominal) }),
        ...(input.metode !== undefined && { metodeManual: input.metode }),
        ...(input.doa !== undefined && { doa: input.doa || null }),
        ...(input.jenis !== undefined && { jenis: input.jenis }),
        // Program menentukan jenis: jenis order selalu ikut program tujuannya.
        ...(input.programId !== undefined && {
          programId: program?.id ?? null,
          ...(program && { jenis: program.jenis }),
        }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(infaqOrders.id, input.id));
    return { success: true, data: await selectOrderById(context.db, input.id) };
  });

/** Berkas bukti yang sudah tak dirujuk DB dibuang; kegagalan hapus tidak menggagalkan permintaan. */
async function removeProofFile(objectKey: string | null) {
  if (!objectKey) {
    return;
  }
  try {
    const { bucket, path } = parseReceiptObjectKey(objectKey);
    await deleteReceiptFile({ bucket, path });
  } catch {
    // Berkas yatim hanya tersisa di disk.
  }
}

const PROOF_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const deleteOrder = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const existing = await findManualOrder(context.db, input.id);
    await context.db.delete(infaqOrders).where(eq(infaqOrders.id, input.id));
    await removeProofFile(existing.buktiTransaksi);
    return { success: true };
  });

/** Tautan unduh sesaat (600 dtk) untuk bukti donasi manual; tidak pernah disimpan. */
const proofUrl = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const order = await findManualOrder(context.db, input.id);
    if (!order.buktiTransaksi) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Donasi ini belum memiliki lampiran bukti',
      });
    }
    const { bucket, path } = parseReceiptObjectKey(order.buktiTransaksi);
    const signedUrl = await createReceiptSignedUrl({
      bucket,
      path,
      expiresInSeconds: 600,
    });
    const extension = order.buktiTransaksi.split('.').pop() ?? '';
    return {
      data: {
        signedUrl,
        expiresInSeconds: 600,
        mimeType: PROOF_MIME_BY_EXTENSION[extension] ?? null,
      },
    };
  });

const removeProof = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const order = await findManualOrder(context.db, input.id);
    await context.db
      .update(infaqOrders)
      .set({ buktiTransaksi: null, updatedAt: new Date().toISOString() })
      .where(eq(infaqOrders.id, input.id));
    await removeProofFile(order.buktiTransaksi);
    return { success: true };
  });

/** Terkumpul = total order SETTLED (gateway + manual) yang dialokasikan ke program. */
const programColumns = {
  id: infaqPrograms.id,
  nama: infaqPrograms.nama,
  jenis: infaqPrograms.jenis,
  deskripsi: infaqPrograms.deskripsi,
  target: infaqPrograms.target,
  status: infaqPrograms.status,
  createdAt: infaqPrograms.createdAt,
  // Nama kolom ditulis lengkap: di dalam subquery Drizzle merender kolom tanpa
  // prefiks tabel, sehingga `"id"` akan ter-resolve ke `infaq_orders.id`.
  collected: sql<string>`coalesce((
    select sum(o.nominal) from infaq_orders o
    where o.program_id = "infaq_programs"."id" and o.status = 'SETTLED'
  ), 0)`,
  orderCount: sql<number>`(
    select count(*)::int from infaq_orders o
    where o.program_id = "infaq_programs"."id"
  )`,
};

async function selectProgramById(database: Database, id: string) {
  const [row] = await database
    .select(programColumns)
    .from(infaqPrograms)
    .where(eq(infaqPrograms.id, id));
  return row;
}

const programsList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select(programColumns)
    .from(infaqPrograms)
    .orderBy(desc(infaqPrograms.createdAt));
  return { data: rows };
});

const createProgram = adminProcedure
  .input(createInfaqProgramSchema)
  .handler(async ({ input, context }) => {
    await assertJenisActive(context.db, 'JENIS_INFAQ', input.jenis);
    const id = `INP-${ulid()}`;
    await context.db.insert(infaqPrograms).values({
      id,
      nama: input.nama,
      jenis: input.jenis,
      deskripsi: input.deskripsi || null,
      target: input.target === null ? null : String(input.target),
      status: input.status,
    });
    return { success: true, data: await selectProgramById(context.db, id) };
  });

const updateProgram = adminProcedure
  .input(updateInfaqProgramSchema)
  .handler(async ({ input, context }) => {
    const existing = await findProgram(context.db, input.id);
    if (input.jenis !== undefined && input.jenis !== existing.jenis) {
      await assertJenisActive(context.db, 'JENIS_INFAQ', input.jenis);
    }
    await context.db
      .update(infaqPrograms)
      .set({
        ...(input.nama !== undefined && { nama: input.nama }),
        ...(input.jenis !== undefined && { jenis: input.jenis }),
        ...(input.deskripsi !== undefined && {
          deskripsi: input.deskripsi || null,
        }),
        ...(input.target !== undefined && {
          target: input.target === null ? null : String(input.target),
        }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(infaqPrograms.id, input.id));
    return {
      success: true,
      data: await selectProgramById(context.db, input.id),
    };
  });

/**
 * Menghapus program tidak menghapus donasinya: FK `ON DELETE SET NULL`
 * melepas alokasi order, sehingga total penghimpunan tetap utuh.
 */
const deleteProgram = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    await findProgram(context.db, input.id);
    await context.db
      .delete(infaqPrograms)
      .where(eq(infaqPrograms.id, input.id));
    return { success: true };
  });

export const infaq = {
  ordersList,
  createOrder,
  updateOrder,
  deleteOrder,
  proofUrl,
  removeProof,
  programsList,
  createProgram,
  updateProgram,
  deleteProgram,
};

import { getActive } from '@amwal/core/akad';
import {
  allocationSchema,
  batchDocumentationSchema,
  batchSchema,
  DEFAULT_AKAD_WAKALAH_QURBAN,
  registerShohibulSchema,
  sendQurbanReportSchema,
  updateBatchSchema,
  updateShohibulSchema,
} from '@amwal/core/contracts/admin-qurban';
import { reserveSlots, SlotUnavailableError } from '@amwal/core/qurban/slots';
import {
  hasImageFileExtension,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  UPLOAD_LIMIT_BYTES,
} from '@amwal/core/storage/image-upload';
import { signMediaUrl } from '@amwal/core/storage/media-url';
import { normalizeIndonesianPhone } from '@amwal/core/whatsapp/phone';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import type { Database } from '@/lib/db';
import {
  hewanBatches,
  qurbanAnimalSlots,
  qurbanDistributionAllocations,
  qurbanDistributionReports,
  qurbanOrders,
  setoranQurbanOrderLinks,
} from '@/lib/db/schema';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { createdAtWithin, yearField } from '../../period-filter';
import { adminProcedure } from '../../procedures';

/**
 * oRPC admin.qurban router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/qurban.ts`, extended so the admin Qurban
 * module runs entirely on real data: batch (hewan) CRUD, shohibul
 * registration against real slots, documentation links per batch, and the
 * WhatsApp slaughter report.
 *
 * Orders paid through the payment gateway (`transactionId` set) keep their
 * payment fields read-only here and can never be deleted — the webhook is the
 * source of truth for them. Only admin-entered orders are fully editable.
 */

/** Slots that hold (or held) an order. `DIBATALKAN` frees the slot. */
const TAKEN_SLOT_STATUSES = ['TERISI', 'TERJUAL'] as const;

const batchesList = adminProcedure.handler(async ({ context }) => {
  const batches = await context.db
    .select()
    .from(hewanBatches)
    .orderBy(desc(hewanBatches.createdAt));

  // One query for every slot (plus its order's names) instead of one per
  // batch; the dashboard shows 1/7 occupancy and who holds each slot.
  const slots = await context.db
    .select({
      id: qurbanAnimalSlots.id,
      hewanBatchId: qurbanAnimalSlots.hewanBatchId,
      nomorSlot: qurbanAnimalSlots.nomorSlot,
      status: qurbanAnimalSlots.status,
      qurbanOrderId: qurbanAnimalSlots.qurbanOrderId,
      namaPengqurban: qurbanOrders.namaPengqurban,
      namaShohibul: qurbanOrders.namaShohibul,
      statusPembayaran: qurbanOrders.statusPembayaran,
    })
    .from(qurbanAnimalSlots)
    .leftJoin(
      qurbanOrders,
      eq(qurbanOrders.id, qurbanAnimalSlots.qurbanOrderId)
    )
    .orderBy(qurbanAnimalSlots.nomorSlot);

  const slotsByBatch = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = slotsByBatch.get(slot.hewanBatchId) ?? [];
    list.push(slot);
    slotsByBatch.set(slot.hewanBatchId, list);
  }

  return {
    data: batches.map((batch) => {
      const batchSlots = slotsByBatch.get(batch.id) ?? [];
      return {
        ...batch,
        slots: batchSlots,
        slotTerpakai: batchSlots.filter((s) => s.status !== 'TERSEDIA').length,
        slotTotal: batch.totalSlot,
      };
    }),
  };
});

function fotoToGaleri(fotoUrl: string | undefined) {
  if (fotoUrl === undefined) {
    return;
  }
  return fotoUrl ? [fotoUrl] : null;
}

const PHOTO_UPLOAD_TTL_SECONDS = 300;

/**
 * Izin unggah foto katalog hewan ke volume media (QA Test#1): URL PUT
 * bertanda tangan 5 menit; nama objek dipilih server, isi diperiksa magic
 * bytes oleh `/api/media`. `publicUrl` itulah yang disimpan di `fotoUrl`.
 */
const photoUploadUrl = adminProcedure
  .input(
    z.object({
      fileName: z.string().trim().min(1).max(255),
      contentType: z.enum(IMAGE_MIME_TYPES, {
        message: 'Format foto harus JPG, PNG, atau WebP',
      }),
      size: z
        .number()
        .int()
        .positive()
        .max(UPLOAD_LIMIT_BYTES['qurban-photos'], 'Ukuran foto maksimal 5MB'),
    })
  )
  .handler(({ input }) => {
    if (!hasImageFileExtension(input.fileName)) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Format foto harus JPG, PNG, atau WebP',
      });
    }
    const path = `${Date.now()}-${ulid().toLowerCase()}.${IMAGE_EXTENSIONS[input.contentType]}`;
    return {
      uploadUrl: signMediaUrl({
        method: 'PUT',
        bucket: 'qurban-photos',
        path,
        expiresInSeconds: PHOTO_UPLOAD_TTL_SECONDS,
      }),
      publicUrl: `/api/media/qurban-photos/${path}`,
    };
  });

const createBatch = adminProcedure
  .input(batchSchema)
  .handler(async ({ input, context }) => {
    const now = new Date().toISOString();
    const batchId = `HWB-${ulid()}`;

    const batch = await context.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(hewanBatches)
        .values({
          id: batchId,
          jenisHewan: input.jenisHewan,
          totalSlot: input.totalSlot,
          hargaPerSlot: String(input.hargaPerSlot),
          ras: input.ras || null,
          kelasGrade: input.kelasGrade || null,
          estimasiBeratKg:
            input.estimasiBeratKg === undefined
              ? null
              : String(input.estimasiBeratKg),
          wilayahPenyaluran: input.wilayahPenyaluran || null,
          targetPenerimaManfaat: input.targetPenerimaManfaat ?? null,
          namaBatch: input.namaBatch || null,
          lokasiRph: input.lokasiRph || null,
          timJuleha: input.timJuleha || null,
          galeriFotoUrls: fotoToGaleri(input.fotoUrl) ?? null,
          tanggalPenyembelihanEstimasi:
            input.tanggalPenyembelihanEstimasi ?? null,
        })
        .returning();

      // Pre-create the slots so the row-locked reservation flow has targets.
      await tx.insert(qurbanAnimalSlots).values(
        Array.from({ length: input.totalSlot }, (_, index) => ({
          id: `SLT-${ulid()}`,
          hewanBatchId: batchId,
          nomorSlot: index + 1,
          status: 'TERSEDIA' as const,
        }))
      );
      return row;
    });

    return { success: true, data: { ...batch, now } };
  });

async function findBatch(database: Database, id: string) {
  const [batch] = await database
    .select()
    .from(hewanBatches)
    .where(eq(hewanBatches.id, id))
    .limit(1);
  if (!batch) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Batch hewan tidak ditemukan',
    });
  }
  return batch;
}

async function countTakenSlots(database: Database, batchId: string) {
  const taken = await database
    .select({ id: qurbanAnimalSlots.id })
    .from(qurbanAnimalSlots)
    .where(
      and(
        eq(qurbanAnimalSlots.hewanBatchId, batchId),
        or(
          inArray(qurbanAnimalSlots.status, [...TAKEN_SLOT_STATUSES]),
          isNotNull(qurbanAnimalSlots.qurbanOrderId)
        )
      )
    );
  return taken.length;
}

const updateBatch = adminProcedure
  .input(updateBatchSchema)
  .handler(async ({ input, context }) => {
    const existing = await findBatch(context.db, input.id);
    if (
      input.hargaPerSlot !== undefined &&
      Number(existing.hargaPerSlot) !== input.hargaPerSlot &&
      (await countTakenSlots(context.db, input.id)) > 0
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Harga tidak dapat diubah karena sudah ada slot yang dipesan pada hewan ini',
      });
    }

    const optionalText = (value: string | undefined) =>
      value === undefined ? undefined : value || null;
    const [row] = await context.db
      .update(hewanBatches)
      .set({
        hargaPerSlot:
          input.hargaPerSlot === undefined
            ? undefined
            : String(input.hargaPerSlot),
        ras: optionalText(input.ras),
        kelasGrade: optionalText(input.kelasGrade),
        estimasiBeratKg:
          input.estimasiBeratKg === undefined
            ? undefined
            : String(input.estimasiBeratKg),
        wilayahPenyaluran: optionalText(input.wilayahPenyaluran),
        targetPenerimaManfaat: input.targetPenerimaManfaat,
        namaBatch: optionalText(input.namaBatch),
        lokasiRph: optionalText(input.lokasiRph),
        timJuleha: optionalText(input.timJuleha),
        galeriFotoUrls: fotoToGaleri(input.fotoUrl),
        tanggalPenyembelihanEstimasi: optionalText(
          input.tanggalPenyembelihanEstimasi
        ),
        status: input.status,
      })
      .where(eq(hewanBatches.id, input.id))
      .returning();
    return { success: true, data: row };
  });

/**
 * Only a batch nobody has ordered from (and that has no distribution record)
 * can be deleted; otherwise mark it SELESAI instead.
 */
const deleteBatch = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    await findBatch(context.db, input.id);
    if ((await countTakenSlots(context.db, input.id)) > 0) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Hewan ini sudah memiliki shohibul terdaftar dan tidak dapat dihapus; ubah statusnya menjadi Selesai',
      });
    }
    const [allocation] = await context.db
      .select({ id: qurbanDistributionAllocations.id })
      .from(qurbanDistributionAllocations)
      .where(eq(qurbanDistributionAllocations.hewanBatchId, input.id))
      .limit(1);
    if (allocation) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Hewan ini sudah memiliki catatan distribusi daging',
      });
    }
    await context.db.transaction(async (tx) => {
      await tx
        .delete(qurbanAnimalSlots)
        .where(eq(qurbanAnimalSlots.hewanBatchId, input.id));
      await tx.delete(hewanBatches).where(eq(hewanBatches.id, input.id));
    });
    return { success: true };
  });

const saveDocumentation = adminProcedure
  .input(batchDocumentationSchema)
  .handler(async ({ input, context }) => {
    await findBatch(context.db, input.id);
    const [row] = await context.db
      .update(hewanBatches)
      .set({
        dokumentasiVideoUrl: input.dokumentasiVideoUrl || null,
        dokumentasiMedia: input.dokumentasiMedia,
      })
      .where(eq(hewanBatches.id, input.id))
      .returning();
    return { success: true, data: row };
  });

const orderColumns = {
  id: qurbanOrders.id,
  namaPengqurban: qurbanOrders.namaPengqurban,
  namaShohibul: qurbanOrders.namaShohibul,
  namaShohibulList: qurbanOrders.namaShohibulList,
  teleponPengqurban: qurbanOrders.teleponPengqurban,
  alamatPengqurban: qurbanOrders.alamatPengqurban,
  jenisHewan: qurbanOrders.jenisHewan,
  tipeKepemilikan: qurbanOrders.tipeKepemilikan,
  opsiPesan: qurbanOrders.opsiPesan,
  metodePembayaran: qurbanOrders.metodePembayaran,
  statusPembayaran: qurbanOrders.statusPembayaran,
  totalHarga: qurbanOrders.totalHarga,
  nominalDibayar: qurbanOrders.nominalDibayar,
  sisaTagihan: qurbanOrders.sisaTagihan,
  transactionId: qurbanOrders.transactionId,
  akadWakalahText: qurbanOrders.akadWakalahText,
  akadWakalahAcceptedAt: qurbanOrders.akadWakalahAcceptedAt,
  laporanTerkirimAt: qurbanOrders.laporanTerkirimAt,
  createdAt: qurbanOrders.createdAt,
};

/** Attaches the batch + slot numbers each order holds. */
async function withSlots<T extends { id: string }>(
  database: Database,
  orders: T[]
) {
  if (orders.length === 0) {
    return [];
  }
  const slots = await database
    .select({
      qurbanOrderId: qurbanAnimalSlots.qurbanOrderId,
      nomorSlot: qurbanAnimalSlots.nomorSlot,
      hewanBatchId: hewanBatches.id,
      namaBatch: hewanBatches.namaBatch,
      ras: hewanBatches.ras,
      totalSlot: hewanBatches.totalSlot,
      lokasiRph: hewanBatches.lokasiRph,
      dokumentasiVideoUrl: hewanBatches.dokumentasiVideoUrl,
    })
    .from(qurbanAnimalSlots)
    .innerJoin(
      hewanBatches,
      eq(hewanBatches.id, qurbanAnimalSlots.hewanBatchId)
    )
    .where(
      inArray(
        qurbanAnimalSlots.qurbanOrderId,
        orders.map((o) => o.id)
      )
    )
    .orderBy(qurbanAnimalSlots.nomorSlot);

  return orders.map((order) => {
    const mine = slots.filter((s) => s.qurbanOrderId === order.id);
    const first = mine[0];
    return {
      ...order,
      hewanBatchId: first?.hewanBatchId ?? null,
      namaBatch: first?.namaBatch ?? first?.ras ?? null,
      totalSlot: first?.totalSlot ?? null,
      lokasiRph: first?.lokasiRph ?? null,
      dokumentasiVideoUrl: first?.dokumentasiVideoUrl ?? null,
      nomorSlot: mine.map((s) => s.nomorSlot),
    };
  });
}

/**
 * [I-8] Filter tahun WIB (musim qurban tahunan). Input opsional seluruhnya:
 * `amwal-api/admin.ts` memanggil prosedur ini tanpa argumen, dan pemanggil
 * itu tidak boleh rusak.
 */
const ordersList = adminProcedure
  .input(z.object({ year: yearField }).optional())
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(orderColumns)
      .from(qurbanOrders)
      .where(
        and(...createdAtWithin(qurbanOrders.createdAt, { year: input?.year }))
      )
      .orderBy(desc(qurbanOrders.createdAt));
    return { data: await withSlots(context.db, rows) };
  });

async function selectOrderById(database: Database, id: string) {
  const rows = await database
    .select(orderColumns)
    .from(qurbanOrders)
    .where(eq(qurbanOrders.id, id));
  const [row] = await withSlots(database, rows);
  return row;
}

function normalizePhoneOrThrow(phone: string | undefined) {
  if (!phone) {
    return null;
  }
  const normalized = normalizeIndonesianPhone(phone);
  if (!normalized) {
    throw new ORPCError('BAD_REQUEST', {
      message:
        'Nomor WhatsApp tidak valid. Gunakan format Indonesia, contoh 08xx atau +62xx.',
    });
  }
  return normalized;
}

function paymentAmounts(
  total: number,
  status: 'BELUM_BAYAR' | 'DP' | 'LUNAS',
  nominalDibayar: number | undefined
) {
  if (status === 'LUNAS') {
    return { nominalDibayar: total, sisaTagihan: 0 };
  }
  if (status === 'BELUM_BAYAR') {
    return { nominalDibayar: 0, sisaTagihan: total };
  }
  if (!nominalDibayar || nominalDibayar <= 0 || nominalDibayar >= total) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Nominal DP harus lebih dari 0 dan kurang dari total harga',
    });
  }
  return { nominalDibayar, sisaTagihan: total - nominalDibayar };
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Same locking discipline as `reserveSlots` (row lock + the batch/nomor
 * unique key), but for the exact slot the admin picked on the slot map.
 */
async function reserveSpecificSlot(
  tx: Transaction,
  hewanBatchId: string,
  nomorSlot: number,
  qurbanOrderId: string
) {
  const rows = (await tx.execute(sql`
    SELECT id FROM qurban_animal_slots
    WHERE hewan_batch_id = ${hewanBatchId}
      AND nomor_slot = ${nomorSlot}
      AND status = 'TERSEDIA'
    FOR UPDATE
  `)) as Array<{ id: string }>;
  const slot = rows[0];
  if (!slot) {
    throw new SlotUnavailableError();
  }
  await tx
    .update(qurbanAnimalSlots)
    .set({ status: 'TERISI', qurbanOrderId })
    .where(eq(qurbanAnimalSlots.id, String(slot.id)));

  const [remaining] = await tx
    .select({ id: qurbanAnimalSlots.id })
    .from(qurbanAnimalSlots)
    .where(
      and(
        eq(qurbanAnimalSlots.hewanBatchId, hewanBatchId),
        eq(qurbanAnimalSlots.status, 'TERSEDIA')
      )
    )
    .limit(1);
  if (!remaining) {
    await tx
      .update(hewanBatches)
      .set({ status: 'PENUH' })
      .where(eq(hewanBatches.id, hewanBatchId));
  }
}

/**
 * Admin registers a shohibul for one slot (payment received outside the
 * gateway). Reuses the same row-locked `reserveSlots` as online checkout, so
 * an admin entry and a web checkout can never both take the last slot.
 */
const createOrder = adminProcedure
  .input(registerShohibulSchema)
  .handler(async ({ input, context }) => {
    const batch = await findBatch(context.db, input.hewanBatchId);
    if (batch.status !== 'TERSEDIA') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Hewan ini sudah penuh atau selesai',
      });
    }
    const telepon = normalizePhoneOrThrow(input.teleponPengqurban);
    const total = Number(batch.hargaPerSlot);
    const amounts = paymentAmounts(
      total,
      input.statusPembayaran,
      input.nominalDibayar
    );
    const activeAkad = await getActive(context.db, 'QURBAN');
    const orderId = `QRB-${ulid()}`;

    try {
      await context.db.transaction(async (tx) => {
        await tx.insert(qurbanOrders).values({
          id: orderId,
          namaPengqurban: input.namaPengqurban,
          namaShohibul: input.namaShohibul,
          teleponPengqurban: telepon,
          alamatPengqurban: input.alamatPengqurban || null,
          jenisHewan: batch.jenisHewan,
          tipeKepemilikan: batch.totalSlot > 1 ? 'KOLEKTIF' : 'INDIVIDU',
          opsiPesan: input.opsiPesan,
          metodePembayaran: input.metodePembayaran,
          statusPembayaran: input.statusPembayaran,
          totalHarga: String(total),
          nominalDibayar: String(amounts.nominalDibayar),
          sisaTagihan: String(amounts.sisaTagihan),
          akadWakalahText:
            input.akadWakalahText ??
            activeAkad?.body ??
            DEFAULT_AKAD_WAKALAH_QURBAN,
          akadWakalahAcceptedAt: new Date().toISOString(),
        });
        if (input.nomorSlot === undefined) {
          await reserveSlots(tx, input.hewanBatchId, 1, orderId);
        } else {
          await reserveSpecificSlot(
            tx,
            input.hewanBatchId,
            input.nomorSlot,
            orderId
          );
        }
      });
    } catch (error) {
      if (error instanceof SlotUnavailableError) {
        throw new ORPCError('BAD_REQUEST', { message: error.message });
      }
      throw error;
    }

    return { success: true, data: await selectOrderById(context.db, orderId) };
  });

async function findOrder(database: Database, id: string) {
  const [order] = await database
    .select({
      id: qurbanOrders.id,
      transactionId: qurbanOrders.transactionId,
      totalHarga: qurbanOrders.totalHarga,
      statusPembayaran: qurbanOrders.statusPembayaran,
    })
    .from(qurbanOrders)
    .where(eq(qurbanOrders.id, id))
    .limit(1);
  if (!order) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Pesanan qurban tidak ditemukan',
    });
  }
  return order;
}

const updateOrder = adminProcedure
  .input(updateShohibulSchema)
  .handler(async ({ input, context }) => {
    const existing = await findOrder(context.db, input.id);
    const touchesPayment =
      input.statusPembayaran !== undefined ||
      input.nominalDibayar !== undefined;
    if (existing.transactionId && touchesPayment) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Status pembayaran pesanan online mengikuti payment gateway dan tidak dapat diubah',
      });
    }
    const amounts = touchesPayment
      ? paymentAmounts(
          Number(existing.totalHarga),
          input.statusPembayaran ?? existing.statusPembayaran,
          input.nominalDibayar
        )
      : null;

    const optionalText = (value: string | undefined) =>
      value === undefined ? undefined : value || null;
    await context.db
      .update(qurbanOrders)
      .set({
        namaPengqurban: input.namaPengqurban,
        namaShohibul: input.namaShohibul,
        teleponPengqurban:
          input.teleponPengqurban === undefined
            ? undefined
            : normalizePhoneOrThrow(input.teleponPengqurban),
        alamatPengqurban: optionalText(input.alamatPengqurban),
        opsiPesan: input.opsiPesan,
        statusPembayaran: input.statusPembayaran,
        nominalDibayar: amounts ? String(amounts.nominalDibayar) : undefined,
        sisaTagihan: amounts ? String(amounts.sisaTagihan) : undefined,
      })
      .where(eq(qurbanOrders.id, input.id));
    return {
      success: true,
      data: await selectOrderById(context.db, input.id),
    };
  });

async function assertNoDependents(database: Database, orderId: string) {
  const checks = await Promise.all([
    database
      .select({ id: qurbanDistributionAllocations.id })
      .from(qurbanDistributionAllocations)
      .where(eq(qurbanDistributionAllocations.qurbanOrderId, orderId))
      .limit(1),
    database
      .select({ id: qurbanDistributionReports.id })
      .from(qurbanDistributionReports)
      .where(eq(qurbanDistributionReports.qurbanOrderId, orderId))
      .limit(1),
    database
      .select({ id: setoranQurbanOrderLinks.id })
      .from(setoranQurbanOrderLinks)
      .where(eq(setoranQurbanOrderLinks.qurbanOrderId, orderId))
      .limit(1),
  ]);
  if (checks.some((rows) => rows.length > 0)) {
    throw new ORPCError('BAD_REQUEST', {
      message:
        'Pesanan ini sudah memiliki catatan distribusi atau setoran dan tidak dapat dihapus',
    });
  }
}

/**
 * Cancels an admin-entered registration: the slot goes back to TERSEDIA (and
 * a PENUH batch reopens) in the same transaction as the delete.
 */
const deleteOrder = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const existing = await findOrder(context.db, input.id);
    if (existing.transactionId) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Pesanan dari payment gateway tidak dapat dihapus dari panel admin',
      });
    }
    await assertNoDependents(context.db, input.id);

    await context.db.transaction(async (tx) => {
      const released = await tx
        .update(qurbanAnimalSlots)
        .set({ status: 'TERSEDIA', qurbanOrderId: null })
        .where(eq(qurbanAnimalSlots.qurbanOrderId, input.id))
        .returning({ hewanBatchId: qurbanAnimalSlots.hewanBatchId });
      const batchIds = [...new Set(released.map((r) => r.hewanBatchId))];
      if (batchIds.length > 0) {
        await tx
          .update(hewanBatches)
          .set({ status: 'TERSEDIA' })
          .where(
            and(
              inArray(hewanBatches.id, batchIds),
              ne(hewanBatches.status, 'SELESAI')
            )
          );
      }
      await tx.delete(qurbanOrders).where(eq(qurbanOrders.id, input.id));
    });
    return { success: true };
  });

interface ReportMessageInput {
  namaPengqurban: string;
  namaShohibul: string | null;
  jenisHewan: string;
  namaBatch: string | null;
  lokasiRph: string | null;
  dokumentasiVideoUrl: string | null;
}

function reportMessage(order: ReportMessageInput): string {
  const hewan = order.namaBatch
    ? `${order.jenisHewan} - ${order.namaBatch}`
    : order.jenisHewan;
  const lines = [
    `Assalamu'alaikum Wr. Wb. Bapak/Ibu ${order.namaPengqurban},`,
    '',
    'Alhamdulillah hewan qurban atas nama:',
    `✨ ${order.namaShohibul || order.namaPengqurban} (${hewan})`,
    '',
    `Telah disembelih secara syar'i${order.lokasiRph ? ` di ${order.lokasiRph}` : ''}.`,
  ];
  if (order.dokumentasiVideoUrl) {
    lines.push(
      '',
      '📹 Video dokumentasi penyembelihan:',
      order.dokumentasiVideoUrl
    );
  }
  lines.push('', 'Jazakumullah Khairan Katsiran.');
  return lines.join('\n');
}

/**
 * Sends the slaughter report over the real WhatsApp service. Orders without a
 * valid number are skipped; `laporanTerkirimAt` is stamped only on success.
 */
const sendReport = adminProcedure
  .input(sendQurbanReportSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select(orderColumns)
      .from(qurbanOrders)
      .where(inArray(qurbanOrders.id, input.orderIds));
    const orders = await withSlots(context.db, rows);

    const results = await Promise.all(
      orders.map(async (order) => {
        const target = order.teleponPengqurban
          ? normalizeIndonesianPhone(order.teleponPengqurban)
          : null;
        if (!target) {
          return 'skipped' as const;
        }
        const ok = await sendWhatsAppMessage(target, reportMessage(order));
        if (!ok) {
          return 'failed' as const;
        }
        await context.db
          .update(qurbanOrders)
          .set({ laporanTerkirimAt: new Date().toISOString() })
          .where(eq(qurbanOrders.id, order.id));
        return 'sent' as const;
      })
    );

    return {
      sent: results.filter((r) => r === 'sent').length,
      skipped: results.filter((r) => r === 'skipped').length,
      failed: results.filter((r) => r === 'failed').length,
    };
  });

const distributionsList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: qurbanDistributionAllocations.id,
      hewanBatchId: qurbanDistributionAllocations.hewanBatchId,
      qurbanOrderId: qurbanDistributionAllocations.qurbanOrderId,
      jumlahBagian: qurbanDistributionAllocations.jumlahBagian,
      tanggalSalur: qurbanDistributionAllocations.tanggalSalur,
      buktiFotoUrl: qurbanDistributionAllocations.buktiFotoUrl,
      createdAt: qurbanDistributionAllocations.createdAt,
      jenisHewan: hewanBatches.jenisHewan,
      wilayahPenyaluran: hewanBatches.wilayahPenyaluran,
    })
    .from(qurbanDistributionAllocations)
    .leftJoin(
      hewanBatches,
      eq(hewanBatches.id, qurbanDistributionAllocations.hewanBatchId)
    )
    .orderBy(desc(qurbanDistributionAllocations.createdAt));
  return { data: rows };
});

const addDistribution = adminProcedure
  .input(allocationSchema)
  .handler(async ({ input, context }) => {
    const [batch] = await context.db
      .select({ id: hewanBatches.id })
      .from(hewanBatches)
      .where(eq(hewanBatches.id, input.hewanBatchId))
      .limit(1);
    if (!batch) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Batch hewan tidak ditemukan',
      });
    }
    const [row] = await context.db
      .insert(qurbanDistributionAllocations)
      .values({
        id: `QDA-${ulid()}`,
        hewanBatchId: input.hewanBatchId,
        qurbanOrderId: input.qurbanOrderId ?? null,
        jumlahBagian:
          input.jumlahBagian === undefined ? null : String(input.jumlahBagian),
        tanggalSalur: input.tanggalSalur ?? null,
        buktiFotoUrl: input.buktiFotoUrl ?? null,
      })
      .returning();
    return { success: true, data: row };
  });

export const qurban = {
  photoUploadUrl,
  batchesList,
  createBatch,
  updateBatch,
  deleteBatch,
  saveDocumentation,
  ordersList,
  createOrder,
  updateOrder,
  deleteOrder,
  sendReport,
  distributionsList,
  addDistribution,
};

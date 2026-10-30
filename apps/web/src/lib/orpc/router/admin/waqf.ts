import {
  type AnalyticsPeriod,
  parseAnalyticsPeriod,
} from '@amwal/core/analytics/period';
import {
  createProgramSchema,
  deleteProgramSchema,
  mauqufAlaihSchema,
  progressSchema,
  receiptsSchema,
  recordYieldSchema,
  reviewWithdrawalSchema,
  updateNadzirPublicProfileSchema,
  updateProgramSchema,
  verifyNadzirSchema,
  verifyProgramSchema,
} from '@amwal/core/contracts/admin-waqf';
import { nextProgramCode } from '@amwal/core/payment/order-sequence';
import {
  approveWithdrawalTx,
  centsToNumeric,
  isWithdrawalInvariantError,
  toCents,
} from '@amwal/core/waqf/withdrawal';
import { sendWhatsAppNotification } from '@amwal/core/whatsapp/service';
import { ORPCError } from '@orpc/server';
import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { env } from '@/env/server';
import {
  certificates,
  fundWithdrawalRequests,
  mauqufAlaihDistributions,
  nadzirProfiles,
  programProgressReports,
  programReceiptAttachments,
  transactions,
  users,
  waqfOrders,
  waqfPrincipalLedgers,
  waqfPrograms,
  waqfYieldEntries,
} from '@/lib/db/schema';
import {
  publicMediaColumns,
  withMediaUrls,
  withoutUnchangedMedia,
} from '@/lib/waqf-media';
import { adminProcedure } from '../../procedures';
import { assertKategoriWaqafActive } from './master-data';

/**
 * oRPC admin.waqf router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/waqf.ts`. The withdrawal-approval Zone 0
 * invariant now lives in `@amwal/core/waqf/withdrawal`'s
 * `approveWithdrawalTx` (built on the untouched `disburse()` from
 * `@amwal/core/waqf/ledger`) — an over-draw throws before any row is
 * written, mapped here to `ORPCError('UNPROCESSABLE_CONTENT')` (422).
 */

function requireUser(context: { user: { userId: string } | null }) {
  if (!context.user) {
    // adminProcedure guarantees this is unreachable — narrows the type.
    throw new ORPCError('UNAUTHORIZED');
  }
  return context.user;
}

const programsList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: waqfPrograms.id,
      judul: waqfPrograms.judul,
      kategori: waqfPrograms.kategori,
      deskripsi: waqfPrograms.deskripsi,
      durasiHari: waqfPrograms.durasiHari,
      jenisWakaf: waqfPrograms.jenisWakaf,
      status: waqfPrograms.status,
      verificationStatus: waqfPrograms.verificationStatus,
      targetDana: waqfPrograms.targetDana,
      adminNotes: waqfPrograms.adminNotes,
      // Data URI banner/RAB/legalitas (hingga beberapa MB per program) tidak
      // ikut JSON; klien memuatnya lewat /api/waqf-media (QA-14).
      ...publicMediaColumns,
      updatedAt: waqfPrograms.updatedAt,
      provinsi: waqfPrograms.provinsi,
      kabupatenKota: waqfPrograms.kabupatenKota,
      kecamatan: waqfPrograms.kecamatan,
      kelurahanDesa: waqfPrograms.kelurahanDesa,
      kodeWilayah: waqfPrograms.kodeWilayah,
      createdAt: waqfPrograms.createdAt,
      nadzirProfileId: waqfPrograms.nadzirProfileId,
      namaLembaga: nadzirProfiles.namaLembaga,
      nadzirStatus: nadzirProfiles.statusVerifikasi,
      // Rekening program menang; program lama (kolom NULL) memakai rekening
      // Nadzir seperti sebelumnya.
      namaBank: sql<
        string | null
      >`coalesce(${waqfPrograms.namaBank}, ${nadzirProfiles.namaBank})`,
      nomorRekeningBank: sql<
        string | null
      >`coalesce(${waqfPrograms.nomorRekeningBank}, ${nadzirProfiles.nomorRekeningBank})`,
      atasNamaRekening: waqfPrograms.atasNamaRekening,
      pokokDanaTerkumpul: waqfPrincipalLedgers.pokokDanaTerkumpul,
      totalHasilAvailable: waqfPrincipalLedgers.totalHasilAvailable,
      hasilInvestasiTersalurkan: waqfPrincipalLedgers.hasilInvestasiTersalurkan,
      kodeProgram: waqfPrograms.kodeProgram,
      // Persentase fisik terbaru — tanpa ini, daftar program selalu tampil
      // 0% setelah refresh meski `program_progress_reports` sudah punya
      // riwayatnya (bug persistensi, bukan bug penyimpanan).
      latestProgressFisik: sql<string | null>`(
        select ${programProgressReports.persentaseFisik}
        from ${programProgressReports}
        where ${programProgressReports.waqfProgramId} = ${waqfPrograms.id}
        order by ${programProgressReports.createdAt} desc
        limit 1
      )`,
    })
    .from(waqfPrograms)
    .leftJoin(
      nadzirProfiles,
      eq(nadzirProfiles.id, waqfPrograms.nadzirProfileId)
    )
    .leftJoin(
      waqfPrincipalLedgers,
      eq(waqfPrincipalLedgers.waqfProgramId, waqfPrograms.id)
    )
    .orderBy(desc(waqfPrograms.createdAt));

  return { data: rows.map(withMediaUrls) };
});

/**
 * Program dibuat langsung LIVE oleh admin (bukan diajukan Nadzir lewat
 * portalnya) — bagian dari alur "Terbitkan Program Baru" di /admin/wakaf.
 * `waqfPrincipalLedgers` diinisiasi nol di sini karena `programsList`/publik
 * `waqf.list` mengandalkan left-join ke ledger untuk `pokokDanaTerkumpul`.
 */
const createProgram = adminProcedure
  .input(createProgramSchema)
  .handler(async ({ input, context }) => {
    await assertKategoriWaqafActive(context.db, input.kategori);
    const id = ulid().toLowerCase();
    const now = new Date();
    const nowIso = now.toISOString();

    const program = await context.db.transaction(async (tx) => {
      const kodeProgram = await nextProgramCode(tx, {
        module: 'WAQF',
        at: now,
      });

      const [row] = await tx
        .insert(waqfPrograms)
        .values({
          id,
          nadzirProfileId: input.nadzirProfileId,
          kodeProgram,
          judul: input.judul,
          kategori: input.kategori,
          deskripsi: input.deskripsi,
          targetDana: input.targetDana.toString(),
          durasiHari: input.durasiHari,
          bannerUrl: input.bannerUrl ?? null,
          rabDocumentUrl: input.rabDocumentUrl ?? null,
          dokumenLegalitasUrl: input.dokumenLegalitasUrl ?? null,
          provinsi: input.provinsi ?? null,
          kabupatenKota: input.kabupatenKota ?? null,
          kecamatan: input.kecamatan ?? null,
          kelurahanDesa: input.kelurahanDesa ?? null,
          kodeWilayah: input.kodeWilayah ?? null,
          namaBank: input.namaBank ?? null,
          nomorRekeningBank: input.nomorRekeningBank ?? null,
          atasNamaRekening: input.atasNamaRekening ?? null,
          jenisWakaf: input.jenisWakaf,
          status: 'LIVE',
          updatedAt: nowIso,
        })
        .returning();

      await tx.insert(waqfPrincipalLedgers).values({
        id: ulid().toLowerCase(),
        waqfProgramId: id,
        updatedAt: nowIso,
      });

      return row;
    });

    return { data: program };
  });

/**
 * Program tidak pernah kehilangan Nadzir/akad/status verifikasi lewat form
 * ini — hanya metadata tampilan, target dana/durasi, dan wilayah/dokumen
 * pendukung. Field yang tidak dikirim (`undefined`) tidak disentuh sama
 * sekali (drizzle melewati key `undefined` di `.set()`), jadi mengedit nama
 * program saja tidak pernah menimpa wilayah yang sudah tersimpan.
 */
const updateProgram = adminProcedure
  .input(updateProgramSchema)
  .handler(async ({ input, context }) => {
    const { id, targetDana, ...rest } = input;
    // Form mengirim balik tautan /api/waqf-media yang ia terima dari daftar:
    // itu berarti "tidak diubah", jangan timpa data URI yang tersimpan.
    const fields = withoutUnchangedMedia(rest);
    const now = new Date().toISOString();

    if (fields.kategori !== undefined) {
      // Program lama boleh tetap memakai kategori yang kini nonaktif; hanya
      // penggantian kategori yang divalidasi.
      const [current] = await context.db
        .select({ kategori: waqfPrograms.kategori })
        .from(waqfPrograms)
        .where(eq(waqfPrograms.id, id))
        .limit(1);
      if (current && current.kategori !== fields.kategori) {
        await assertKategoriWaqafActive(context.db, fields.kategori);
      }
    }

    const [program] = await context.db
      .update(waqfPrograms)
      .set({
        ...fields,
        targetDana:
          targetDana === undefined ? undefined : targetDana.toString(),
        updatedAt: now,
      })
      .where(eq(waqfPrograms.id, id))
      .returning();

    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }
    return { data: program };
  });

/**
 * Penghapusan sengaja dibatasi ke program yang belum pernah menerima donasi
 * (tidak ada baris `waqf_orders`) — begitu wakif pertama membayar, program
 * terikat ledger pokok Zone 0 (`waqf_principal_ledgers`) dan penghapusan
 * baris tidak lagi aman/bermakna secara fiqih; alur yang benar untuk
 * program yang sudah berjalan adalah menon-aktifkannya, bukan menghapusnya.
 * Program percobaan/salah-input (belum ada donasi) tetap bisa dihapus utuh.
 */
const deleteProgram = adminProcedure
  .input(deleteProgramSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: waqfPrograms.id })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.id))
      .limit(1);
    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }

    // Setiap jejak aktivitas keuangan (donasi, hasil investasi, pengajuan
    // pencairan, penyaluran mauquf 'alaih) mengunci program — hanya program
    // percobaan yang benar-benar kosong yang boleh dihapus utuh.
    const [order] = await context.db
      .select({ id: waqfOrders.id })
      .from(waqfOrders)
      .where(eq(waqfOrders.waqfProgramId, input.id))
      .limit(1);
    const [yieldEntry] = await context.db
      .select({ id: waqfYieldEntries.id })
      .from(waqfYieldEntries)
      .where(eq(waqfYieldEntries.waqfProgramId, input.id))
      .limit(1);
    const [withdrawal] = await context.db
      .select({ id: fundWithdrawalRequests.id })
      .from(fundWithdrawalRequests)
      .where(eq(fundWithdrawalRequests.waqfProgramId, input.id))
      .limit(1);
    const [distribution] = await context.db
      .select({ id: mauqufAlaihDistributions.id })
      .from(mauqufAlaihDistributions)
      .where(eq(mauqufAlaihDistributions.waqfProgramId, input.id))
      .limit(1);
    if (order || yieldEntry || withdrawal || distribution) {
      throw new ORPCError('CONFLICT', {
        message:
          'Program sudah memiliki aktivitas keuangan (donasi/hasil/pencairan/penyaluran) dan tidak dapat dihapus. Non-aktifkan program alih-alih menghapusnya.',
      });
    }

    await context.db.transaction(async (tx) => {
      // Bukti kuitansi/progres fisik adalah metadata operasional program,
      // bukan riwayat keuangan Zone 0 — aman ikut terhapus (berbeda dari
      // `waqf_orders`, yang justru memblokir penghapusan di atas).
      await tx
        .delete(programReceiptAttachments)
        .where(eq(programReceiptAttachments.waqfProgramId, input.id));
      await tx
        .delete(programProgressReports)
        .where(eq(programProgressReports.waqfProgramId, input.id));
      await tx
        .delete(waqfPrincipalLedgers)
        .where(eq(waqfPrincipalLedgers.waqfProgramId, input.id));
      await tx.delete(waqfPrograms).where(eq(waqfPrograms.id, input.id));
    });

    return { success: true };
  });

const programDetail = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const [program] = await context.db
      .select()
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.id))
      .limit(1);
    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }

    const [ledger] = await context.db
      .select()
      .from(waqfPrincipalLedgers)
      .where(eq(waqfPrincipalLedgers.waqfProgramId, input.id))
      .limit(1);
    const progress = await context.db
      .select()
      .from(programProgressReports)
      .where(eq(programProgressReports.waqfProgramId, input.id))
      .orderBy(desc(programProgressReports.createdAt));

    return { data: { program, ledger: ledger ?? null, progress } };
  });

const verifyProgram = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(verifyProgramSchema))
  .handler(async ({ input, context }) => {
    const admin = requireUser(context);
    const now = new Date().toISOString();
    const [program] = await context.db
      .update(waqfPrograms)
      .set({
        verificationStatus: input.status,
        adminNotes: input.adminNotes ?? null,
        verifiedById: admin.userId,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(waqfPrograms.id, input.id))
      .returning();
    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }
    return { success: true, data: program };
  });

const progressList = adminProcedure
  .input(
    z.object({
      id: z.string().min(1),
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [eq(programProgressReports.waqfProgramId, input.id)];

    if (input.year !== undefined) {
      let period: AnalyticsPeriod;
      try {
        period = parseAnalyticsPeriod({ year: input.year, month: input.month });
      } catch (err) {
        throw new ORPCError('BAD_REQUEST', {
          message:
            err instanceof Error ? err.message : 'INVALID_ANALYTICS_PERIOD',
        });
      }
      const start = period.startDate.toISOString();
      const endExclusive = new Date(
        period.endDate.getTime() + 1000
      ).toISOString();
      conditions.push(
        gte(programProgressReports.createdAt, start),
        lt(programProgressReports.createdAt, endExclusive)
      );
    }

    const rows = await context.db
      .select({
        ...getTableColumns(programProgressReports),
        createdByName: users.name,
      })
      .from(programProgressReports)
      .leftJoin(users, eq(users.id, programProgressReports.createdById))
      .where(and(...conditions))
      .orderBy(desc(programProgressReports.createdAt));
    return { data: rows };
  });

const addProgress = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(progressSchema))
  .handler(async ({ input, context }) => {
    const admin = requireUser(context);

    return await context.db.transaction(async (tx) => {
      const [program] = await tx
        .select({ id: waqfPrograms.id })
        .from(waqfPrograms)
        .where(eq(waqfPrograms.id, input.id))
        .limit(1);

      if (!program) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Program wakaf tidak ditemukan',
        });
      }

      // Invarian Bukti Foto: Wajib memiliki minimal satu foto bukti fisik/kegiatan/progres
      let hasPhotoEvidence = false;

      if (input.attachmentIds && input.attachmentIds.length > 0) {
        const attachments = await tx
          .select()
          .from(programReceiptAttachments)
          .where(
            and(
              eq(programReceiptAttachments.waqfProgramId, input.id),
              inArray(programReceiptAttachments.id, input.attachmentIds)
            )
          );

        if (attachments.length !== input.attachmentIds.length) {
          throw new ORPCError('BAD_REQUEST', {
            message:
              'Satu atau lebih lampiran tidak ditemukan pada program ini',
          });
        }

        hasPhotoEvidence = attachments.some(
          (att) => att.isPhotoEvidence === true
        );
      } else {
        const [existingPhoto] = await tx
          .select({ id: programReceiptAttachments.id })
          .from(programReceiptAttachments)
          .where(
            and(
              eq(programReceiptAttachments.waqfProgramId, input.id),
              eq(programReceiptAttachments.isPhotoEvidence, true)
            )
          )
          .limit(1);

        hasPhotoEvidence = Boolean(existingPhoto);
      }

      if (!hasPhotoEvidence) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Butuh minimal satu foto bukti',
        });
      }

      const reportId = `PPR-${ulid()}`;
      const [row] = await tx
        .insert(programProgressReports)
        .values({
          id: reportId,
          waqfProgramId: input.id,
          persentaseFisik: String(input.persentaseFisik),
          deskripsi: input.deskripsi,
          kuitansiUrls: input.kuitansiUrls ?? [],
          createdById: admin.userId,
        })
        .returning();

      if (input.attachmentIds && input.attachmentIds.length > 0) {
        await tx
          .update(programReceiptAttachments)
          .set({ progressReportId: reportId })
          .where(inArray(programReceiptAttachments.id, input.attachmentIds));
      }

      return { success: true, data: row };
    });
  });

const updateReceipts = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(receiptsSchema))
  .handler(async ({ input, context }) => {
    const programId = input.id;
    const [target] = input.progressReportId
      ? await context.db
          .select()
          .from(programProgressReports)
          .where(eq(programProgressReports.id, input.progressReportId))
          .limit(1)
      : await context.db
          .select()
          .from(programProgressReports)
          .where(eq(programProgressReports.waqfProgramId, programId))
          .orderBy(desc(programProgressReports.createdAt))
          .limit(1);

    if (!target || target.waqfProgramId !== programId) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Laporan progres tidak ditemukan',
      });
    }

    const existing = Array.isArray(target.kuitansiUrls)
      ? (target.kuitansiUrls as string[])
      : [];
    const merged = [...new Set([...existing, ...input.kuitansiUrls])];
    const [row] = await context.db
      .update(programProgressReports)
      .set({ kuitansiUrls: merged })
      .where(eq(programProgressReports.id, target.id))
      .returning();
    return { success: true, data: row };
  });

const mauqufAlaihList = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(mauqufAlaihDistributions)
      .where(eq(mauqufAlaihDistributions.waqfProgramId, input.id));
    return { data: rows };
  });

const addMauqufAlaih = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(mauqufAlaihSchema))
  .handler(async ({ input, context }) => {
    const [program] = await context.db
      .select({ id: waqfPrograms.id })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.id))
      .limit(1);
    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }
    const [row] = await context.db
      .insert(mauqufAlaihDistributions)
      .values({
        id: `MAD-${ulid()}`,
        waqfProgramId: input.id,
        withdrawalRequestId: input.withdrawalRequestId ?? null,
        namaPenerimaManfaat: input.namaPenerimaManfaat,
        kategoriPenerima: input.kategoriPenerima ?? null,
        nominalDisalurkan:
          input.nominalDisalurkan === undefined
            ? null
            : String(input.nominalDisalurkan),
        barangDisalurkan: input.barangDisalurkan ?? null,
        tanggalPenyaluran: input.tanggalPenyaluran ?? null,
        buktiPenyaluranUrl: input.buktiPenyaluranUrl ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return { success: true, data: row };
  });

const recordYield = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(recordYieldSchema))
  .handler(async ({ input, context }) => {
    const admin = requireUser(context);
    const amount = String(input.nominal) as `${number}`;
    const now = new Date().toISOString();

    const [program] = await context.db
      .select({ id: waqfPrograms.id })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.id));
    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }

    const entry = await context.db.transaction(async (tx) => {
      const [yieldEntry] = await tx
        .insert(waqfYieldEntries)
        .values({
          id: `YLD-${ulid()}`,
          waqfProgramId: input.id,
          amount,
          sourceDescription: input.description,
          recordedByAdminId: admin.userId,
          recordedAt: input.periodDate,
        })
        .returning();

      const [ledger] = await tx
        .select()
        .from(waqfPrincipalLedgers)
        .where(eq(waqfPrincipalLedgers.waqfProgramId, input.id))
        .limit(1);

      const nextYield = centsToNumeric(
        toCents(ledger?.totalHasilAvailable ?? '0') + toCents(amount)
      );

      if (ledger) {
        await tx
          .update(waqfPrincipalLedgers)
          .set({ totalHasilAvailable: nextYield, updatedAt: now })
          .where(eq(waqfPrincipalLedgers.id, ledger.id));
      } else {
        await tx.insert(waqfPrincipalLedgers).values({
          id: `WPL-${ulid()}`,
          waqfProgramId: input.id,
          totalHasilAvailable: nextYield,
          updatedAt: now,
        });
      }

      return yieldEntry;
    });

    return { success: true, data: entry };
  });

const withdrawalsList = adminProcedure
  .input(
    z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const base = context.db
      .select({
        id: fundWithdrawalRequests.id,
        waqfProgramId: fundWithdrawalRequests.waqfProgramId,
        amount: fundWithdrawalRequests.amount,
        peruntukan: fundWithdrawalRequests.peruntukan,
        rekeningTujuan: fundWithdrawalRequests.rekeningTujuan,
        status: fundWithdrawalRequests.status,
        adminNotes: fundWithdrawalRequests.adminNotes,
        createdAt: fundWithdrawalRequests.createdAt,
        reviewedAt: fundWithdrawalRequests.reviewedAt,
        judul: waqfPrograms.judul,
        jenisWakaf: waqfPrograms.jenisWakaf,
        // Pengaju ditampilkan peninjau sebelum menyetujui pencairan; hanya
        // nama & email yang dipilih dari akun.
        requestedByName: users.name,
        requestedByEmail: users.email,
      })
      .from(fundWithdrawalRequests)
      .leftJoin(
        waqfPrograms,
        eq(waqfPrograms.id, fundWithdrawalRequests.waqfProgramId)
      )
      .leftJoin(users, eq(users.id, fundWithdrawalRequests.requestedById))
      .orderBy(desc(fundWithdrawalRequests.createdAt));

    const rows = input.status
      ? await base.where(eq(fundWithdrawalRequests.status, input.status))
      : await base;
    return { data: rows };
  });

const reviewWithdrawal = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(reviewWithdrawalSchema))
  .handler(async ({ input, context }) => {
    const admin = requireUser(context);
    const now = new Date().toISOString();

    if (input.action === 'REJECT') {
      const [rejected] = await context.db
        .update(fundWithdrawalRequests)
        .set({
          status: 'REJECTED',
          adminNotes: input.adminNotes ?? '',
          approvedById: admin.userId,
          reviewedAt: now,
        })
        .where(eq(fundWithdrawalRequests.id, input.id))
        .returning();
      if (!rejected) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Permintaan pencairan tidak ditemukan',
        });
      }
      return { success: true, data: rejected };
    }

    try {
      const result = await context.db.transaction((tx) =>
        approveWithdrawalTx(tx, {
          requestId: input.id,
          adminId: admin.userId,
          adminNotes: input.adminNotes ?? null,
          now,
        })
      );

      if (result.kind === 'notFound') {
        throw new ORPCError('NOT_FOUND', {
          message: 'Permintaan pencairan tidak ditemukan',
        });
      }
      if (result.kind === 'alreadyReviewed') {
        throw new ORPCError('CONFLICT', {
          message: 'Permintaan pencairan sudah direview',
        });
      }
      if (result.kind === 'ledgerMissing') {
        throw new ORPCError('NOT_FOUND', {
          message: 'Ledger program wakaf tidak ditemukan',
        });
      }
      return { success: true, data: result.row };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      if (isWithdrawalInvariantError(error)) {
        const message =
          error instanceof Error ? error.message : 'Pencairan ditolak';
        throw new ORPCError('UNPROCESSABLE_CONTENT', {
          message: `Pencairan melanggar invarian ledger: ${message}`,
        });
      }
      throw error;
    }
  });

/**
 * Seluruh kolom profil tetap dikembalikan apa adanya, ditambah kontak akun
 * ketua dari `users` — dibutuhkan peninjau untuk menghubungi lembaga sebelum
 * memutuskan verifikasi. Hanya kontak yang dipilih; `password_hash` dan kolom
 * akun lain tidak pernah ikut.
 */
const nadzirList = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      ...getTableColumns(nadzirProfiles),
      userName: users.name,
      userEmail: users.email,
      userPhone: users.phone,
    })
    .from(nadzirProfiles)
    .leftJoin(users, eq(users.id, nadzirProfiles.userId))
    .orderBy(desc(nadzirProfiles.createdAt));
  return { data: rows };
});

const verifyNadzir = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(verifyNadzirSchema))
  .handler(async ({ input, context }) => {
    const admin = requireUser(context);
    const now = new Date().toISOString();
    const [row] = await context.db
      .update(nadzirProfiles)
      .set({
        statusVerifikasi: input.status,
        verifiedById: admin.userId,
        verifiedAt: now,
        updatedAt: now,
        ...(input.status === 'VERIFIED' && input.nomorRegistrasiBwi
          ? { nomorRegistrasiBwi: input.nomorRegistrasiBwi }
          : {}),
        ...(input.status === 'VERIFIED' && input.kontakPublik
          ? { kontakPublik: input.kontakPublik }
          : {}),
      })
      .where(eq(nadzirProfiles.id, input.id))
      .returning();
    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Profil Nadzir tidak ditemukan',
      });
    }
    return { success: true, data: row };
  });

/** Ubah nomor BWI / narahubung publik lembaga (D6); kosong = hapus nilainya. */
const updateNadzirPublicProfile = adminProcedure
  .input(updateNadzirPublicProfileSchema)
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .update(nadzirProfiles)
      .set({
        updatedAt: new Date().toISOString(),
        ...(input.nomorRegistrasiBwi !== undefined && {
          nomorRegistrasiBwi: input.nomorRegistrasiBwi || null,
        }),
        ...(input.kontakPublik !== undefined && {
          kontakPublik: input.kontakPublik || null,
        }),
      })
      .where(eq(nadzirProfiles.id, input.id))
      .returning();
    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Profil Nadzir tidak ditemukan',
      });
    }
    return { success: true, data: row };
  });

/**
 * Daftar wakif riil satu program — dipakai tab "Daftar Wakif" pada workbench.
 * Nama TIDAK disamarkan seperti `waqf.donatur` publik: register legal
 * (AIW/sertifikat) dan siaran WA butuh identitas & nomor telepon asli,
 * anonimitas donor hanya berlaku untuk tampilan publik.
 */
const wakifList = adminProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: waqfOrders.id,
        namaWakif: waqfOrders.namaWakif,
        noTelepon: waqfOrders.noTelepon,
        nominal: waqfOrders.nominal,
        bentukWakaf: waqfOrders.bentukWakaf,
        nomorKwitansi: waqfOrders.nomorKwitansi,
        createdAt: waqfOrders.createdAt,
        statusPembayaran: transactions.statusPembayaran,
        nomorInternalAmwal: certificates.nomorInternalAmwal,
        nomorRegistrasiBwi: certificates.nomorRegistrasiBwi,
      })
      .from(waqfOrders)
      .leftJoin(transactions, eq(transactions.id, waqfOrders.transactionId))
      .leftJoin(
        certificates,
        eq(certificates.transactionId, waqfOrders.transactionId)
      )
      .where(eq(waqfOrders.waqfProgramId, input.id))
      .orderBy(desc(waqfOrders.createdAt))
      .limit(200);

    return { data: rows };
  });

const broadcastProgressSchema = z.object({
  id: z.string().min(1),
  message: z.string().trim().min(10),
});

// ponytail: pengiriman berurutan dengan jeda tetap, bukan antrean nyata —
// cukup untuk puluhan wakif per program; pindah ke antrean/backoff di
// apps/wa-bot kalau volume per siaran mulai ratusan.
const BROADCAST_SEND_DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Siaran update progres ke seluruh wakif bernomor telepon pada satu program,
 * lewat microservice Baileys (`sendWhatsAppNotification` — best-effort, tidak
 * pernah throw). Jeda antar-pesan adalah kesadaran anti-ban minimal; lihat
 * catatan `ponytail:` di atas untuk batas & jalur upgrade.
 */
const broadcastProgress = adminProcedure
  .input(broadcastProgressSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({ noTelepon: waqfOrders.noTelepon })
      .from(waqfOrders)
      .where(
        and(
          eq(waqfOrders.waqfProgramId, input.id),
          isNotNull(waqfOrders.noTelepon)
        )
      );

    const recipients = rows
      .map((row) => row.noTelepon)
      .filter((phone): phone is string => Boolean(phone?.trim()));

    let sent = 0;
    for (const [index, phone] of recipients.entries()) {
      if (index > 0) {
        await delay(BROADCAST_SEND_DELAY_MS);
      }
      const ok = await sendWhatsAppNotification(phone, input.message, {
        baileysServiceUrl: env.BAILEYS_SERVICE_URL,
        internalSecret: env.INTERNAL_SECRET,
      });
      if (ok) {
        sent += 1;
      }
    }

    return { data: { totalRecipients: recipients.length, sent } };
  });

export const waqf = {
  programsList,
  createProgram,
  updateProgram,
  deleteProgram,
  programDetail,
  verifyProgram,
  progressList,
  addProgress,
  updateReceipts,
  mauqufAlaihList,
  addMauqufAlaih,
  recordYield,
  withdrawalsList,
  reviewWithdrawal,
  nadzirList,
  verifyNadzir,
  updateNadzirPublicProfile,
  wakifList,
  broadcastProgress,
};

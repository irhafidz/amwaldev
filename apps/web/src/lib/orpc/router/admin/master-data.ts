import {
  CODED_MASTER_DEFAULTS,
  type CodedMasterDataType,
  createMasterDataItemSchema,
  DEFAULT_AKAD_WAQAF,
  DEFAULT_KATEGORI_WAQAF,
  DEFAULT_METODE_INFAQ,
  deleteMasterDataItemSchema,
  isCodedMasterDataType,
  listMasterDataSchema,
  type MasterDataType,
  syncMasterDataSchema,
  updateMasterDataItemSchema,
} from '@amwal/core/contracts/admin-master-data';
import { ORPCError } from '@orpc/server';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '@/lib/db';
import {
  akadWaqafMaster,
  infaqOrders,
  jenisInfaqMaster,
  jenisZakatMaster,
  kategoriWaqafMaster,
  metodeInfaqMaster,
  waqfPrograms,
} from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin Master Data router (Sprint 12, draft "[Add] Master Data - Dashboard
 * Admin") — CRUD over the picklist tables, guarded by `adminProcedure`. One
 * shape, routed by `type` to the right table.
 *
 * `JENIS_ZAKAT` / `JENIS_INFAQ` are coded lists: their `kode` is bound to the
 * order tables' enum/CHECK (shared with the legacy Next.js app), so rows can
 * only be added by `sync` and never deleted — admins rename, reorder, and
 * (de)activate them instead.
 */

type PlainMasterTable = typeof kategoriWaqafMaster;
type LabelMasterTable = typeof kategoriWaqafMaster | typeof metodeInfaqMaster;
type ZakatTypeCode = (typeof jenisZakatMaster.$inferInsert)['kode'];

/**
 * Every picklist table shares the same base columns (`id`, `label`,
 * `description`, `isActive`, `sortOrder`, `createdAt`); the coded tables only
 * add `kode`. Viewing them through the plain shape keeps update/list generic.
 */
function tableFor(type: MasterDataType): PlainMasterTable {
  const tables: Record<MasterDataType, unknown> = {
    AKAD_WAQAF: akadWaqafMaster,
    KATEGORI_WAQAF: kategoriWaqafMaster,
    JENIS_ZAKAT: jenisZakatMaster,
    JENIS_INFAQ: jenisInfaqMaster,
    METODE_INFAQ: metodeInfaqMaster,
  };
  return tables[type] as PlainMasterTable;
}

/** Inserts any DB-allowed code that has no master row yet; returns the count. */
export async function syncCodes(
  database: Database,
  type: CodedMasterDataType
): Promise<number> {
  const values = CODED_MASTER_DEFAULTS[type].map((item, index) => ({
    id: ulid().toLowerCase(),
    kode: item.kode,
    label: item.label,
    sortOrder: index,
  }));
  const inserted =
    type === 'JENIS_ZAKAT'
      ? await database
          .insert(jenisZakatMaster)
          .values(
            values.map((v) => ({
              ...v,
              kode: v.kode as ZakatTypeCode,
            }))
          )
          .onConflictDoNothing({ target: jenisZakatMaster.kode })
          .returning({ id: jenisZakatMaster.id })
      : await database
          .insert(jenisInfaqMaster)
          .values(values)
          .onConflictDoNothing({ target: jenisInfaqMaster.kode })
          .returning({ id: jenisInfaqMaster.id });
  return inserted.length;
}

/**
 * Inserts every candidate label that has no row yet (case-insensitive), after
 * the existing rows in sort order. Returns how many were added.
 */
async function insertMissingLabels(
  database: Database,
  table: LabelMasterTable,
  candidates: readonly string[]
): Promise<number> {
  const existing = await database.select({ label: table.label }).from(table);
  const known = new Set(existing.map((r) => r.label.trim().toLowerCase()));
  const missing: string[] = [];
  for (const label of candidates) {
    const key = label.trim().toLowerCase();
    if (key && !known.has(key)) {
      known.add(key);
      missing.push(label.trim());
    }
  }
  if (missing.length === 0) {
    return 0;
  }
  await database.insert(table).values(
    missing.map((label, index) => ({
      id: ulid().toLowerCase(),
      label,
      sortOrder: existing.length + index,
    }))
  );
  return missing.length;
}

/**
 * Adds the default channels plus every channel already used by recorded
 * manual donations, so the dropdown matches what is in the books.
 */
async function syncMetodeInfaq(database: Database): Promise<number> {
  const used = await database
    .selectDistinct({ label: infaqOrders.metodeManual })
    .from(infaqOrders)
    .where(isNotNull(infaqOrders.metodeManual));
  return insertMissingLabels(database, metodeInfaqMaster, [
    ...DEFAULT_METODE_INFAQ,
    ...used.map((r) => r.label ?? ''),
  ]);
}

/** Kategori hardcode lama + setiap kategori yang sudah dipakai program. */
async function syncKategoriWaqaf(database: Database): Promise<number> {
  const used = await database
    .selectDistinct({ label: waqfPrograms.kategori })
    .from(waqfPrograms)
    .where(isNotNull(waqfPrograms.kategori));
  return insertMissingLabels(database, kategoriWaqafMaster, [
    ...DEFAULT_KATEGORI_WAQAF,
    ...used.map((r) => r.label ?? ''),
  ]);
}

/**
 * Akad yang ditawarkan form lama (Wakaf Melalui Uang → HABIS_PAKAI) plus
 * setiap jenis wakaf yang sudah dipakai program, masing-masing satu akad bila
 * belum ada akad yang memetakannya.
 */
async function syncAkadWaqaf(database: Database): Promise<number> {
  const [existing, used] = await Promise.all([
    database
      .select({
        label: akadWaqafMaster.label,
        jenisWakaf: akadWaqafMaster.jenisWakaf,
      })
      .from(akadWaqafMaster),
    database
      .selectDistinct({ jenisWakaf: waqfPrograms.jenisWakaf })
      .from(waqfPrograms),
  ]);
  const mapped = new Set(existing.map((r) => r.jenisWakaf).filter(Boolean));
  const labels = new Set(existing.map((r) => r.label.trim().toLowerCase()));
  const codes = new Set<keyof typeof DEFAULT_AKAD_WAQAF>([
    'HABIS_PAKAI',
    ...used.map((r) => r.jenisWakaf),
  ]);
  const missing = [...codes].filter(
    (code) =>
      !(
        mapped.has(code) ||
        labels.has(DEFAULT_AKAD_WAQAF[code].trim().toLowerCase())
      )
  );
  if (missing.length === 0) {
    return 0;
  }
  await database.insert(akadWaqafMaster).values(
    missing.map((code, index) => ({
      id: ulid().toLowerCase(),
      label: DEFAULT_AKAD_WAQAF[code],
      jenisWakaf: code,
      sortOrder: existing.length + index,
    }))
  );
  return missing.length;
}

async function listCoded(
  database: Database,
  type: CodedMasterDataType,
  activeOnly: boolean | undefined
) {
  const table = type === 'JENIS_ZAKAT' ? jenisZakatMaster : jenisInfaqMaster;
  const rows = await database
    .select({
      id: table.id,
      kode: sql<string>`${table.kode}::text`,
      label: table.label,
      description: table.description,
      isActive: table.isActive,
      sortOrder: table.sortOrder,
      createdAt: table.createdAt,
    })
    .from(table)
    .where(activeOnly ? eq(table.isActive, true) : undefined)
    .orderBy(asc(table.sortOrder), asc(table.label));
  return rows;
}

const list = adminProcedure
  .input(listMasterDataSchema)
  .handler(async ({ input, context }) => {
    if (isCodedMasterDataType(input.type)) {
      // Dropdowns must never come up empty: fill in missing codes on read.
      await syncCodes(context.db, input.type);
      const rows = await listCoded(context.db, input.type, input.activeOnly);
      return { data: rows.map((row) => ({ ...row, jenisWakaf: null })) };
    }
    const table = tableFor(input.type);
    const rows = await context.db
      .select()
      .from(table)
      .where(input.activeOnly ? eq(table.isActive, true) : undefined)
      .orderBy(asc(table.sortOrder), asc(table.label));
    return {
      data: rows.map((row) => ({
        ...row,
        kode: null,
        // Only `akad_waqaf_master` carries the jenis-wakaf mapping.
        jenisWakaf:
          (row as { jenisWakaf?: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL' | null })
            .jenisWakaf ?? null,
      })),
    };
  });

/** Runs the sync for one picklist; returns how many rows were added. */
export function syncMasterData(
  database: Database,
  type: MasterDataType
): Promise<number> {
  if (isCodedMasterDataType(type)) {
    return syncCodes(database, type);
  }
  const syncers: Record<
    Exclude<MasterDataType, CodedMasterDataType>,
    (db: Database) => Promise<number>
  > = {
    AKAD_WAQAF: syncAkadWaqaf,
    KATEGORI_WAQAF: syncKategoriWaqaf,
    METODE_INFAQ: syncMetodeInfaq,
  };
  return syncers[type](database);
}

const sync = adminProcedure
  .input(syncMasterDataSchema)
  .handler(async ({ input, context }) => ({
    added: await syncMasterData(context.db, input.type),
  }));

const create = adminProcedure
  .input(createMasterDataItemSchema)
  .handler(async ({ input, context }) => {
    if (isCodedMasterDataType(input.type)) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Jenis zakat/infaq terikat ke kode di basis data; gunakan Sinkronkan untuk menambah jenis',
      });
    }
    const values = {
      id: ulid().toLowerCase(),
      label: input.label,
      description: input.description || null,
      sortOrder: input.sortOrder,
    };
    if (input.type === 'AKAD_WAQAF') {
      if (!input.jenisWakaf) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Pilih jenis wakaf yang dipakai akad ini',
        });
      }
      const [created] = await context.db
        .insert(akadWaqafMaster)
        .values({ ...values, jenisWakaf: input.jenisWakaf })
        .returning();
      return created;
    }
    const [created] = await context.db
      .insert(tableFor(input.type))
      .values(values)
      .returning();
    return created;
  });

const update = adminProcedure
  .input(updateMasterDataItemSchema)
  .handler(async ({ input, context }) => {
    const table = tableFor(input.type);
    const [existing] = await context.db
      .select()
      .from(table)
      .where(eq(table.id, input.id))
      .limit(1);
    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Data tidak ditemukan' });
    }

    const values = {
      label: input.label ?? existing.label,
      description:
        input.description !== undefined
          ? input.description || null
          : existing.description,
      isActive: input.isActive ?? existing.isActive,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    };
    if (input.type === 'AKAD_WAQAF') {
      const [updated] = await context.db
        .update(akadWaqafMaster)
        .set({ ...values, jenisWakaf: input.jenisWakaf })
        .where(eq(akadWaqafMaster.id, input.id))
        .returning();
      return updated;
    }
    const [updated] = await context.db
      .update(table)
      .set(values)
      .where(eq(table.id, input.id))
      .returning();

    return updated;
  });

const deleteItem = adminProcedure
  .input(deleteMasterDataItemSchema)
  .handler(async ({ input, context }) => {
    if (isCodedMasterDataType(input.type)) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Jenis zakat/infaq tidak dapat dihapus karena dipakai transaksi; nonaktifkan saja',
      });
    }
    const table = tableFor(input.type);
    const [existing] = await context.db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, input.id))
      .limit(1);
    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Data tidak ditemukan' });
    }

    await context.db.delete(table).where(eq(table.id, input.id));
    return { success: true, id: input.id };
  });

/**
 * Tolak jenis yang dinonaktifkan admin di master data. Jenis tanpa baris
 * master (belum pernah disinkronkan) tetap lolos — enum/CHECK DB sudah
 * menjamin kodenya valid.
 */
export async function assertJenisActive(
  database: Database,
  type: CodedMasterDataType,
  kode: string
): Promise<void> {
  const table = type === 'JENIS_ZAKAT' ? jenisZakatMaster : jenisInfaqMaster;
  const [row] = await database
    .select({ isActive: table.isActive, label: table.label })
    .from(table)
    .where(sql`${table.kode}::text = ${kode}`)
    .limit(1);
  if (row && !row.isActive) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Jenis "${row.label}" sedang dinonaktifkan di Master Data`,
    });
  }
}

/**
 * Nilai teks bebas (metode infaq, kategori wakaf) harus salah satu label
 * aktif di master data. Master yang masih kosong tidak memblokir apa pun.
 */
async function assertLabelActive(
  database: Database,
  table: LabelMasterTable,
  label: string,
  what: string
): Promise<void> {
  const rows = await database
    .select({ label: table.label })
    .from(table)
    .where(eq(table.isActive, true));
  if (rows.length === 0) {
    return;
  }
  const wanted = label.trim().toLowerCase();
  if (!rows.some((r) => r.label.trim().toLowerCase() === wanted)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `${what} "${label}" tidak aktif di Master Data`,
    });
  }
}

export function assertMetodeInfaqActive(database: Database, label: string) {
  return assertLabelActive(database, metodeInfaqMaster, label, 'Metode');
}

export function assertKategoriWaqafActive(database: Database, label: string) {
  return assertLabelActive(database, kategoriWaqafMaster, label, 'Kategori');
}

export const masterData = {
  list,
  sync,
  create,
  update,
  delete: deleteItem,
};

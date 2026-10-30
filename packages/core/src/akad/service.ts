import { and, desc, eq, max } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { AkadModule, AkadTemplateSummary } from '../contracts/akad';
import { akadAcceptances, akadTemplates } from '../db/schema';
import type { Database } from '../db/types';

export type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export type DatabaseClient = Database | DatabaseTransaction;

export interface PublishVersionParams {
  module: AkadModule;
  title: string;
  body: string;
  createdById?: string | null;
}

export interface ActivateParams {
  module: AkadModule;
  version: number;
}

export interface RecordAkadAcceptanceParams {
  transactionId: string;
  templateId: string;
  version: number;
  bodySha256: string;
}

/**
 * Mengambil redaksi akad aktif untuk satu modul.
 * Mengembalikan null bila modul belum memiliki versi aktif.
 */
export async function getActive(
  db: DatabaseClient,
  module: AkadModule
): Promise<AkadTemplateSummary | null> {
  const [row] = await db
    .select()
    .from(akadTemplates)
    .where(
      and(eq(akadTemplates.module, module), eq(akadTemplates.isActive, true))
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    module: row.module as AkadModule,
    version: row.version,
    title: row.title,
    body: row.body,
    isActive: row.isActive,
    createdById: row.createdById,
    createdAt: row.createdAt,
  };
}

/**
 * Mengambil seluruh riwayat versi akad untuk satu modul, berurutan dari versi terbaru.
 */
export async function getVersions(
  db: DatabaseClient,
  module: AkadModule
): Promise<AkadTemplateSummary[]> {
  const rows = await db
    .select()
    .from(akadTemplates)
    .where(eq(akadTemplates.module, module))
    .orderBy(desc(akadTemplates.version));

  return rows.map((row) => ({
    id: row.id,
    module: row.module as AkadModule,
    version: row.version,
    title: row.title,
    body: row.body,
    isActive: row.isActive,
    createdById: row.createdById,
    createdAt: row.createdAt,
  }));
}

/**
 * Menerbitkan versi baru templat akad. Versi yang diterbitkan berstatus nonaktif (isActive = false).
 * Versi dihitung atomik: version = max(version) + 1.
 */
export async function publishVersion(
  db: Database,
  params: PublishVersionParams
): Promise<AkadTemplateSummary> {
  return await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxVersion: max(akadTemplates.version) })
      .from(akadTemplates)
      .where(eq(akadTemplates.module, params.module));

    const nextVersion = (maxRow?.maxVersion ?? 0) + 1;
    const id = ulid();

    const [created] = await tx
      .insert(akadTemplates)
      .values({
        id,
        module: params.module,
        version: nextVersion,
        title: params.title.trim(),
        body: params.body.trim(),
        isActive: false,
        createdById: params.createdById ?? null,
      })
      .returning();

    if (!created) {
      throw new Error('FAILED_TO_PUBLISH_AKAD_TEMPLATE');
    }

    return {
      id: created.id,
      module: created.module as AkadModule,
      version: created.version,
      title: created.title,
      body: created.body,
      isActive: created.isActive,
      createdById: created.createdById,
      createdAt: created.createdAt,
    };
  });
}

/**
 * Mengaktifkan satu versi templat akad dalam transaksi atomik.
 * Menyetel isActive = false untuk semua versi modul terkait, lalu mengaktifkan versi target.
 */
export async function activate(
  db: Database,
  params: ActivateParams
): Promise<AkadTemplateSummary> {
  return await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(akadTemplates)
      .where(
        and(
          eq(akadTemplates.module, params.module),
          eq(akadTemplates.version, params.version)
        )
      )
      .limit(1);

    if (!target) {
      throw new Error('AKAD_TEMPLATE_NOT_FOUND');
    }

    // Nonaktifkan versi aktif sebelumnya jika ada
    await tx
      .update(akadTemplates)
      .set({ isActive: false })
      .where(
        and(
          eq(akadTemplates.module, params.module),
          eq(akadTemplates.isActive, true)
        )
      );

    // Aktifkan versi yang dipilih
    const [activated] = await tx
      .update(akadTemplates)
      .set({ isActive: true })
      .where(eq(akadTemplates.id, target.id))
      .returning();

    if (!activated) {
      throw new Error('FAILED_TO_ACTIVATE_AKAD_TEMPLATE');
    }

    return {
      id: activated.id,
      module: activated.module as AkadModule,
      version: activated.version,
      title: activated.title,
      body: activated.body,
      isActive: activated.isActive,
      createdById: activated.createdById,
      createdAt: activated.createdAt,
    };
  });
}

/**
 * Mencatat persetujuan akad hukum ke tabel `akad_acceptances` di dalam transaksi anchor `createPayment`.
 */
export async function recordAkadAcceptance(
  tx: DatabaseClient,
  params: RecordAkadAcceptanceParams
): Promise<void> {
  await tx.insert(akadAcceptances).values({
    transactionId: params.transactionId,
    akadTemplateId: params.templateId,
    version: params.version,
    bodySha256: params.bodySha256,
  });
}

/**
 * Verifikasi migrasi 0004 terhadap database UJI.
 *
 * Dijalankan SETELAH `bun run db:migrate` diterapkan ke database uji
 * per-agent. Skrip ini tidak pernah menerapkan migrasi sendiri.
 *
 *   cd apps/web
 *   TEST_DATABASE_URL=postgres://...:5432/amwal_bun_pro_test bun run scripts/verify-0004.ts
 *
 * Dua lapis pemeriksaan:
 *
 *   STRUKTURAL — tabel, tipe kolom, constraint, dan index benar-benar ada di
 *   katalog Postgres. Murah dan menyeluruh.
 *
 *   PERILAKU   — invarian yang penting justru ditolak database saat dilanggar.
 *   Ini yang membedakan "kolomnya ada" dari "aturannya bekerja". Uji
 *   konkurensi order_sequences memakai koneksi terpisah karena race hanya
 *   muncul antar-koneksi, bukan di dalam satu transaksi.
 *
 * Nama database dijaga pola ^amwal_bun_[a-z0-9_]+_test$ — sama seperti
 * tests/test-database-guard.ts. Skrip menolak menyentuh database lain.
 */

import postgres from 'postgres';

const TEST_DATABASE_NAME = /^amwal_bun_[a-z0-9_]+_test$/;
const SEQUENCE_CEILING = 9999;
const PARALLEL_ORDERS = 20;
const TAG = `verify0004_${Date.now()}`;

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Menjalankan kueri yang SEHARUSNYA gagal; sukses berarti invarian bocor. */
async function expectRejection(
  name: string,
  run: () => Promise<unknown>,
  expectedFragment: string
): Promise<void> {
  try {
    await run();
    record(name, false, 'database MENERIMA data yang seharusnya ditolak');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const matched = message
      .toLowerCase()
      .includes(expectedFragment.toLowerCase());
    record(
      name,
      matched,
      matched
        ? 'ditolak database seperti yang diharapkan'
        : `ditolak, tetapi bukan oleh aturan yang diuji: ${message.slice(0, 120)}`
    );
  }
}

function resolveTestUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL (atau DATABASE_URL) wajib diisi');
  }

  let name: string | null = null;
  try {
    name = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    name = null;
  }

  if (!(name && TEST_DATABASE_NAME.test(name))) {
    throw new Error(
      `Menolak menyentuh database "${name ?? 'URL tidak terbaca'}". ` +
        'Skrip ini hanya boleh dijalankan pada amwal_bun_<lane>_test.'
    );
  }

  const port = new URL(url).port;
  if (port !== '5432') {
    throw new Error(
      `Port ${port} ditolak. Hanya session mode 5432; pooler 6543 dilarang.`
    );
  }

  return url;
}

// --- STRUKTURAL -------------------------------------------------------------

async function checkStructure(sql: postgres.Sql): Promise<void> {
  console.log('\n--- STRUKTURAL ---');

  const expectedTables = [
    'order_sequences',
    'program_receipt_attachments',
    'affiliate_codes',
    'affiliate_attributions',
    'affiliate_clicks',
    'akad_templates',
    'akad_acceptances',
  ];
  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${expectedTables})
  `;
  const found = new Set(tables.map((t) => t.table_name));
  for (const t of expectedTables) {
    record(
      `tabel ${t} ada`,
      found.has(t),
      found.has(t) ? '' : 'TIDAK DITEMUKAN'
    );
  }

  // FK lampiran kuitansi wajib text, bukan integer — inti koreksi
  // CONTRACT-CHANGES 2026-09-16-02.
  const fkTypes = await sql<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'program_receipt_attachments'
      AND column_name IN ('waqf_program_id', 'progress_report_id')
  `;
  for (const col of fkTypes) {
    record(
      `program_receipt_attachments.${col.column_name} bertipe text`,
      col.data_type === 'text',
      `data_type = ${col.data_type}`
    );
  }

  const expectedConstraints = [
    'order_sequences_current_sequence_range',
    'program_receipt_attachments_mime_type_check',
    'program_receipt_attachments_file_size_check',
    'akad_templates_module_check',
    'akad_templates_version_check',
    'education_contents_status_check',
  ];
  const constraints = await sql<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND conname = ANY(${expectedConstraints})
  `;
  const foundConstraints = new Set(constraints.map((c) => c.conname));
  for (const c of expectedConstraints) {
    record(`CHECK ${c} terpasang`, foundConstraints.has(c), '');
  }

  const expectedIndexes = [
    'gamification_point_ledgers_idempotency_key_key',
    'affiliate_codes_code_key',
    'affiliate_clicks_code_hash_date_key',
    'akad_templates_module_version_key',
    'akad_templates_one_active_per_module',
    'program_receipt_attachments_object_key_key',
    'education_contents_slug_key',
  ];
  const indexes = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${expectedIndexes})
  `;
  const byName = new Map(indexes.map((i) => [i.indexname, i.indexdef]));
  for (const i of expectedIndexes) {
    record(`index ${i} terpasang`, byName.has(i), '');
  }

  // Dua index ini HARUS parsial. Kalau predikatnya hilang, index tetap ada
  // tetapi artinya berubah total: slug NULL jadi bentrok, dan template
  // non-aktif ikut terkunci.
  for (const partial of [
    'education_contents_slug_key',
    'akad_templates_one_active_per_module',
  ]) {
    const def = byName.get(partial) ?? '';
    record(
      `index ${partial} bersifat parsial (punya WHERE)`,
      def.includes(' WHERE '),
      def ? '' : 'index tidak ditemukan'
    );
  }
}

// --- PERILAKU ---------------------------------------------------------------

async function checkOrderSequenceCeiling(sql: postgres.Sql): Promise<void> {
  const scope = `${TAG}_ceiling`;
  await sql`
    INSERT INTO order_sequences (scope_key, current_sequence)
    VALUES (${scope}, ${SEQUENCE_CEILING})
  `;
  await expectRejection(
    'nomor ke-10.000 ditolak database (bukan hanya TypeScript)',
    () => sql`
      UPDATE order_sequences SET current_sequence = ${SEQUENCE_CEILING + 1}
      WHERE scope_key = ${scope}
    `,
    'order_sequences_current_sequence_range'
  );
}

async function checkOrderSequenceConcurrency(url: string): Promise<void> {
  const scope = `${TAG}_race`;
  // Koneksi terpisah: race antar-koneksi tidak akan muncul bila semua
  // permintaan berbagi satu koneksi yang menserialkan dirinya sendiri.
  const clients = Array.from({ length: PARALLEL_ORDERS }, () =>
    postgres(url, { max: 1, prepare: true })
  );

  try {
    const claimed = await Promise.all(
      clients.map(async (client) => {
        const rows = await client<{ current_sequence: number }[]>`
          INSERT INTO order_sequences (scope_key, current_sequence)
          VALUES (${scope}, 1)
          ON CONFLICT (scope_key) DO UPDATE
            SET current_sequence = order_sequences.current_sequence + 1,
                updated_at = CURRENT_TIMESTAMP
          RETURNING current_sequence
        `;
        return rows[0].current_sequence;
      })
    );

    const unique = new Set(claimed);
    record(
      `${PARALLEL_ORDERS} order paralel menghasilkan ${PARALLEL_ORDERS} nomor unik`,
      unique.size === PARALLEL_ORDERS,
      `${unique.size} nomor unik dari ${PARALLEL_ORDERS} permintaan`
    );
    record(
      'nomor berurutan tanpa lompatan',
      Math.min(...claimed) === 1 && Math.max(...claimed) === PARALLEL_ORDERS,
      `rentang ${Math.min(...claimed)}..${Math.max(...claimed)}`
    );
  } finally {
    await Promise.all(clients.map((c) => c.end()));
  }
}

async function checkAffiliateClickDedup(sql: postgres.Sql): Promise<void> {
  const code = `${TAG}_code`;
  const hash = `${TAG}_hash`;
  await sql`
    INSERT INTO affiliate_clicks (id, referral_code, click_hash, click_date)
    VALUES (${`${TAG}_c1`}, ${code}, ${hash}, CURRENT_DATE)
  `;
  await expectRejection(
    'klik afiliasi ganda pada hari yang sama ditolak',
    () => sql`
      INSERT INTO affiliate_clicks (id, referral_code, click_hash, click_date)
      VALUES (${`${TAG}_c2`}, ${code}, ${hash}, CURRENT_DATE)
    `,
    'affiliate_clicks_code_hash_date_key'
  );
}

async function checkAkadSingleActive(sql: postgres.Sql): Promise<void> {
  await sql`
    INSERT INTO akad_templates (id, module, version, title, body, is_active)
    VALUES (${`${TAG}_a1`}, 'INFAQ', 9001, 'uji', 'isi', true)
  `;
  await expectRejection(
    'template akad aktif kedua untuk modul yang sama ditolak',
    () => sql`
      INSERT INTO akad_templates (id, module, version, title, body, is_active)
      VALUES (${`${TAG}_a2`}, 'INFAQ', 9002, 'uji', 'isi', true)
    `,
    'akad_templates_one_active_per_module'
  );
  // Versi non-aktif harus tetap boleh — membuktikan index-nya parsial.
  try {
    await sql`
      INSERT INTO akad_templates (id, module, version, title, body, is_active)
      VALUES (${`${TAG}_a3`}, 'INFAQ', 9003, 'uji', 'isi', false)
    `;
    record('template akad non-aktif tetap boleh ditambah', true, '');
  } catch (error) {
    record(
      'template akad non-aktif tetap boleh ditambah',
      false,
      error instanceof Error ? error.message.slice(0, 120) : String(error)
    );
  }
  await expectRejection(
    'modul akad di luar daftar ditolak CHECK',
    () => sql`
      INSERT INTO akad_templates (id, module, version, title, body)
      VALUES (${`${TAG}_a4`}, 'CRYPTO', 1, 'uji', 'isi')
    `,
    'akad_templates_module_check'
  );
}

async function checkEducationStatus(sql: postgres.Sql): Promise<void> {
  await expectRejection(
    'status CMS di luar DRAFT/PUBLISHED/ARCHIVED ditolak',
    () => sql`
      INSERT INTO education_contents (id, judul, tipe, status)
      VALUES (${`${TAG}_e1`}, 'uji', 'ARTIKEL', 'PUBLISHED_MAYBE')
    `,
    'education_contents_status_check'
  );

  // Slug NULL berkali-kali harus boleh — inilah gunanya index parsial.
  await sql`
    INSERT INTO education_contents (id, judul, tipe)
    VALUES (${`${TAG}_e2`}, 'uji', 'ARTIKEL'), (${`${TAG}_e3`}, 'uji', 'ARTIKEL')
  `;
  record(
    'dua baris CMS tanpa slug tidak saling bentrok',
    true,
    'index parsial bekerja'
  );

  const slug = `${TAG}-slug`;
  await sql`
    INSERT INTO education_contents (id, judul, tipe, slug)
    VALUES (${`${TAG}_e4`}, 'uji', 'ARTIKEL', ${slug})
  `;
  await expectRejection(
    'slug CMS duplikat ditolak',
    () => sql`
      INSERT INTO education_contents (id, judul, tipe, slug)
      VALUES (${`${TAG}_e5`}, 'uji', 'ARTIKEL', ${slug})
    `,
    'education_contents_slug_key'
  );
}

async function cleanup(sql: postgres.Sql): Promise<void> {
  await sql`DELETE FROM order_sequences WHERE scope_key LIKE ${`${TAG}%`}`;
  await sql`DELETE FROM affiliate_clicks WHERE id LIKE ${`${TAG}%`}`;
  await sql`DELETE FROM akad_templates WHERE id LIKE ${`${TAG}%`}`;
  await sql`DELETE FROM education_contents WHERE id LIKE ${`${TAG}%`}`;
}

async function main(): Promise<void> {
  const url = resolveTestUrl();
  console.log(`Database uji: ${new URL(url).pathname.slice(1)}\n`);

  const sql = postgres(url, { max: 4, prepare: true });
  try {
    await checkStructure(sql);
    console.log('\n--- PERILAKU ---');
    await checkOrderSequenceCeiling(sql);
    await checkOrderSequenceConcurrency(url);
    await checkAffiliateClickDedup(sql);
    await checkAkadSingleActive(sql);
    await checkEducationStatus(sql);
  } finally {
    await cleanup(sql).catch((error: unknown) => {
      console.error('Pembersihan gagal:', error);
    });
    await sql.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} pemeriksaan lulus`
  );
  if (failed.length > 0) {
    console.log('\nGAGAL:');
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log('Migrasi 0004 terverifikasi.');
}

await main();

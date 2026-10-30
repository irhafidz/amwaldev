import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, count, desc, eq, like, sql } from 'drizzle-orm';
import { db } from './index';
import {
  certificates,
  educationArticles,
  educationQuizQuestions,
  hewanBatches,
  infaqOrders,
  nadzirProfiles,
  notifications,
  qurbanAnimalSlots,
  transactions,
  users,
  waqfOrders,
} from './schema';

/**
 * Menyiapkan state DB demo untuk `scripts/video/capture-screenshots.mjs`
 * (screenshot HKI / paper / UAT). Hanya untuk DB lokal `amwal_video_demo`:
 *
 *   cd apps/web
 *   VIDEO_BASE_URL=http://localhost:3100 bun --env-file=.env.video \
 *     --preload ../../scripts/video/demo-env-guard.ts src/lib/db/seed-screenshots.ts
 *
 * Server demo harus sudah jalan di VIDEO_BASE_URL. Pesanan dibuat lewat alur
 * ASLI (oRPC + simulator webhook), bukan insert langsung, supaya angka dan
 * sertifikatnya dihasilkan kode produksi. Idempoten untuk data lunas (hanya
 * dilengkapi); pesanan menunggu bayar dibuat baru tiap run (batas bayar ±15 menit).
 * Hasilnya ditulis ke `screenshots/.state.json`.
 */

const BASE = process.env.VIDEO_BASE_URL ?? 'http://localhost:3100';
const PASSWORD = 'Amwal123!';
const ROOT = resolve(import.meta.dir, '../../../../..');
const STATE_FILE = resolve(ROOT, 'screenshots/.state.json');
const LOGO = resolve(
  ROOT,
  'apps/web/public/assets/images/amwal-logo-only-color.png'
);
const ARTICLE_SLUG = 'demo-ilmu-faraidh-dijamin-bisa-bagi-waris';

// biome-ignore lint/suspicious/noExplicitAny: balasan oRPC dinamis; skrip penyiapan data, bukan kode aplikasi
type Json = Record<string, any>;

const log = (message: string) => process.stdout.write(`${message}\n`);

type State = Record<string, unknown>;
const state: State = {};

async function rpcRaw(path: string, json: unknown, cookie?: string) {
  const response = await fetch(`${BASE}/rpc/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ json }),
  });
  const body = (await response.json()) as { json?: unknown };
  if (!response.ok) {
    throw new Error(
      `${path} ${response.status}: ${JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body.json as Json;
}

/** Sebagian prosedur membungkus hasilnya sebagai { success, data }; buka bungkusnya. */
async function rpc(path: string, json: unknown, cookie?: string) {
  const result = await rpcRaw(path, json, cookie);
  return (result?.success && result.data ? result.data : result) as Json;
}

async function login(email: string): Promise<string> {
  const response = await fetch(`${BASE}/rpc/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { identifier: email, password: PASSWORD } }),
  });
  if (!response.ok) {
    throw new Error(`login ${email} gagal (${response.status})`);
  }
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function settle(orderId: string) {
  const lookup = await fetch(`${BASE}/api/dev/mock-webhook?orderId=${orderId}`);
  const { data } = (await lookup.json()) as { data: Record<string, string> };
  const response = await fetch(`${BASE}/api/dev/mock-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      status_code: '200',
      gross_amount: data.amount,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: data.paymentMethod ?? 'qris',
    }),
  });
  if (!response.ok) {
    throw new Error(`settle ${orderId} ${response.status}`);
  }
}

// ---------------------------------------------------------------- 1. bersih

async function purgeTestUsers() {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, 'uat3%'));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    log('· akun uji uat3*: tidak ada');
    return;
  }
  const refs = (await db.execute(sql`
    select kcu.table_name as t, kcu.column_name as c
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name = 'users' and ccu.column_name = 'id'
  `)) as unknown as Array<{ t: string; c: string }>;
  for (const ref of refs) {
    await db.execute(
      sql.raw(
        `delete from "${ref.t}" where "${ref.c}" in (${ids.map((id) => `'${id}'`).join(',')})`
      )
    );
  }
  await db.delete(users).where(like(users.email, 'uat3%'));
  log(`✓ ${ids.length} akun uji uat3* dihapus`);
}

// ------------------------------------------------------------ 2. data tetap

async function fixtures() {
  await db
    .update(nadzirProfiles)
    .set({
      nomorRegistrasiBwi: '3.3.00192/BWI/2026',
      kontakPublik: 'sekretariat@amwal-its.or.id · 0812-3456-7890 (Bu Irma)',
    })
    .where(eq(nadzirProfiles.id, 'DEMO-NADZIR-01'));
  log('✓ nazhir DEMO-NADZIR-01: nomor BWI + kontak publik terisi');

  const [article] = await db
    .select({ id: educationArticles.id })
    .from(educationArticles)
    .where(eq(educationArticles.slug, ARTICLE_SLUG));
  if (article) {
    const [{ total }] = (await db
      .select({ total: count() })
      .from(educationQuizQuestions)
      .where(eq(educationQuizQuestions.articleId, article.id))) as [
      { total: number },
    ];
    if (total === 0) {
      const questions = [
        [
          'Siapa yang pertama kali berhak atas harta waris setelah pewaris wafat dan utang dilunasi?',
          'Ahli waris sesuai bagian yang ditetapkan',
          'Siapa saja yang hadir',
          'Anak tertua saja',
          'Ilmu faraidh menetapkan bagian ahli waris. Utang dan wasiat diselesaikan lebih dahulu (QS An-Nisa: 11).',
        ],
        [
          'Berapa bagian anak laki-laki dibanding anak perempuan menurut faraidh?',
          'Dua banding satu',
          'Sama rata',
          'Satu banding dua',
          'Bagian anak laki-laki sama dengan dua bagian anak perempuan (QS An-Nisa: 11).',
        ],
        [
          'Mana yang didahulukan sebelum harta waris dibagikan?',
          'Pelunasan utang dan wasiat (maks. 1/3)',
          'Pembagian rata ke keluarga',
          'Biaya pesta keluarga',
          'Harta waris baru dibagi setelah hak-hak pewaris dipenuhi.',
        ],
      ] as const;
      let index = 0;
      for (const [question, a, b, c, explanation] of questions) {
        await db.insert(educationQuizQuestions).values({
          articleId: article.id,
          question,
          options: [
            { key: 'A', text: a },
            { key: 'B', text: b },
            { key: 'C', text: c },
          ],
          correctKey: 'A',
          explanation,
          orderIndex: index,
        });
        index += 1;
      }
      log('✓ 3 soal kuis ditambahkan pada artikel faraidh');
    }
  }

  const [wakif] = await db
    .select({ id: users.id, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.email, 'wakif@amwal.local'));
  if (!wakif) {
    throw new Error('akun wakif@amwal.local tidak ada: jalankan db seed dulu');
  }
  const [{ total: notifTotal }] = (await db
    .select({ total: count() })
    .from(notifications)
    .where(eq(notifications.userId, wakif.id))) as [{ total: number }];
  if (notifTotal < 4) {
    const items = [
      [
        'PROGRAM_UPDATE',
        'Progres pembangunan 45%',
        'Pembangunan Masjid Al-Furqon memasuki tahap struktur lantai dua.',
      ],
      [
        'ADMIN_BROADCAST',
        'Qurban Idul Adha 1447 H dibuka',
        'Pilih paket kambing atau sapi patungan melalui menu Qurban.',
      ],
      [
        'PAYMENT_SETTLED',
        'Pembayaran berhasil',
        'Terima kasih, donasi Anda sudah kami terima.',
      ],
    ];
    for (const [type, title, body] of items) {
      await db.insert(notifications).values({
        id: `NTF-SHOT-${Math.random().toString(36).slice(2, 10)}`,
        userId: wakif.id,
        type: type as string,
        title: title as string,
        body: body as string,
      });
    }
    log('✓ notifikasi contoh untuk wakif@ ditambahkan');
  }

  // Cadangan sapi utuh untuk sertifikat 7 nama, supaya paket utama (E4) tetap tersedia.
  const [base] = await db
    .select()
    .from(hewanBatches)
    .where(eq(hewanBatches.id, 'DEMO-HWB-SAPIUTUH01'));
  if (base) {
    await db
      .insert(hewanBatches)
      .values({ ...base, id: 'DEMO-HWB-SAPIUTUH02', status: 'TERSEDIA' })
      .onConflictDoNothing();
    await db
      .insert(qurbanAnimalSlots)
      .values({
        id: 'DEMO-HWB-SAPIUTUH02-slot-1',
        hewanBatchId: 'DEMO-HWB-SAPIUTUH02',
        nomorSlot: 1,
        status: 'TERSEDIA',
      })
      .onConflictDoNothing();
  }

  const avatarOk = wakif.avatarUrl
    ? await fetch(`${BASE}${wakif.avatarUrl}`)
        .then((response) => response.ok)
        .catch(() => false)
    : false;
  if (!avatarOk) {
    const cookie = await login('wakif@amwal.local');
    const grant = await rpc(
      'user/getAvatarUploadUrl',
      { fileName: 'avatar.png', contentType: 'image/png', size: 9000 },
      cookie
    );
    const put = await fetch(`${BASE}${grant.uploadUrl}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: Bun.file(LOGO),
    });
    if (put.ok) {
      await db
        .update(users)
        .set({ avatarUrl: grant.publicUrl as string })
        .where(eq(users.id, wakif.id));
      log('✓ foto profil wakif@ diunggah');
    }
  }
}

// ------------------------------------------------------------ 3. alur asli

async function statsWarmup() {
  const stats = await rpc('stats/public', {});
  const raised = Number(stats.data?.totalRaised ?? 0);
  if (raised >= 100_000_000) {
    log(
      `· statistik beranda sudah terisi (Rp ${raised.toLocaleString('id-ID')})`
    );
    return;
  }
  log('… warmup donasi (alur pembayaran asli)');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath.endsWith('bun.exe') || process.execPath.endsWith('bun')
      ? 'node'
      : process.execPath,
    [resolve(ROOT, 'scripts/video/warmup-donations.mjs')],
    { env: { ...process.env, VIDEO_BASE_URL: BASE }, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error('warmup-donations.mjs gagal');
  }
}

async function ensureInfaqSettled() {
  const [{ total }] = (await db
    .select({ total: count() })
    .from(infaqOrders)
    .where(eq(infaqOrders.status, 'SETTLED'))) as [{ total: number }];
  const donors: [string, number, boolean][] = [
    ['Budi Santoso', 100_000, false],
    ['Siti Rahmawati', 250_000, false],
    ['Hamba Allah', 75_000, true],
    ['Ahmad Fauzi', 500_000, false],
    ['Dewi Anggraini', 150_000, false],
  ];
  const need = Math.max(0, donors.length - total);
  for (const [name, nominal, anonymous] of donors.slice(0, need)) {
    const order = await rpc('infaq/createOrder', {
      nominal,
      jenis: 'INFAQ_UMUM',
      namaPenginfaq: name,
      isAnonymous: anonymous,
      paymentType: 'qris',
    });
    await settle(order.orderId as string);
    log(
      `✓ infaq lunas: ${anonymous ? '(anonim)' : name} Rp ${nominal.toLocaleString('id-ID')}`
    );
  }
  if (need === 0) {
    log(`· infaq lunas sudah ${total} baris`);
  }
}

/**
 * Pesanan menunggu bayar SELALU dibuat baru: provider mock memberi batas bayar
 * ±15 menit, jadi layar status/hitung mundurnya hanya bagus bila dijepret
 * segera setelah seeder ini berjalan.
 */
async function pending(key: string, create: () => Promise<Json>) {
  const result = await create();
  state[key] = {
    orderId: result.orderId as string,
    transactionId: result.transactionId as string,
  };
  log(`✓ ${key}: pesanan menunggu bayar ${result.orderId}`);
}

async function ensurePendingOrders() {
  const wakif = await login('wakif@amwal.local');

  await pending('wakafPending', () =>
    rpc(
      'waqf/createOrder',
      {
        programId: 'DEMO-WQF-MASJID',
        amount: 250_000,
        paymentType: 'qris',
        donorName: 'Wakif Test',
        isAnonymous: false,
        doa: 'Semoga menjadi amal jariyah yang pahalanya mengalir untuk kedua orang tua.',
      },
      wakif
    )
  );
  await pending('infaqPending', () =>
    rpc('infaq/createOrder', {
      nominal: 100_000,
      jenis: 'INFAQ_UMUM',
      namaPenginfaq: 'Ahmad Fauzi',
      paymentType: 'qris',
    })
  );
  await pending('zakatPending', () =>
    rpc('zakat/createOrder', {
      programId: 'ZAKAT_MAAL_PENGHASILAN',
      amount: 15_000_000,
      paymentType: 'va/bni',
      jenisZakat: 'MAAL_PENGHASILAN',
      donorName: 'Dian Pratama',
    })
  );
  await pending('qurbanPending', () =>
    rpc('qurban/createOrder', {
      hewanBatchId: 'DEMO-HWB-SAPI03',
      jumlahSlotDiminta: 1,
      teleponPengqurban: `0812345${String(Date.now()).slice(-5)}`,
      tipeKepemilikan: 'KOLEKTIF',
      akadWakalahAccepted: true,
      donorName: 'Rina Kartika',
      namaShohibul: ['Rina Kartika binti Hasan'],
      paymentType: 'qris',
    })
  );
  await pending('guestWakaf', () =>
    rpc('waqf/createOrder', {
      programId: 'DEMO-WQF-AIR',
      amount: 100_000,
      paymentType: 'qris',
      donorName: 'Rina Kartika',
      isAnonymous: false,
    })
  );
}

/** Pesanan menunggu bayar milik wakif@ dari run sebelumnya yang tidak dipakai lagi (riwayat harus rapi). */
async function pruneStaleWakifPending(keep: string[]) {
  const [wakif] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'wakif@amwal.local'));
  const stale = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.wakifId, wakif?.id as string),
        eq(transactions.statusPembayaran, 'PENDING'),
        eq(transactions.jenisTransaksi, 'WAKAF')
      )
    );
  const ids = stale.map((row) => row.id).filter((id) => !keep.includes(id));
  if (ids.length === 0) {
    return;
  }
  const list = ids.map((id) => `'${id}'`).join(',');
  const refs = (await db.execute(sql`
    select kcu.table_name as t, kcu.column_name as c
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'transactions' and ccu.column_name = 'id'
  `)) as unknown as { t: string; c: string }[];
  for (const ref of refs) {
    await db.execute(
      sql.raw(`delete from "${ref.t}" where "${ref.c}" in (${list})`)
    );
  }
  await db.execute(sql.raw(`delete from transactions where id in (${list})`));
  log(`✓ ${ids.length} pesanan wakaf menunggu bayar lama dibersihkan`);
}

/** Sertifikat terbit saat diunduh pertama kali; kembalikan nomornya. */
async function issueCertificate(transactionId: string, cookie: string) {
  const response = await fetch(`${BASE}/api/certificates/${transactionId}`, {
    headers: { cookie },
  });
  if (!response.ok) {
    throw new Error(`sertifikat ${transactionId} gagal (${response.status})`);
  }
  await response.arrayBuffer();
  const [row] = await db
    .select({ nomor: certificates.nomorInternalAmwal })
    .from(certificates)
    .where(eq(certificates.transactionId, transactionId));
  return row?.nomor as string;
}

async function findSettledFor(userId: string, jenis: string) {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.wakifId, userId),
        eq(transactions.jenisTransaksi, jenis as 'WAKAF'),
        eq(transactions.statusPembayaran, 'LUNAS')
      )
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  return row?.id;
}

async function ensureCertificates() {
  const cookie = await login('wakif@amwal.local');
  const [wakif] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'wakif@amwal.local'));
  const userId = wakif?.id as string;
  const certs: Record<string, Record<string, string>> = {};

  const make = {
    WAKAF: () =>
      rpc(
        'waqf/createOrder',
        {
          programId: 'DEMO-WQF-PENDIDIKAN',
          amount: 500_000,
          paymentType: 'qris',
          donorName: 'Wakif Test',
          isAnonymous: false,
        },
        cookie
      ),
    ZAKAT: () =>
      rpc(
        'zakat/createOrder',
        {
          programId: 'ZAKAT_FITRAH',
          amount: 135_000,
          paymentType: 'qris',
          jenisZakat: 'FITRAH',
          jumlahJiwa: 3,
          namaDizakatkan: 'Wakif Test, Siti Aminah, Muhammad Rizki',
        },
        cookie
      ),
    QURBAN: () =>
      rpc(
        'qurban/createOrder',
        {
          hewanBatchId: 'DEMO-HWB-SAPIUTUH02',
          jumlahSlotDiminta: 1,
          teleponPengqurban: '081234500002',
          tipeKepemilikan: 'INDIVIDU',
          akadWakalahAccepted: true,
          paymentType: 'va/bni',
          namaShohibul: [
            'Abdullah bin Umar',
            'Aminah binti Hasan',
            'Muhammad Rizki bin Abdullah',
            'Siti Khadijah binti Ahmad',
            'Yusuf bin Ibrahim',
            'Fatimah binti Yusuf',
            'Ali bin Abdurrahman',
          ],
        },
        cookie
      ),
  } as const;

  for (const jenis of ['WAKAF', 'ZAKAT', 'QURBAN'] as const) {
    let transactionId = await findSettledFor(userId, jenis);
    if (!transactionId) {
      const order = await make[jenis]();
      await settle(order.orderId as string);
      transactionId = order.transactionId as string;
      log(`✓ ${jenis} lunas dibuat (${order.orderId})`);
    }
    const nomor = await issueCertificate(transactionId, cookie);
    certs[jenis] = { transactionId, nomor };
    log(`✓ sertifikat ${jenis}: ${nomor}`);
  }
  state.certs = certs;

  // Order id modul untuk halaman status wakaf lunas (B6).
  const [order] = await db
    .select({ id: waqfOrders.id })
    .from(waqfOrders)
    .where(eq(waqfOrders.transactionId, certs.WAKAF?.transactionId as string));
  state.wakafSettled = {
    orderId: order?.id,
    transactionId: certs.WAKAF?.transactionId,
  };
}

async function ensureZakatDistribution() {
  const admin = await login('admin@amwal.local');
  const list = await rpcRaw('admin/zakat/distributionsList', undefined, admin);
  if (Array.isArray(list.data) && list.data.length >= 2) {
    log(`· penyaluran zakat sudah ${list.data.length} catatan`);
    return;
  }
  const mustahiq = await rpcRaw(
    'admin/zakat/createMustahiq',
    { namaMustahiq: 'Bapak Slamet Riyadi', kategoriAsnaf: 'FAKIR' },
    admin
  );
  const id = (mustahiq.data as { id?: string } | undefined)?.id;
  if (id) {
    await rpc(
      'admin/zakat/addDistribution',
      {
        mustahiqId: id,
        jenisZakat: 'FITRAH',
        nominal: 450_000,
        notes: 'Paket kebutuhan pokok',
      },
      admin
    );
    log('✓ penyaluran zakat contoh dicatat');
  }
}

// ---------------------------------------------------------------- jalankan

const health = await fetch(`${BASE}/health`).catch(() => null);
if (!health?.ok) {
  throw new Error(`Server demo tidak terjangkau di ${BASE}`);
}
log(`Menyiapkan data screenshot di ${BASE}`);

await purgeTestUsers();
await fixtures();
await statsWarmup();
await ensureInfaqSettled();
await ensureCertificates();
await ensurePendingOrders();
await pruneStaleWakifPending([
  (state.wakafPending as { transactionId: string }).transactionId,
]);
await ensureZakatDistribution();

mkdirSync(resolve(ROOT, 'screenshots'), { recursive: true });
writeFileSync(
  STATE_FILE,
  JSON.stringify(
    { ...state, preparedAt: new Date().toISOString(), base: BASE },
    null,
    2
  )
);
log(`✓ state ditulis: ${STATE_FILE}`);
process.exit(0);

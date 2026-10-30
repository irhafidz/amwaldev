import { eq } from 'drizzle-orm';
import { db } from './index';
import {
  educationArticles,
  educationCategories,
  educationContents,
  nadzirProfiles,
  users,
  waqfPrograms,
  zakatGoldPriceHistory,
} from './schema';

/**
 * Data demo untuk rekaman video dokumentasi HKI (`scripts/video/`), di atas
 * `db:seed` + `db:seed:qurban-demo`. Hanya untuk DB lokal `amwal_video_demo`:
 * jalankan lewat `bun --env-file=.env.video --preload
 * ../../scripts/video/demo-env-guard.ts src/lib/db/seed-video-demo.ts`.
 *
 * Idempoten (ON CONFLICT DO NOTHING pada id/slug tetap). Dana terkumpul
 * sengaja TIDAK diisi di sini: `scripts/video/warmup-donations.ts` membuat
 * donasi lewat alur pembayaran asli (order → webhook simulasi), sehingga
 * ledger pokok wakaf terisi oleh kode produksi, bukan oleh seed.
 */

const NADZIR_EMAIL = 'nadzir@amwal.local';
const NADZIR_PROFILE_ID = 'DEMO-NADZIR-01';

const PROGRAMS = [
  {
    id: 'DEMO-WQF-MASJID',
    kodeProgram: 'WQ-0001',
    judul: 'Wakaf Pembangunan Masjid Al-Furqon',
    kategori: 'Masjid & Sarana Ibadah',
    jenisWakaf: 'HABIS_PAKAI' as const,
    targetDana: '450000000',
    durasiHari: 120,
    bannerUrl: '/assets/images/wakaf/wakaf-pembangunan-masjid-al-furqon.png',
    provinsi: 'Jawa Timur',
    kabupatenKota: 'Kota Surabaya',
    kecamatan: 'Sukolilo',
    kelurahanDesa: 'Keputih',
    deskripsi:
      'Pembangunan masjid dua lantai untuk jamaah kampus dan warga sekitar. Dana dicairkan bertahap per termin sesuai RAB, setiap pencairan dilengkapi kuitansi digital dan laporan progres fisik.',
  },
  {
    id: 'DEMO-WQF-AIR',
    kodeProgram: 'WQ-0002',
    judul: 'Wakaf Air Bersih Desa Nurul Amanah',
    kategori: 'Air Bersih',
    jenisWakaf: 'HABIS_PAKAI' as const,
    targetDana: '120000000',
    durasiHari: 60,
    bannerUrl: '/assets/images/wakaf/wakaf-air-bersih-desa-nurul-amanah.png',
    provinsi: 'Jawa Timur',
    kabupatenKota: 'Kabupaten Bojonegoro',
    kecamatan: 'Kedungadem',
    kelurahanDesa: 'Kedungadem',
    deskripsi:
      'Sumur bor dan jaringan pipa air bersih untuk 300 kepala keluarga yang selama ini mengandalkan air hujan di musim kemarau.',
  },
  {
    id: 'DEMO-WQF-PENDIDIKAN',
    kodeProgram: 'WQ-0003',
    judul: 'Wakaf Dana Abadi Pendidikan Agama Islam',
    kategori: 'Pendidikan',
    jenisWakaf: 'PRODUKTIF_KEKAL' as const,
    targetDana: '1000000000',
    durasiHari: 365,
    bannerUrl:
      '/assets/images/wakaf/wakaf-dana-abadi-untuk-pendidikan-agama-islam.png',
    provinsi: 'Jawa Timur',
    kabupatenKota: 'Kota Surabaya',
    kecamatan: 'Sukolilo',
    kelurahanDesa: 'Keputih',
    deskripsi:
      'Wakaf uang produktif: pokok dana dijaga utuh selamanya, hanya hasil investasinya yang disalurkan sebagai beasiswa guru dan santri.',
  },
];

const ARTICLES = [
  {
    slug: 'demo-ilmu-faraidh-dijamin-bisa-bagi-waris',
    title: 'Ilmu Faraidh: Dijamin Bisa Bagi Waris',
    cover: '/assets/images/education/ilmu-faraidh-dijamin-bisa-bagi-waris.png',
    content:
      'Faraidh adalah ilmu pembagian harta warisan menurut syariat Islam. Artikel ini membahas siapa saja ahli waris, bagian pasti (furudh al-muqaddarah), dan contoh perhitungan sederhana yang bisa langsung dipraktikkan keluarga.',
  },
  {
    slug: 'demo-jangan-tunda-pembagian-warisan',
    title: 'Jangan Tunda Pembagian Warisan',
    cover: '/assets/images/education/jangan-tunda-pembagian-warisan.png',
    content:
      'Menunda pembagian warisan sering memicu sengketa antaranggota keluarga. Kenali dampaknya dan langkah-langkah praktis menyelesaikan pembagian harta secara adil dan sesuai syariat.',
  },
  {
    slug: 'demo-pembagian-harta-waris-menurut-hukum-perdata',
    title: 'Pembagian Harta Waris Menurut Hukum Perdata',
    cover:
      '/assets/images/education/pembagian-harta-waris-menurut-hukum-perdata.png',
    content:
      'Perbandingan pembagian waris menurut KUH Perdata dan hukum Islam: golongan ahli waris, legitieme portie, dan kapan masing-masing berlaku di Indonesia.',
  },
];

function report(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function seedNadzir(): Promise<void> {
  const [nadzir] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, NADZIR_EMAIL));
  if (!nadzir) {
    throw new Error(`${NADZIR_EMAIL} belum ada — jalankan db:seed dulu`);
  }

  const now = new Date().toISOString();
  await db
    .insert(nadzirProfiles)
    .values({
      id: NADZIR_PROFILE_ID,
      userId: nadzir.id,
      kategori: 'BADAN_HUKUM',
      namaLembaga: 'Yayasan Wakaf Amwal ITS (Demo)',
      namaBank: 'BSI',
      nomorRekeningBank: '7000000001',
      statusVerifikasi: 'VERIFIED',
      verifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  report('✓ nazhir terverifikasi  Yayasan Wakaf Amwal ITS (Demo)');
}

async function seedPrograms(): Promise<void> {
  const now = new Date().toISOString();
  for (const program of PROGRAMS) {
    await db
      .insert(waqfPrograms)
      .values({
        ...program,
        nadzirProfileId: NADZIR_PROFILE_ID,
        status: 'LIVE',
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
        namaBank: 'BSI',
        nomorRekeningBank: '7000000001',
        atasNamaRekening: 'Yayasan Wakaf Amwal ITS',
        updatedAt: now,
      })
      .onConflictDoNothing();
    report(`✓ program wakaf         ${program.judul}`);
  }
}

async function seedArticles(): Promise<void> {
  const [existing] = await db
    .select({ id: educationCategories.id })
    .from(educationCategories)
    .where(eq(educationCategories.slug, 'demo-fiqih-waris'));
  const categoryId =
    existing?.id ??
    (
      await db
        .insert(educationCategories)
        .values({
          name: 'Fiqih Waris',
          slug: 'demo-fiqih-waris',
          type: 'article',
        })
        .returning({ id: educationCategories.id })
    )[0]?.id;

  for (const article of ARTICLES) {
    const [found] = await db
      .select({ id: educationArticles.id })
      .from(educationArticles)
      .where(eq(educationArticles.slug, article.slug));
    if (!found) {
      await db.insert(educationArticles).values({
        categoryId,
        title: article.title,
        slug: article.slug,
        coverImageUrl: article.cover,
        content: article.content,
      });
    }
    report(`✓ artikel edukasi       ${article.title}`);
  }
}

/** Harga emas demo agar nisab tampil tanpa API harga emas langsung. */
async function seedGoldPrice(): Promise<void> {
  await db
    .insert(zakatGoldPriceHistory)
    .values({
      id: 'DEMO-GOLD-01',
      pricePerGram: '2050000',
      source: 'MANUAL_FALLBACK',
      fetchedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: zakatGoldPriceHistory.id,
      set: { fetchedAt: new Date().toISOString() },
    });
  report('✓ harga emas (demo)     Rp 2.050.000 / gram');
}

const NEWS = [
  {
    id: 'DEMO-NEWS-01',
    judul: 'Peletakan Batu Pertama Masjid Al-Furqon',
    slug: 'demo-peletakan-batu-pertama-masjid-al-furqon',
    coverUrl: '/assets/images/wakaf/wakaf-pembangunan-masjid-al-furqon.png',
    body: 'Pembangunan masjid wakaf dimulai setelah dana termin pertama terkumpul. Seluruh kuitansi belanja dipublikasikan di halaman program.',
  },
  {
    id: 'DEMO-NEWS-02',
    judul: 'Sumur Bor Desa Nurul Amanah Mulai Dikerjakan',
    slug: 'demo-sumur-bor-desa-nurul-amanah',
    coverUrl: '/assets/images/wakaf/wakaf-air-bersih-desa-nurul-amanah.png',
    body: 'Tim lapangan memulai pengeboran sumur air bersih untuk 300 kepala keluarga. Progres fisik dilaporkan berkala kepada para wakif.',
  },
];

async function seedNews(): Promise<void> {
  const now = new Date().toISOString();
  for (const item of NEWS) {
    await db
      .insert(educationContents)
      .values({
        ...item,
        tipe: 'ARTIKEL',
        kategori: 'Kabar Program',
        status: 'PUBLISHED',
        publishedAt: now,
      })
      .onConflictDoNothing();
    report(`✓ berita                ${item.judul}`);
  }
}

try {
  await seedNews();
  await seedNadzir();
  await seedGoldPrice();
  await seedPrograms();
  await seedArticles();
  process.exit(0);
} catch (error) {
  process.stderr.write(
    `Seed demo video gagal: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}

/**
 * Preload untuk semua proses rekaman video HKI (`bun --env-file=.env.video
 * --preload <ini> ...`). Menghentikan proses sebelum menyentuh apa pun bila
 * env yang termuat bukan DB demo lokal atau masih membawa kunci Mayar asli,
 * misalnya karena `.env` produksi ikut terbaca.
 */
const url = new URL(process.env.DATABASE_URL ?? 'invalid://');

if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/amwal_video_demo'
) {
  throw new Error(
    `demo-env-guard: DATABASE_URL harus localhost/amwal_video_demo, bukan ${url.host}${url.pathname}`
  );
}
if (
  process.env.MAYAR_API_KEY ||
  process.env.PAYMENT_PROVIDER !== 'MOCK_SANDBOX'
) {
  throw new Error(
    'demo-env-guard: pembayaran harus MOCK_SANDBOX tanpa kunci Mayar'
  );
}

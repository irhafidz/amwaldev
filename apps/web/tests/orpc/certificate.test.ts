import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import type { Role } from '@amwal/core/auth/types';
import { generateCertificatePdf } from '@amwal/core/certificate/generator';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { signTestToken } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/certificate/certificate-route.test.ts` and
 * `generator.test.ts`. Calls the actual exported `handle` from
 * `apps/web/src/routes/api/certificates.$id.ts` (not a reimplementation),
 * proving the LUNAS/TERVERIFIKASI gate runs BEFORE certificate creation —
 * the exact ordering that fixed the FK-violation regression caught during
 * this batch's own verification pass.
 *
 * Extended by the audit "Manifest vs Monolith" (Blocking 01) with the
 * access-control matrix: the route used to serve any donor's certificate to
 * anyone who knew a transaction id (IDOR).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

// The route module wires its own module-level `db` singleton (env.DATABASE_URL,
// which points at the same fixture database under test env), so its `handle`
// export is called directly with no injected database argument.
const { handle } = await import('../../src/routes/api/certificates.$id');

/**
 * Builds the request the route actually receives. `user: null` means an
 * anonymous caller — no Authorization header at all.
 */
async function certificateRequest(
  identifier: string,
  user: { userId: string; role: Role } | null
): Promise<Request> {
  const headers = new Headers();
  if (user) {
    headers.set('authorization', `Bearer ${await signTestToken(user)}`);
  }
  return new Request(`http://localhost/api/certificates/${identifier}`, {
    headers,
  });
}

describe('oRPC certificate route', () => {
  test('returns a PDF for a settled transaction', async () => {
    const runId = ulid().toLowerCase();
    const userId = `p17b3-${runId}-user`;
    const transactionId = `p17b3-${runId}-txn`;

    await database.insert(schema.users).values({
      id: userId,
      name: 'Wakif Sertifikat',
      updatedAt: now(),
    });
    await database.insert(schema.transactions).values({
      id: transactionId,
      wakifId: userId,
      jenisTransaksi: 'WAKAF',
      amount: '100000.00',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'Badan Pengelola Wakaf',
    });

    try {
      const response = await handle({
        request: await certificateRequest(transactionId, {
          userId,
          role: 'WAKIF',
        }),
        params: { id: transactionId },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');

      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

      const [certificate] = await database
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.transactionId, transactionId));
      expect(certificate?.nomorInternalAmwal).toMatch(/^CERT-AMW-\d{4}-/);
    } finally {
      await database
        .delete(schema.certificates)
        .where(eq(schema.certificates.transactionId, transactionId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('rejects a PENDING transaction without creating a certificate row', async () => {
    const runId = ulid().toLowerCase();
    const userId = `p17b3-${runId}-pending-user`;
    const transactionId = `p17b3-${runId}-pending-txn`;

    await database.insert(schema.users).values({
      id: userId,
      name: 'Wakif Pending',
      updatedAt: now(),
    });
    await database.insert(schema.transactions).values({
      id: transactionId,
      wakifId: userId,
      jenisTransaksi: 'WAKAF',
      amount: '100000.00',
      statusPembayaran: 'PENDING',
      disbursementDestination: 'Badan Pengelola Wakaf',
    });

    try {
      const response = await handle({
        request: await certificateRequest(transactionId, {
          userId,
          role: 'WAKIF',
        }),
        params: { id: transactionId },
      });
      expect(response.status).toBe(400);

      // Regression proof: an unsettled transaction must never get a
      // certificate row — the FK-violation bug this exact gate ordering fixed.
      const [certificate] = await database
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.transactionId, transactionId));
      expect(certificate).toBeUndefined();
    } finally {
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, transactionId));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('returns 404 for an unknown identifier', async () => {
    const response = await handle({
      request: await certificateRequest('does-not-exist', {
        userId: 'p17b3-unknown-probe-user',
        role: 'WAKIF',
      }),
      params: { id: 'does-not-exist' },
    });
    expect(response.status).toBe(404);
  });
});

describe('certificate route access control (IDOR)', () => {
  const runId = ulid().toLowerCase();
  const ownerId = `p17-idor-${runId}-owner`;
  const strangerId = `p17-idor-${runId}-stranger`;
  const adminId = `p17-idor-${runId}-admin`;
  const transactionId = `p17-idor-${runId}-txn`;

  beforeAll(async () => {
    await database.insert(schema.users).values([
      { id: ownerId, name: 'Wakif Pemilik', role: 'WAKIF', updatedAt: now() },
      { id: strangerId, name: 'Wakif Lain', role: 'WAKIF', updatedAt: now() },
      { id: adminId, name: 'Amil Admin', role: 'ADMIN', updatedAt: now() },
    ]);
    await database.insert(schema.transactions).values({
      id: transactionId,
      wakifId: ownerId,
      jenisTransaksi: 'WAKAF',
      amount: '750000.00',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'Badan Pengelola Wakaf',
    });
  });

  afterAll(async () => {
    await database
      .delete(schema.certificates)
      .where(eq(schema.certificates.transactionId, transactionId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    for (const id of [ownerId, strangerId, adminId]) {
      await database.delete(schema.users).where(eq(schema.users.id, id));
    }
  });

  test('anonymous caller is rejected with 401 and gets no certificate', async () => {
    const response = await handle({
      request: await certificateRequest(transactionId, null),
      params: { id: transactionId },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');

    // The 401 must land before anything is minted — an unauthenticated probe
    // may not leave a certificate row behind.
    const [certificate] = await database
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.transactionId, transactionId));
    expect(certificate).toBeUndefined();
  });

  test("another donor cannot download someone else's certificate (403)", async () => {
    const response = await handle({
      request: await certificateRequest(transactionId, {
        userId: strangerId,
        role: 'WAKIF',
      }),
      params: { id: transactionId },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('Forbidden');

    // The donor's name and nominal must not leak through a rejected request.
    const [certificate] = await database
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.transactionId, transactionId));
    expect(certificate).toBeUndefined();
  });

  test('the owning donor receives their own certificate (200)', async () => {
    const response = await handle({
      request: await certificateRequest(transactionId, {
        userId: ownerId,
        role: 'WAKIF',
      }),
      params: { id: transactionId },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  test('an ADMIN may download any donor certificate (200)', async () => {
    const response = await handle({
      request: await certificateRequest(transactionId, {
        userId: adminId,
        role: 'ADMIN',
      }),
      params: { id: transactionId },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
  });
});

/** Isi satu stream PDF (di antara `stream` dan `endstream`). */
const STREAM_PATTERN = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

describe('certificate generator (pure)', () => {
  const base = {
    certificateId: 'CERT-1',
    nomorInternalAmwal: 'CERT-AMW-2026-0001',
    jenisTransaksi: 'WAKAF',
    namaDonatur: 'Naufal',
    nominal: 100_000,
    programTitle: 'Pembangunan Masjid',
    tanggalTransaksi: new Date('2026-09-09'),
    // I-5: the QR target is derived from PUBLIC_APP_URL, never hard-coded.
    verifyBaseUrl: 'https://amwal.test',
  };

  test('produces a valid PDF buffer', async () => {
    const pdf = await generateCertificatePdf(base);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  test('renders an anonymous donor differently from a named donor', async () => {
    const named = await generateCertificatePdf({ ...base, isAnonymous: false });
    const anon = await generateCertificatePdf({ ...base, isAnonymous: true });
    expect(Buffer.from(named).equals(Buffer.from(anon))).toBe(false);
  });

  test('refuses to issue a PDF whose QR would point nowhere (I-5)', async () => {
    await expect(
      generateCertificatePdf({ ...base, verifyBaseUrl: '' })
    ).rejects.toThrow();
  });

  /**
   * jsPDF writes page text into `Tj` operators, escaping only `(`/`)`. Since the
   * letterhead logos made the PDF ~2 MB uncompressed the generator compresses
   * its streams, so each Flate stream is inflated first. That is still enough
   * to assert the page's wording without a PDF parser, which is how `I-5`
   * locks the layout parity instead of trusting that nobody touched it.
   */
  function pdfText(pdf: Uint8Array): string {
    const raw = Buffer.from(pdf).toString('latin1');
    const inflated = [...raw.matchAll(STREAM_PATTERN)]
      .map((match) => {
        try {
          return inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString(
            'latin1'
          );
        } catch {
          return '';
        }
      })
      .join('\n');
    return `${raw}\n${inflated}`.replaceAll('\\(', '(').replaceAll('\\)', ')');
  }

  test('keeps the certificate wording and prints the WIB date-time', async () => {
    const pdf = await generateCertificatePdf({
      ...base,
      tanggalTransaksi: '2026-09-30 17:30:00',
    });
    const text = pdfText(pdf);

    for (const expected of [
      'PLATFORM AMWAL',
      'SERTIFIKAT WAKAF UANG DIGITAL',
      'Nomor: CERT-AMW-2026-0001',
      'Pembangunan Masjid',
      'Rp\u00a0100.000',
      'TERVERIFIKASI SAH & AKAD IJAB QOBUL SELESAI',
      'TERTANDATANGANI SECARA ELEKTRONIK',
      'Undang-Undang No. 41 Tahun 2004',
    ]) {
      expect(text).toContain(expected);
    }

    // The D4 defect in one line: 2026-09-30 17:30 UTC is 1 October, 00:30 WIB.
    expect(text).toContain('01 Oktober 2026, 00:30:00 WIB');
  });

  test('is white-label: no legacy institution text, institution comes from the data', async () => {
    const plain = pdfText(await generateCertificatePdf(base));
    for (const legacy of ['YMI', 'MANARUL', 'Ashari', 'Sukolilo', 'Surabaya']) {
      expect(plain).not.toContain(legacy);
    }
    expect(plain).not.toContain('Ketua Dewan Pembina');

    const branded = pdfText(
      await generateCertificatePdf({
        ...base,
        namaLembaga: 'Lembaga Uji Mandiri',
        alamatLembaga: 'Jl. Contoh No. 1, Bandung',
        kota: 'Bandung',
        namaPenandatangan: 'Fulan bin Fulan',
        jabatanPenandatangan: 'Ketua Pengurus',
      })
    );
    for (const expected of [
      'LEMBAGA UJI MANDIRI',
      'Jl. Contoh No. 1, Bandung',
      'Bandung, ',
      'Pengurus Lembaga Uji Mandiri',
      'Fulan bin Fulan',
      'Ketua Pengurus',
    ]) {
      expect(branded).toContain(expected);
    }
  });

  test('prints the anonymous label instead of the stored donor name', async () => {
    const pdf = await generateCertificatePdf({
      ...base,
      isAnonymous: true,
      namaDonatur: 'Budi Santoso',
    });
    const text = pdfText(pdf);

    expect(text).toContain('Hamba Allah (Anonim)');
    expect(text).not.toContain('Budi Santoso');
  });
});

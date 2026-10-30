import { generateCertificatePdf } from '@amwal/core/certificate/generator';
import {
  assembleCertificateData,
  findTransactionContext,
  isSettled,
} from '@amwal/core/certificate/service';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { env } from '@/env/server';
import { resolveRequestUser } from '@/lib/auth/core';
import { db } from '@/lib/db';
import { publicOrigin } from '@/lib/public-url';

/**
 * Digital certificate download (Putaran 17, Batch 3) — pure HTTP: a PDF (or,
 * with `?format=json`, its underlying data) is a binary/non-JSON-RPC
 * response, so this stays a plain server route rather than an oRPC
 * procedure. A 1:1 port of `apps/server/src/routes/certificate.ts` — the
 * LUNAS/TERVERIFIKASI gate is checked BEFORE `assembleCertificateData`,
 * which creates a certificate row, so calling it unconditionally would mint
 * certificates for unpaid transactions (the bug this exact ordering fixes).
 *
 * Access control (audit "Manifest vs Monolith", Blocking 01) — a certificate
 * carries the donor's name and the amount they gave, so this route is NOT
 * public: it was reachable by anyone who knew or guessed a transaction id
 * (IDOR). Same two-step rule the rest of the app uses via
 * `lib/orpc/procedures.ts`: no valid session is 401, and a session that
 * isn't the transaction's own `wakifId` is 403 unless the caller is ADMIN.
 */

export async function handle({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const user = await resolveRequestUser(request);
  if (!user) {
    return Response.json(
      { error: 'Unauthorized: sesi tidak valid atau sudah berakhir' },
      { status: 401 }
    );
  }

  const context = await findTransactionContext(db, params.id);
  if (!context) {
    return Response.json(
      { error: 'Transaksi tidak ditemukan' },
      { status: 404 }
    );
  }

  // An ADMIN may read any certificate (backoffice verification); everyone
  // else only their own donation.
  if (user.role !== 'ADMIN' && context.transaction.wakifId !== user.userId) {
    return Response.json(
      { error: 'Forbidden: Insufficient privileges' },
      { status: 403 }
    );
  }

  if (!isSettled(context)) {
    return Response.json(
      {
        error:
          'Sertifikat digital hanya dapat diterbitkan untuk transaksi yang telah LUNAS / TERVERIFIKASI',
      },
      { status: 400 }
    );
  }

  const { certificate, certData } = await assembleCertificateData(
    db,
    context.transaction,
    context.waqfOrder,
    // Basis QR `/verifikasi/$nomor` (I-5). Missing/blank fails closed inside
    // `generateCertificatePdf()` rather than printing an unverifiable QR.
    publicOrigin(request),
    {
      alamatLembaga: env.CERTIFICATE_INSTITUTION_ADDRESS,
      kota: env.CERTIFICATE_CITY,
      namaPenandatangan: env.CERTIFICATE_SIGNER_NAME,
      jabatanPenandatangan: env.CERTIFICATE_SIGNER_TITLE,
    }
  );

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'json') {
    return Response.json({ data: { certificate, details: certData } });
  }

  const pdf = await generateCertificatePdf(certData);
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Sertifikat-${certificate.nomorInternalAmwal}.pdf"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export const ServerRoute = createServerFileRoute(
  '/api/certificates/$id'
).methods({
  GET: handle,
});

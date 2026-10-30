import { verifyCertificate } from '@amwal/core/certificate/service';
import {
  certificateVerificationSchema,
  verifyCertificateSchema,
} from '@amwal/core/contracts/certificate';
import { ORPCError } from '@orpc/server';
import { publicProcedure } from '../procedures';

/**
 * oRPC certificate router (Sprint 11, `I-5` — Zone 1).
 *
 * Exactly one procedure, and it is public on purpose: the QR code printed on
 * a certificate points at `/verifikasi/$nomor`, which any third party can
 * open. Nothing here may ever return the nominal, the transaction id, or the
 * donor's name when the donation was anonymous — that narrowing happens in
 * `verifyCertificate()` (`@amwal/core/certificate/service`), the single place
 * the public payload is assembled.
 *
 * Downloading the PDF itself is *not* here: it stays a plain HTTP route
 * (`routes/api/certificates.$id.ts`) because a PDF is binary, and it keeps the
 * donor/admin ownership gate that this public read deliberately does not have.
 */
const verify = publicProcedure
  .input(verifyCertificateSchema)
  /**
   * Output validation is not decoration: `verifyCertificate()` returns the
   * exact object the contract promises, and a future field added to the DB
   * query cannot silently leak into the public response.
   */
  .output(certificateVerificationSchema)
  .handler(async ({ input, context }) => {
    const certificate = await verifyCertificate(context.db, input.nomor);

    if (!certificate) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Sertifikat tidak ditemukan',
      });
    }

    return certificate;
  });

export const certificate = { verify };

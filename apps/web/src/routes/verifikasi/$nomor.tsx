import { createFileRoute } from '@tanstack/react-router';
import { VerifyCertificateView } from '@/routes/verifikasi/-components/verify-certificate-view';

/**
 * Public verification route (`I-5`) — the QR target printed on every
 * certificate is `<PUBLIC_APP_URL>/verifikasi/<nomor>`.
 *
 * Unauthenticated on purpose: a reader scanning a paper certificate has no
 * Amwal session. Everything sensitive is removed server-side in
 * `verifyCertificate()`, so there is nothing here to guard.
 */
export const Route = createFileRoute('/verifikasi/$nomor')({
  component: VerifikasiPage,
});

function VerifikasiPage() {
  const { nomor } = Route.useParams();

  return <VerifyCertificateView nomor={nomor} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { OtpVerificationView } from '@/components/auth/otp-verification-view';

export const Route = createFileRoute('/verifikasi-otp')({
  validateSearch: z.object({ email: z.string().optional() }),
  component: OtpVerificationPage,
});

function OtpVerificationPage() {
  const { email } = Route.useSearch();

  return <OtpVerificationView email={email} />;
}

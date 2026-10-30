import { createFileRoute } from '@tanstack/react-router';
import { NadzirVerificationView } from '@/components/admin/nadzir-verification-view';

export const Route = createFileRoute('/admin/nadzir-verifikasi')({
  component: () => <NadzirVerificationView />,
});

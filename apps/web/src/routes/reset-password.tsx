import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordView } from '@/components/auth/reset-password-view';

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordView,
});

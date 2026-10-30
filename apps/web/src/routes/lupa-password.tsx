import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordView } from '@/components/auth/forgot-password-view';

export const Route = createFileRoute('/lupa-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}

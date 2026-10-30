import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginView } from '@/components/auth/login-view';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/auth/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  return <LoginView redirectUrl={redirect || '/dashboard'} />;
}

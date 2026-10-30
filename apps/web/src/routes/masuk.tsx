import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginView } from '@/components/auth/login-view';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/masuk')({
  validateSearch: loginSearchSchema,
  component: MasukPage,
});

function MasukPage() {
  const { redirect } = Route.useSearch();

  return <LoginView redirectUrl={redirect || '/dashboard'} />;
}

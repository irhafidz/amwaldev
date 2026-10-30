import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RegisterView } from '@/components/auth/register-view';

const registerSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/auth/register')({
  validateSearch: registerSearchSchema,
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect } = Route.useSearch();

  return <RegisterView redirectUrl={redirect || '/dashboard'} />;
}

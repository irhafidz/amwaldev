import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RegisterView } from '@/components/auth/register-view';

const registerSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/daftar')({
  validateSearch: registerSearchSchema,
  component: DaftarPage,
});

function DaftarPage() {
  const { redirect } = Route.useSearch();

  return <RegisterView redirectUrl={redirect || '/dashboard'} />;
}

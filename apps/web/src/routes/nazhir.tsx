import { createFileRoute, redirect } from '@tanstack/react-router';
import { BackofficeShell } from '@/components/backoffice/backoffice-shell';
import { NazhirProgramView } from '@/components/nadzir/nazhir-program-view';

/**
 * Reference path `/nazhir` (Manajemen Program). Same guard as the `/nadzir`
 * branch — NADZIR for their own lembaga, ADMIN as superuser. Server enforces
 * it via `requireAnyRole(['NADZIR', 'ADMIN'])` on `/api/nadzir/*`.
 */
export const Route = createFileRoute('/nazhir')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: '/auth/login',
        search: { redirect: location.href },
      });
    }
    if (context.user.role !== 'NADZIR' && context.user.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
    return { nazhirUser: context.user };
  },
  component: NazhirPage,
});

function NazhirPage() {
  const { nazhirUser } = Route.useRouteContext();

  return (
    <BackofficeShell
      role={nazhirUser.role}
      userName={nazhirUser.name ?? nazhirUser.email ?? 'Nadzir Wakaf'}
    >
      <NazhirProgramView />
    </BackofficeShell>
  );
}

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { BackofficeShell } from '@/components/backoffice/backoffice-shell';

/**
 * Layout + guard for the entire `/nadzir` branch.
 *
 * `beforeLoad` is UX enforcement only — the authoritative check lives in
 * `apps/server` (`requireAnyRole(['NADZIR', 'ADMIN'])` on the `/api/nadzir`
 * mount point). A signed-out visitor is bounced to login; a signed-in WAKIF /
 * PETUGAS_LAPANGAN is sent to the user dashboard. ADMIN passes as superuser.
 */
export const Route = createFileRoute('/nadzir')({
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
    return { nadzirUser: context.user };
  },
  component: NadzirLayout,
});

function NadzirLayout() {
  const { nadzirUser } = Route.useRouteContext();

  return (
    <BackofficeShell
      role={nadzirUser.role}
      userName={nadzirUser.name ?? nadzirUser.email ?? 'Nadzir Wakaf'}
    >
      <Outlet />
    </BackofficeShell>
  );
}

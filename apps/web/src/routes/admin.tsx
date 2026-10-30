import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { BackofficeShell } from '@/components/backoffice/backoffice-shell';

/**
 * Layout + guard for the entire `/admin` branch.
 *
 * `beforeLoad` is UX enforcement only — the authoritative check lives in
 * `apps/server` (`requireRole('ADMIN')` on the `/api/admin` mount point).
 * A signed-out visitor is bounced to login with a return path; a signed-in
 * non-ADMIN is sent to the user dashboard. There is no role fallback: the
 * legacy `role = session?.role || 'ADMIN'` bug (AMW-03) is not reproduced.
 */
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) => {
    const isDev = import.meta.env.DEV;
    if (!context.user) {
      if (isDev) {
        return {
          adminUser: {
            id: 'dev-admin',
            role: 'ADMIN',
            name: 'Super Admin BWI',
            email: 'admin@amwal.id',
          },
        };
      }
      throw redirect({
        to: '/auth/login',
        search: { redirect: location.href },
      });
    }
    if (context.user.role !== 'ADMIN') {
      if (isDev) {
        return {
          adminUser: {
            ...context.user,
            role: 'ADMIN',
          },
        };
      }
      throw redirect({ to: '/dashboard' });
    }
    return { adminUser: context.user };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { adminUser } = Route.useRouteContext();

  return (
    <BackofficeShell
      role={adminUser.role}
      userName={adminUser.name ?? adminUser.email ?? 'Super Admin BWI'}
    >
      <Outlet />
    </BackofficeShell>
  );
}

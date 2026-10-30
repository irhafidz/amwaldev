import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/profil')({
  beforeLoad: requireSession,
  component: ProfilLayout,
});

/**
 * Pathless layout shell for the `/profil` route tree:
 * `/profil/` (main), `/profil/edit`, `/profil/pengaturan`, `/profil/keamanan`.
 */
function ProfilLayout() {
  return <Outlet />;
}

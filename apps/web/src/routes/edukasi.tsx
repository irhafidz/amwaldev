import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/edukasi')({
  component: EdukasiLayout,
});

/**
 * Pathless shell for the `/edukasi` branch (mirrors `wakaf.tsx`): the
 * catalogue lives in `edukasi/index.tsx` so `$slug` (detail) mounts as a
 * sibling instead of being swallowed by the catalogue screen — without this
 * split, `/edukasi/$slug` matched but the catalogue's own component (with no
 * `<Outlet />`) never rendered the child.
 */
function EdukasiLayout() {
  return <Outlet />;
}

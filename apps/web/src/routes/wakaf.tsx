import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/wakaf')({
  component: WakafLayout,
});

/**
 * Pathless shell for the `/wakaf` branch: the catalogue lives in
 * `wakaf/index.tsx` so that `$programId` (detail) and `status` can mount as
 * siblings instead of being swallowed by the catalogue screen.
 */
function WakafLayout() {
  return <Outlet />;
}

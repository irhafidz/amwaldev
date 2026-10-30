import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
});

/**
 * Pathless layout for `/dashboard` branch:
 * Child routes (/dashboard/, /dashboard/poin-berkah, /dashboard/search)
 * mount as siblings through this layout outlet.
 */
function DashboardLayout() {
  return <Outlet />;
}

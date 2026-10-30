import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/infaq')({
  component: InfaqLayout,
});

/** Pathless shell so `/infaq/status` can mount beside the form. */
function InfaqLayout() {
  return <Outlet />;
}

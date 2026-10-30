import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/qurban')({
  component: QurbanLayout,
});

/**
 * Pathless shell for the `/qurban` branch so `$batchId` (batch detail) can
 * mount as a sibling of the catalogue.
 */
function QurbanLayout() {
  return <Outlet />;
}

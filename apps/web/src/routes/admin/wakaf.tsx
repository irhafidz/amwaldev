import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WakafProgramsView } from '@/components/admin/wakaf-programs-view';

/**
 * `?view=create` and `?view=receipts` drive the sidebar sub-menu deep links.
 * The list is fully wired to `/api/admin/waqf/programs`; the other two tabs
 * render a notice above the live table until their port lands.
 */
const wakafSearchSchema = z.object({
  view: z.enum(['list', 'create', 'receipts']).optional(),
});

export const Route = createFileRoute('/admin/wakaf')({
  validateSearch: wakafSearchSchema,
  component: AdminWakafPage,
});

function AdminWakafPage() {
  const { view } = Route.useSearch();
  return <WakafProgramsView view={view ?? 'list'} />;
}

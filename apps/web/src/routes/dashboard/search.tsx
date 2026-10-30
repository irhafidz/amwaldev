import { createFileRoute } from '@tanstack/react-router';
import { DashboardSearchView } from '@/components/dashboard/dashboard-search-view';
import { UserShell } from '@/components/user-shell';

interface SearchParams {
  q?: string;
  category?: string;
}

export const Route = createFileRoute('/dashboard/search')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
  }),
  component: DashboardSearchPage,
});

function DashboardSearchPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <DashboardSearchView />
    </UserShell>
  );
}

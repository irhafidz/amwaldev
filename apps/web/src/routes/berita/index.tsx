import { createFileRoute } from '@tanstack/react-router';
import { NewsView } from '@/components/cms/news-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/berita/')({
  component: NewsPage,
});

function NewsPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <NewsView />
    </UserShell>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { NewsDetail } from '@/components/cms/news-detail';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/berita/$id')({
  component: NewsDetailPage,
});

function NewsDetailPage() {
  const { user } = Route.useRouteContext();
  const { id } = Route.useParams();

  return (
    <UserShell user={user}>
      <NewsDetail id={id} />
    </UserShell>
  );
}

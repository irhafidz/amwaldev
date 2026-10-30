import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/berita')({
  component: NewsLayout,
});

/** Pathless shell so `/berita/$id` can mount beside the catalogue. */
function NewsLayout() {
  return <Outlet />;
}

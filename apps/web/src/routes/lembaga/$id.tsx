import { createFileRoute } from '@tanstack/react-router';
import { LembagaProfileView } from '@/components/lembaga/lembaga-profile-view';
import { UserShell } from '@/components/user-shell';

/** Profil publik lembaga nazhir (D6); tanpa guard, dibuka tamu. */
export const Route = createFileRoute('/lembaga/$id')({
  component: LembagaPage,
});

function LembagaPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();

  return (
    <UserShell frame="catalog" showNav={false} user={user}>
      <LembagaProfileView id={id} />
    </UserShell>
  );
}

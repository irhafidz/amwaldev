import { createFileRoute } from '@tanstack/react-router';
import { ProfileMainView } from '@/components/profile/profile-main-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/profil/')({
  component: ProfileIndexPage,
});

function ProfileIndexPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      frame="appMuted"
      outerClassName="selection:bg-[#00AB55] selection:text-white"
      user={user}
    >
      <ProfileMainView user={user} />
    </UserShell>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { ProfileSecurityView } from '@/components/profile/profile-security-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/profil/keamanan')({
  component: ProfileSecurityPage,
});

function ProfileSecurityPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      frame="appMuted"
      outerClassName="selection:bg-[#00AB55] selection:text-white"
      user={user}
    >
      <ProfileSecurityView user={user} />
    </UserShell>
  );
}

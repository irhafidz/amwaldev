import { createFileRoute } from '@tanstack/react-router';
import { ProfileEditView } from '@/components/profile/profile-edit-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/profil/edit')({
  component: ProfileEditPage,
});

function ProfileEditPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      frame="appMuted"
      outerClassName="selection:bg-[#00AB55] selection:text-white"
      user={user}
    >
      <ProfileEditView user={user} />
    </UserShell>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { ProfileSettingsView } from '@/components/profile/profile-settings-view';
import { UserShell } from '@/components/user-shell';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/pengaturan')({
  beforeLoad: requireSession,
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      frame="appMuted"
      outerClassName="selection:bg-[#00AB55] selection:text-white"
      user={user}
    >
      <ProfileSettingsView user={user} />
    </UserShell>
  );
}

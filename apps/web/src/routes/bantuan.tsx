import { createFileRoute } from '@tanstack/react-router';
import { HelpCenterView } from '@/components/help/help-center-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/bantuan')({
  component: HelpCenterPage,
});

function HelpCenterPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      frame="appMuted"
      outerClassName="selection:bg-[#00AB55] selection:text-white"
      user={user}
    >
      <HelpCenterView />
    </UserShell>
  );
}

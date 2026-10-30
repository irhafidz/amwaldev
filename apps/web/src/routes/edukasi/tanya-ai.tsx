import { createFileRoute } from '@tanstack/react-router';
import { TanyaAiView } from '@/components/education/tanya-ai-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/edukasi/tanya-ai')({
  component: EdukasiTanyaAiPage,
});

function EdukasiTanyaAiPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell showNav={false} user={user}>
      <TanyaAiView user={user} />
    </UserShell>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { EducationCatalogView } from '@/components/education/education-catalog-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/edukasi/')({
  component: EdukasiPage,
});

function EdukasiPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      user={user}
    >
      <EducationCatalogView user={user} />
    </UserShell>
  );
}

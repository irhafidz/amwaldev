import { createFileRoute } from '@tanstack/react-router';
import { EducationArticleDetailView } from '@/components/education/education-article-detail-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/edukasi/$slug/kuis')({
  component: EducationQuizDirectPage,
});

function EducationQuizDirectPage() {
  const { user } = Route.useRouteContext();
  const { slug } = Route.useParams();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      user={user}
    >
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-28 sm:px-6 md:px-8">
        <EducationArticleDetailView
          initialTab="kuis"
          key={slug}
          slug={slug}
          user={user}
        />
      </main>
    </UserShell>
  );
}

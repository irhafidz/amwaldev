import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { EducationArticleDetailView } from '@/components/education/education-article-detail-view';
import { EducationDetailView } from '@/components/education/education-detail';
import { UserShell } from '@/components/user-shell';

/**
 * The one interactive slide+quiz experience that isn't an `education_articles`
 * row — it predates the education engine and has its own quiz-grading/XP
 * wiring (`gamification.submitQuizAttempt`). Every other slug is a real
 * article, looked up by `EducationArticleDetailView`.
 */
const INTERACTIVE_QUIZ_SLUG = '8-asnaf';

const searchSchema = z.object({
  tab: z.enum(['materi', 'kuis']).optional(),
});

export const Route = createFileRoute('/edukasi/$slug')({
  validateSearch: searchSchema,
  component: EducationDetailPage,
});

function EducationDetailPage() {
  const { user } = Route.useRouteContext();
  const { slug } = Route.useParams();
  const { tab } = Route.useSearch();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      user={user}
    >
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-28 sm:px-6 md:px-8">
        {slug === INTERACTIVE_QUIZ_SLUG ? (
          <div>
            <Link
              className="mb-3 inline-flex items-center gap-1 font-semibold text-brand-primary text-label-caption hover:underline"
              to="/edukasi"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Kembali ke Edukasi
            </Link>
            <EducationDetailView user={user} />
          </div>
        ) : (
          <EducationArticleDetailView
            initialTab={tab}
            key={slug}
            slug={slug}
            user={user}
          />
        )}
      </main>
    </UserShell>
  );
}

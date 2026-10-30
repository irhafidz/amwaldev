import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { UserShell } from '@/components/user-shell';
import { WaqfDonateForm } from '@/components/wakaf/waqf-donate-form';

const donateSearchSchema = z.object({
  mode: z.enum(['anonymous', 'guest']).optional(),
  nominal: z
    .preprocess((val) => {
      if (val === '' || val === null || val === undefined) {
        return;
      }
      const num = Number(val);
      return Number.isNaN(num) ? undefined : num;
    }, z.number().nonnegative().optional())
    .optional(),
});

export const Route = createFileRoute('/wakaf/$programId/donate')({
  validateSearch: donateSearchSchema,
  component: WaqfDonatePage,
});

export function WaqfDonatePage() {
  const { user } = Route.useRouteContext();
  const { programId } = Route.useParams();
  const { mode, nominal } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <WaqfDonateForm
        initialNominal={nominal}
        mode={mode}
        programId={programId}
        user={user}
      />
    </UserShell>
  );
}

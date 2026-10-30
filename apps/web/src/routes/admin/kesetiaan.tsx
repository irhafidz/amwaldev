import { createFileRoute } from '@tanstack/react-router';
import { CohortRetentionView } from '@/components/admin/cohort-retention-view';

export const Route = createFileRoute('/admin/kesetiaan')({
  component: CohortRetentionView,
});

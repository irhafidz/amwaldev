import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { UserShell } from '@/components/user-shell';
import { WaqfOrderStatusView } from '@/components/wakaf/waqf-order-status';

export const Route = createFileRoute('/wakaf/status')({
  validateSearch: z.object({
    // TanStack Router's default search parser auto-coerces an all-digit
    // query value to a number — `orderId` carries the 12-digit numeric
    // order ID (`formatOrderId()`), so a plain `z.string()` rejects it.
    orderId: z.coerce.string().optional(),
  }),
  component: WaqfStatusPage,
});

function WaqfStatusPage() {
  const { user } = Route.useRouteContext();
  const { orderId } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <WaqfOrderStatusView orderId={orderId} />
    </UserShell>
  );
}

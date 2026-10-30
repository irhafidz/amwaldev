import { createFileRoute } from '@tanstack/react-router';
import { UserShell } from '@/components/user-shell';
import { ZakatCalculator } from '@/components/zakat/zakat-calculator';

export const Route = createFileRoute('/zakat/kalkulator')({
  component: ZakatCalculatorPage,
});

function ZakatCalculatorPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <ZakatCalculator />
    </UserShell>
  );
}

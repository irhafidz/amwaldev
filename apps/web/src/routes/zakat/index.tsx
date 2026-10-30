import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/zakat` has no page of its own; the calculator is the entry point. */
export const Route = createFileRoute('/zakat/')({
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/zakat/kalkulator' });
  },
});

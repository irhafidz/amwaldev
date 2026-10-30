import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { UserShell } from '@/components/user-shell';
import { ZakatCheckout } from '@/components/zakat/zakat-checkout';

const checkoutSearchSchema = z.object({
  jenis: z.enum(['FITRAH', 'MAAL_PENGHASILAN', 'EMAS', 'PERUSAHAAN']),
  label: z.string().min(1),
  amount: z.coerce.number().positive(),
  harta: z.coerce.number().nonnegative().optional(),
  nisab: z.coerce.number().nonnegative().optional(),
  jiwa: z.coerce.number().int().positive().optional(),
  names: z.array(z.string()).optional(),
});

export type ZakatCheckoutSearch = z.infer<typeof checkoutSearchSchema>;

export const Route = createFileRoute('/zakat/checkout')({
  validateSearch: checkoutSearchSchema,
  component: ZakatCheckoutPage,
});

function ZakatCheckoutPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <ZakatCheckout search={search} user={user} />
    </UserShell>
  );
}

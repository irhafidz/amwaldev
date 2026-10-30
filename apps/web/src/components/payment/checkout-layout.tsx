import type { ReactNode } from 'react';

/** Card + CTA styling shared by the zakat, qurban and infaq checkouts. */
export const CARD =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900';
export const CTA =
  'h-12 w-full bg-[#356152] font-bold text-white shadow-md shadow-[#356152]/20 hover:bg-[#2b4f43] disabled:opacity-50';

export function CheckoutSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD}>
      <h2 className="mb-4 font-bold text-base text-gray-900 dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

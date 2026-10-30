import { createFileRoute, Link } from '@tanstack/react-router';
import { Hammer } from 'lucide-react';

/**
 * `/admin/approvals` is not linked from the sidebar. The unified approval hub
 * that used to live here duplicated two screens that already work on their own
 * (withdrawal review inside Program Wakaf, nazhir verification), plus a tab
 * with no backend. Until a combined module exists this page says so plainly
 * instead of offering action buttons.
 */
export const Route = createFileRoute('/admin/approvals')({
  component: ApprovalsPlaceholder,
});

function ApprovalsPlaceholder() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <Hammer aria-hidden="true" className="size-6" />
      </span>
      <h2 className="font-bold text-lg text-slate-900">
        Modul pencairan dana sedang dalam pengembangan
      </h2>
      <p className="mt-2 text-slate-500 text-sm leading-relaxed">
        Pusat persetujuan terpadu belum tersedia. Sementara itu, persetujuan
        pencairan dana dikelola di halaman Program Wakaf, dan verifikasi nazhir
        di halaman Verifikasi Nazhir.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          className="rounded-xl bg-[#1B5E20] px-4 py-2.5 font-bold text-white text-xs transition hover:bg-[#144716]"
          to="/admin/wakaf"
        >
          Buka Program Wakaf
        </Link>
        <Link
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-700 text-xs transition hover:bg-slate-50"
          to="/admin/nadzir-verifikasi"
        >
          Buka Verifikasi Nazhir
        </Link>
      </div>
    </div>
  );
}

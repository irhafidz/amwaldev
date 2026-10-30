/**
 * Penanda visual isian formulir wajib (*) sesuai standar aksesibilitas:
 * Memiliki `aria-hidden="true"` untuk visual asteris dan teks tersembunyi `(wajib diisi)`
 * untuk pembaca layar (screen-reader).
 */
export function RequiredMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span aria-hidden="true" className="ml-0.5 font-bold text-rose-500">
        *
      </span>
      <span className="sr-only"> (wajib diisi)</span>
    </span>
  );
}

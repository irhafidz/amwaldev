import { AlertTriangle } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

export interface ConfirmActionOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

function ConfirmActionDialog({
  title,
  description,
  confirmLabel = 'Ya, Hapus',
  cancelLabel = 'Batal',
  onResult,
}: ConfirmActionOptions & { onResult: (confirmed: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Default focus on the safe action so Enter never deletes by accident.
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onResult(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onResult]);

  return (
    <div
      aria-describedby="confirm-action-desc"
      aria-labelledby="confirm-action-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="alertdialog"
    >
      <button
        aria-label="Tutup dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => onResult(false)}
        tabIndex={-1}
        type="button"
      />
      <div className="relative w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h3
              className="font-bold text-slate-900 text-sm"
              id="confirm-action-title"
            >
              {title}
            </h3>
            <p className="text-slate-500 text-xs">
              Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>
        <p
          className="rounded-lg bg-slate-50 p-3 text-slate-700 text-xs leading-relaxed"
          id="confirm-action-desc"
        >
          {description}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="cursor-pointer rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 text-sm hover:bg-slate-200"
            onClick={() => onResult(false)}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="cursor-pointer rounded-lg bg-rose-600 px-4 py-2 font-bold text-sm text-white shadow-xs hover:bg-rose-700"
            onClick={() => onResult(true)}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Promise-based replacement for `window.confirm()` in admin delete flows
 * (UAT admin 2026-10-02: "konfirmasi sebelum delete"). Mounts its own root, so
 * call sites need no provider or extra state:
 *
 *   if (!(await confirmAction({ title, description }))) return;
 */
export function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const onResult = (confirmed: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      root.unmount();
      host.remove();
      resolve(confirmed);
    };
    root.render(<ConfirmActionDialog {...options} onResult={onResult} />);
  });
}

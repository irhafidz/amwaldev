import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Auto-dismiss timers, so unmounting never leaves one that later calls
  // `setToasts` (and reads `window`) on a component that is already gone.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const removeToast = (id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const showToast = ({
    title,
    description,
    type = 'success',
  }: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: ToastMessage = { id, title, description, type };

    setToasts((current) => [...current, toast]);
    timers.current.set(
      id,
      setTimeout(() => removeToast(id), 4500)
    );
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <section
        aria-label="Notifikasi"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[9999] flex w-full max-w-sm flex-col gap-2.5 px-1"
      >
        {toasts.map((toast) => {
          const palette: Record<ToastType, string> = {
            success: 'border-emerald-700 bg-emerald-900/95 text-white',
            error: 'border-rose-700 bg-rose-900/95 text-white',
            warning: 'border-amber-600 bg-amber-900/95 text-white',
            info: 'border-slate-700 bg-slate-900/95 text-white',
          };

          const icons: Record<ToastType, ReactNode> = {
            success: (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-emerald-400"
              />
            ),
            error: (
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-rose-400"
              />
            ),
            warning: (
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-amber-300"
              />
            ),
            info: (
              <Info
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-teal-400"
              />
            ),
          };

          return (
            <div
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md ${palette[toast.type ?? 'success']}`}
              key={toast.id}
            >
              {icons[toast.type ?? 'success']}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-xs leading-tight">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                aria-label="Tutup notifikasi"
                className="cursor-pointer p-0.5 text-white/60 transition-colors hover:text-white"
                onClick={() => removeToast(toast.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    return {
      showToast: () => {
        // No-op outside a ToastProvider.
      },
    };
  }

  return context;
}

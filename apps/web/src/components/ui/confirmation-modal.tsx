import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  children: ReactNode;
}

export function ConfirmationModal({
  isOpen,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Konfirmasi & Simpan',
  cancelLabel = 'Periksa Lagi',
  isLoading = false,
  children,
}: ConfirmationModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-bg-default p-6 shadow-floating">
        <h2 className="mb-4 text-heading-m text-text-primary">{title}</h2>

        <div className="mb-6 max-h-[60vh] space-y-3 overflow-y-auto rounded-field border border-border-subtle bg-bg-surface p-4 text-sm">
          {children}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button onClick={onClose} type="button" variant="outline">
            {cancelLabel}
          </Button>
          <Button
            disabled={isLoading}
            onClick={onConfirm}
            type="button"
            variant="default"
          >
            {isLoading && <LoaderCircle className="animate-spin" />}
            {isLoading ? 'Memproses...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

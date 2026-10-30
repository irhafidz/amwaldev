import { useCallback, useEffect, useRef } from 'react';
import { confirmAction } from '@/components/ui/confirm-action';

/**
 * Pelindung modal formulir (UAT #4: klik di luar modal / Esc membuang isian
 * program yang sudah panjang). Foto isian saat modal terbuka dijadikan
 * pembanding; `requestClose` hanya bertanya bila isiannya sudah berubah.
 *
 * `value` harus bisa di-`JSON.stringify` (objek isian form biasa). Modal yang
 * dipasang ulang tiap dibuka cukup memakai `open = true`.
 */
export function useDirtyGuard({
  open = true,
  value,
  onClose,
}: {
  open?: boolean;
  value: unknown;
  onClose: () => void;
}) {
  const current = JSON.stringify(value);
  const currentRef = useRef(current);
  currentRef.current = current;
  const baselineRef = useRef(current);
  const askingRef = useRef(false);

  useEffect(() => {
    if (open) {
      baselineRef.current = currentRef.current;
    }
  }, [open]);

  const requestClose = useCallback(async () => {
    if (askingRef.current) {
      return;
    }
    if (currentRef.current === baselineRef.current) {
      onClose();
      return;
    }
    askingRef.current = true;
    const discard = await confirmAction({
      title: 'Buang isian yang belum disimpan?',
      description:
        'Formulir ini sudah Anda isi. Bila ditutup sekarang, isiannya akan hilang.',
      confirmLabel: 'Ya, Buang',
      cancelLabel: 'Lanjut Mengisi',
    });
    askingRef.current = false;
    if (discard) {
      onClose();
    }
  }, [onClose]);

  return { isDirty: current !== baselineRef.current, requestClose };
}

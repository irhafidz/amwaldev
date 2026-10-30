import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { getQurbanPhotoUploadUrl } from '@/lib/amwal-api/admin';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Unggah foto katalog hewan qurban ke volume media VPS (`/api/media`),
 * menggantikan isian tautan. Yang disimpan hanya path hasil unggahan.
 */
export function QurbanPhotoField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Ukuran foto maksimal 5MB');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl, publicUrl } = await getQurbanPhotoUploadUrl(file);
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Gagal mengunggah foto');
      }
      onChange(publicUrl);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Gagal mengunggah foto'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="relative w-full max-w-xs overflow-hidden rounded-xl border border-slate-200">
          {/** biome-ignore lint/performance/noImgElement: pratinjau unggahan admin */}
          <img
            alt="Pratinjau foto katalog"
            className="aspect-video w-full object-cover"
            src={value}
          />
          <button
            aria-label="Hapus foto"
            className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/90 text-rose-600 shadow-sm hover:bg-white"
            onClick={() => onChange('')}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}
      <label
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 border-dashed bg-slate-50 px-3 py-2 font-semibold text-slate-600 text-xs hover:bg-slate-100"
        htmlFor={id}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <ImagePlus aria-hidden="true" className="size-4" />
        )}
        {value ? 'Ganti foto' : 'Pilih foto (JPG/PNG/WebP, maks. 5MB)'}
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          id={id}
          onChange={pick}
          type="file"
        />
      </label>
      {error && (
        <p className="text-rose-600 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

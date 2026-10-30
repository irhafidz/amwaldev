import { Camera, FileText, ImageOff, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getReceiptSignedUrl } from '@/lib/amwal-api/admin';
import { cn } from '@/lib/utils';

/**
 * Pratinjau nota/foto yang sudah diunggah langsung di daftar (UAT #4: "bukti
 * nota dan dokumentasi kegiatan tidak terlihat", admin harus klik dan
 * menunggu untuk mencocokkan nominal). Tautan bertanda tangan diminta hanya
 * saat kotaknya terlihat di layar, dan disimpan sebentar (berlaku 10 menit di
 * server) supaya berpindah tab tidak mengulang permintaan.
 */

const URL_TTL_MS = 5 * 60 * 1000;
const urlCache = new Map<string, { url: string; expires: number }>();

async function signedUrlFor(id: string): Promise<string> {
  const hit = urlCache.get(id);
  if (hit && hit.expires > Date.now()) {
    return hit.url;
  }
  const url = await getReceiptSignedUrl(id);
  urlCache.set(id, { url, expires: Date.now() + URL_TTL_MS });
  return url;
}

export interface PreviewableReceipt {
  fileName: string;
  id: string;
  mimeType?: string;
  title: string;
}

const isImage = (receipt: PreviewableReceipt) =>
  receipt.mimeType
    ? receipt.mimeType.startsWith('image/')
    : /\.(jpe?g|png|webp)$/i.test(receipt.fileName);

/** Miniatur yang membuka lightbox bila diklik. */
export function ReceiptThumb({
  className,
  onOpen,
  receipt,
}: {
  className?: string;
  onOpen: () => void;
  receipt: PreviewableReceipt;
}) {
  const boxRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const image = isImage(receipt);

  useEffect(() => {
    if (!image) {
      return;
    }
    const box = boxRef.current;
    if (!box) {
      return;
    }
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        signedUrlFor(receipt.id)
          .then((next) => {
            if (!cancelled) {
              setUrl(next);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setFailed(true);
            }
          });
      },
      { rootMargin: '120px' }
    );
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [image, receipt.id]);

  return (
    <button
      aria-label={`Lihat ${receipt.title}`}
      className={cn(
        'flex shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-400 transition hover:border-emerald-400',
        className ?? 'h-16 w-16'
      )}
      onClick={onOpen}
      ref={boxRef}
      type="button"
    >
      {image && url && !failed && (
        // biome-ignore lint/performance/noImgElement: tautan bertanda tangan sementara, bukan aset yang perlu dioptimasi
        <img
          alt={receipt.title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={url}
        />
      )}
      {image && !url && !failed && (
        <Camera aria-hidden="true" className="size-5 animate-pulse" />
      )}
      {image && failed && <ImageOff aria-hidden="true" className="size-5" />}
      {!image && (
        <FileText aria-hidden="true" className="size-6 text-blue-600" />
      )}
    </button>
  );
}

/** Galeri foto dokumentasi kegiatan fisik: kotak besar, judul, dan aksi. */
export function DocumentationGallery<
  T extends PreviewableReceipt & { date: string },
>({
  items,
  onDelete,
  onEdit,
  onOpen,
}: {
  items: T[];
  onDelete: (receipt: T) => void;
  onEdit: (receipt: T) => void;
  onOpen: (receipt: T) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
          key={item.id}
        >
          <ReceiptThumb
            className="aspect-video h-auto w-full rounded-none border-0"
            onOpen={() => onOpen(item)}
            receipt={item}
          />
          <div className="space-y-1 p-3">
            <p className="line-clamp-2 font-semibold text-slate-900 text-sm">
              {item.title}
            </p>
            <p className="text-slate-500 text-xs">{item.date}</p>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                aria-label={`Edit ${item.title}`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => onEdit(item)}
                type="button"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label={`Hapus ${item.title}`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                onClick={() => onDelete(item)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

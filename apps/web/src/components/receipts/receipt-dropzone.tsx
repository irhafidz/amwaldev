import {
  ALLOWED_RECEIPT_MIME_TYPES,
  isAllowedReceiptMimeType,
  MAX_RECEIPT_FILE_SIZE_BYTES,
} from '@amwal/core/storage/mime';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileCheck,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type {
  FileValidationError,
  ReceiptAttachmentItem,
  ReceiptDropzoneProps,
} from './types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file: File): FileValidationError | null {
  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return {
      type: 'SIZE_EXCEEDED',
      message: `Ukuran berkas "${file.name}" (${formatFileSize(file.size)}) melebihi batas maksimum 5 MB.`,
      maxSizeBytes: MAX_RECEIPT_FILE_SIZE_BYTES,
      actualSizeBytes: file.size,
    };
  }

  const isMimeAllowed = isAllowedReceiptMimeType(file.type);
  const lowerName = file.name.toLowerCase();
  const hasValidExt =
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.pdf');

  if (!(isMimeAllowed || hasValidExt)) {
    return {
      type: 'INVALID_MIME',
      message: `Format berkas "${file.name}" tidak didukung. Hanya menerima format JPG, PNG, WebP, dan PDF.`,
      mimeType: file.type,
      allowedMimes: ALLOWED_RECEIPT_MIME_TYPES,
    };
  }

  return null;
}

function getHumanErrorMessage(status: number, defaultError?: string): string {
  switch (status) {
    case 400:
      return (
        defaultError || 'Permintaan tidak valid atau data form tidak lengkap.'
      );
    case 401:
      return 'Sesi login Anda telah berakhir. Silakan login kembali.';
    case 403:
      return 'Akses ditolak: Hanya akun Administrator yang berhak mengunggah kuitansi.';
    case 404:
      return 'Program wakaf tidak ditemukan pada server.';
    case 413:
      return 'Ukuran berkas melebihi batas maksimum 5 MB dari server.';
    case 415:
      return 'Format berkas ditolak oleh server (magic bytes terdeteksi tidak valid).';
    case 500:
      return (
        defaultError ||
        'Terjadi kesalahan pada basis data atau server saat menyimpan berkas.'
      );
    default:
      return defaultError || `Gagal mengunggah berkas (HTTP ${status}).`;
  }
}

interface ItemRowProps {
  item: ReceiptAttachmentItem;
  disabled: boolean;
  onRemove: (id: string) => void;
  onTogglePhotoEvidence: (id: string, checked: boolean) => void;
  onRetry: (item: ReceiptAttachmentItem) => void;
}

function ReceiptItemRow({
  item,
  disabled,
  onRemove,
  onTogglePhotoEvidence,
  onRetry,
}: ItemRowProps) {
  const isImage = item.mimeType.startsWith('image/');
  const isUploading = item.status === 'uploading';
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';
  const switchId = `photo-switch-${item.id}`;

  return (
    <li
      className={cn(
        'group flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition-all sm:flex-row sm:items-center sm:justify-between',
        isError && 'border-destructive/40 bg-destructive/5',
        isSuccess && 'border-border/80 hover:border-border',
        isUploading && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/60">
          {isImage && item.previewUrl ? (
            // biome-ignore lint/performance/noImgElement: pratinjau thumbnail kuitansi lokal/blob
            <img
              alt={item.fileName}
              className="size-full object-cover"
              src={item.previewUrl}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-0.5 text-muted-foreground">
              <FileText className="size-6 text-sky-600 dark:text-sky-400" />
              <span className="font-bold font-mono text-[9px] uppercase">
                PDF
              </span>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-xs">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p
            className="truncate font-medium text-body-sm text-foreground"
            title={item.fileName}
          >
            {item.fileName}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            <span>{formatFileSize(item.fileSize)}</span>
            <span>•</span>
            {isUploading && (
              <span className="flex items-center gap-1 font-medium text-primary">
                <Loader2 className="size-3 animate-spin" />
                Mengunggah...
              </span>
            )}
            {isSuccess && (
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" />
                Tersimpan
              </span>
            )}
            {isError && (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <AlertCircle className="size-3" />
                Gagal
              </span>
            )}
          </div>
          {isError && item.errorMessage && (
            <p className="font-medium text-[11px] text-destructive">
              {item.errorMessage}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 dark:bg-background/20">
          <Switch
            aria-label={`Tandai ${item.fileName} sebagai foto bukti fisik`}
            checked={item.isPhotoEvidence}
            disabled={disabled || isUploading}
            id={switchId}
            onCheckedChange={(checked) =>
              onTogglePhotoEvidence(item.id, checked)
            }
          />
          <Label
            className="cursor-pointer select-none font-medium text-[12px] text-foreground"
            htmlFor={switchId}
          >
            {item.isPhotoEvidence ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                <Camera className="size-3" />
                Bukti Fisik
              </span>
            ) : (
              <span className="text-muted-foreground">Dokumen Kuitansi</span>
            )}
          </Label>
        </div>

        <div className="flex items-center gap-1">
          {isError && item.file && (
            <Button
              aria-label={`Coba unggah ulang ${item.fileName}`}
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => onRetry(item)}
              size="icon"
              title="Coba unggah ulang"
              type="button"
              variant="outline"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}

          <Button
            aria-label={`Hapus lampiran ${item.fileName}`}
            className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={disabled || isUploading}
            onClick={() => onRemove(item.id)}
            size="icon"
            title="Hapus lampiran"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function processFileList(
  files: FileList | File[],
  currentCount: number,
  maxAllowed: number,
  autoUpload: boolean
): {
  errors: string[];
  entries: { item: ReceiptAttachmentItem; file: File }[];
} {
  const errors: string[] = [];
  const entries: { item: ReceiptAttachmentItem; file: File }[] = [];
  const remainingSlots = Math.max(0, maxAllowed - currentCount);

  if (remainingSlots <= 0) {
    return {
      errors: [`Batas maksimum lampiran tercapai (${maxAllowed} berkas).`],
      entries: [],
    };
  }

  const fileArray = Array.from(files).slice(0, remainingSlots);

  for (const file of fileArray) {
    const validation = validateFile(file);
    if (validation) {
      errors.push(validation.message);
      continue;
    }

    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newItem: ReceiptAttachmentItem = {
      id: tempId,
      file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      isPhotoEvidence: isImage,
      status: autoUpload ? 'uploading' : 'idle',
      previewUrl,
    };

    entries.push({ item: newItem, file });
  }

  return { errors, entries };
}

export function ReceiptDropzone({
  waqfProgramId,
  progressReportId,
  value,
  onChange,
  onUploadSuccess,
  onUploadError,
  onAttachmentRemove,
  maxFiles = 10,
  disabled = false,
  className,
  autoUpload = true,
  customUploadFn,
}: ReceiptDropzoneProps) {
  const [items, setItems] = useState<ReceiptAttachmentItem[]>(value || []);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (value !== undefined) {
      setItems(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, [items]);

  const updateItems = useCallback(
    (newItems: ReceiptAttachmentItem[]) => {
      setItems(newItems);
      onChange?.(newItems);
    },
    [onChange]
  );

  const performUpload = useCallback(
    async (item: ReceiptAttachmentItem, fileToUpload: File) => {
      if (!waqfProgramId) {
        const errorMsg =
          'Program wakaf ID diperlukan untuk mengunggah kuitansi.';
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'error', errorMessage: errorMsg }
              : it
          )
        );
        onUploadError?.(new Error(errorMsg), fileToUpload);
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: 'uploading', errorMessage: undefined }
            : it
        )
      );

      try {
        if (customUploadFn) {
          const res = await customUploadFn({
            waqfProgramId,
            progressReportId,
            file: fileToUpload,
            isPhotoEvidence: item.isPhotoEvidence,
          });

          setItems((prev) => {
            const updated = prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    id: res.id,
                    status: 'success' as const,
                    createdAt: res.createdAt,
                  }
                : it
            );
            onChange?.(updated);
            return updated;
          });

          const successItem: ReceiptAttachmentItem = {
            ...item,
            id: res.id,
            status: 'success',
            createdAt: res.createdAt,
          };
          onUploadSuccess?.(successItem);
          return;
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('waqfProgramId', waqfProgramId);
        formData.append('isPhotoEvidence', String(item.isPhotoEvidence));
        if (progressReportId) {
          formData.append('progressReportId', progressReportId);
        }

        const response = await fetch('/api/uploads/receipts', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        const json = (await response.json().catch(() => null)) as {
          success?: boolean;
          data?: {
            id: string;
            waqfProgramId: string;
            progressReportId: string | null;
            fileName: string;
            mimeType: string;
            fileSize: number;
            isPhotoEvidence: boolean;
            createdAt: string;
          };
          error?: string;
        } | null;

        if (!(response.ok && json?.data)) {
          const errMsg = getHumanErrorMessage(response.status, json?.error);
          throw new Error(errMsg);
        }

        const savedData = json.data;
        setItems((prev) => {
          const updated = prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  id: savedData.id,
                  status: 'success' as const,
                  createdAt: savedData.createdAt,
                }
              : it
          );
          onChange?.(updated);
          return updated;
        });

        const successItem: ReceiptAttachmentItem = {
          ...item,
          id: savedData.id,
          status: 'success',
          createdAt: savedData.createdAt,
        };
        onUploadSuccess?.(successItem);
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan jaringan saat mengunggah berkas.';
        setItems((prev) => {
          const updated = prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'error' as const, errorMessage: errorMsg }
              : it
          );
          onChange?.(updated);
          return updated;
        });
        onUploadError?.(new Error(errorMsg), fileToUpload);
      }
    },
    [
      waqfProgramId,
      progressReportId,
      customUploadFn,
      onChange,
      onUploadSuccess,
      onUploadError,
    ]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const { errors, entries } = processFileList(
        files,
        items.length,
        maxFiles,
        autoUpload
      );

      setValidationErrors(errors);

      if (entries.length > 0) {
        const addedItems = entries.map((n) => n.item);
        const combined = [...items, ...addedItems];
        updateItems(combined);

        if (autoUpload) {
          for (const entry of entries) {
            performUpload(entry.item, entry.file).catch(() => {
              // error is handled inside performUpload
            });
          }
        }
      }
    },
    [items, maxFiles, autoUpload, updateItems, performUpload]
  );

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || !e.dataTransfer.files) {
      return;
    }
    handleFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (idToRemove: string) => {
    const itemToRemove = items.find((i) => i.id === idToRemove);
    if (itemToRemove?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }
    const filtered = items.filter((i) => i.id !== idToRemove);
    updateItems(filtered);
    if (itemToRemove) {
      onAttachmentRemove?.(itemToRemove);
    }
  };

  const handleTogglePhotoEvidence = (id: string, checked: boolean) => {
    const updated = items.map((it) =>
      it.id === id ? { ...it, isPhotoEvidence: checked } : it
    );
    updateItems(updated);
  };

  const handleRetry = (item: ReceiptAttachmentItem) => {
    if (item.file) {
      performUpload(item, item.file).catch(() => {
        // error is handled inside performUpload
      });
    }
  };

  const photoCount = items.filter(
    (it) => it.isPhotoEvidence && it.status !== 'error'
  ).length;
  const docCount = items.filter(
    (it) => !it.isPhotoEvidence && it.status !== 'error'
  ).length;

  return (
    <section
      aria-label="Area unggah kuitansi dan bukti foto fisik"
      className={cn('space-y-4 font-jakarta', className)}
    >
      <input
        accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        className="sr-only"
        disabled={disabled}
        id={inputId}
        multiple
        onChange={handleInputChange}
        ref={fileInputRef}
        type="file"
      />

      <button
        aria-label="Klik atau seret berkas ke sini untuk mengunggah kuitansi dan bukti foto fisik"
        className={cn(
          'relative flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center outline-none transition-all duration-200',
          isDragOver
            ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
            : 'border-border/80 bg-background/50 hover:border-primary/50 hover:bg-muted/40',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled &&
            'cursor-pointer focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40'
        )}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            fileInputRef.current?.click();
          }
        }}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        type="button"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <UploadCloud className="size-6" />
        </div>

        <div className="mt-3 space-y-1">
          <p className="font-semibold text-body-sm text-foreground">
            Tarik & lepas berkas kuitansi atau bukti fisik di sini
          </p>
          <p className="text-caption text-muted-foreground">
            atau{' '}
            <span className="font-medium text-primary underline underline-offset-2">
              pilih berkas dari perangkat
            </span>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-caption text-muted-foreground">
          <Badge
            className="gap-1 border-border/60 bg-background/80 py-0.5 text-[11px]"
            variant="outline"
          >
            <ImageIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
            JPG, PNG, WebP
          </Badge>
          <Badge
            className="gap-1 border-border/60 bg-background/80 py-0.5 text-[11px]"
            variant="outline"
          >
            <FileText className="size-3 text-sky-600 dark:text-sky-400" />
            PDF Dokumen
          </Badge>
          <span className="text-[11px] text-muted-foreground/80">
            Maks. 5 MB per berkas
          </span>
        </div>
      </button>

      {validationErrors.length > 0 && (
        <div
          className="rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-body-sm text-destructive dark:bg-destructive/15"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[13px]">
                  Validasi Berkas Gagal:
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-caption">
                  {validationErrors.map((err, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: simple error message list
                    <li key={`err-${idx}`}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              aria-label="Tutup pesan peringatan validasi"
              className="rounded-md p-1 hover:bg-destructive/20"
              onClick={() => setValidationErrors([])}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-caption transition-colors',
            photoCount > 0
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300'
          )}
        >
          <div className="flex items-center gap-2">
            {photoCount > 0 ? (
              <FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Camera className="size-4 text-amber-600 dark:text-amber-400" />
            )}
            <span>
              {photoCount > 0 ? (
                <>
                  <strong className="font-semibold">
                    Syarat Bukti Terpenuhi:
                  </strong>{' '}
                  Terdapat <span className="font-bold">{photoCount}</span> foto
                  bukti fisik & <span className="font-bold">{docCount}</span>{' '}
                  dokumen kuitansi.
                </>
              ) : (
                <>
                  <strong className="font-semibold">
                    Perhatian (Aturan Invarian):
                  </strong>{' '}
                  Laporan progres mewajibkan minimal satu foto bukti fisik
                  barang/pengerjaan.
                </>
              )}
            </span>
          </div>

          <Badge
            className={cn(
              'h-6 text-[11px]',
              photoCount > 0
                ? 'bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600'
                : 'bg-amber-500 text-white dark:bg-amber-600'
            )}
            variant={photoCount > 0 ? 'default' : 'secondary'}
          >
            {photoCount > 0 ? '✓ Foto Terlampir' : 'Wajib 1 Foto'}
          </Badge>
        </div>
      )}

      {items.length > 0 && (
        <ul aria-label="Daftar lampiran berkas" className="space-y-2.5">
          {items.map((item) => (
            <ReceiptItemRow
              disabled={disabled}
              item={item}
              key={item.id}
              onRemove={handleRemove}
              onRetry={handleRetry}
              onTogglePhotoEvidence={handleTogglePhotoEvidence}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default ReceiptDropzone;

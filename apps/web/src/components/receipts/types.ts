import type { AllowedReceiptMimeType } from '@amwal/core/storage/mime';

export interface ReceiptAttachmentItem {
  /** Unique ID (generated temporarily on queue, or returned by backend on success) */
  id: string;
  /** The underlying File object for fresh uploads */
  file?: File;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Whether this attachment serves as physical photographic proof */
  isPhotoEvidence: boolean;
  /** Upload status */
  status: 'idle' | 'uploading' | 'success' | 'error';
  /** Upload progress percentage (0 - 100) */
  progress?: number;
  /** Error message if upload failed or validation failed */
  errorMessage?: string;
  /** Object URL for local image preview or remote signed URL */
  previewUrl?: string;
  /** Server creation timestamp if saved */
  createdAt?: string;
}

export interface ReceiptDropzoneProps {
  /** Target Waqf Program ID for receipt storage */
  waqfProgramId: string;
  /** Optional Progress Report ID if uploading directly under a report */
  progressReportId?: string | null;
  /** Initial or controlled list of attachment items */
  value?: ReceiptAttachmentItem[];
  /** Callback fired whenever attachment list updates */
  onChange?: (items: ReceiptAttachmentItem[]) => void;
  /** Callback fired when a file upload completes successfully */
  onUploadSuccess?: (item: ReceiptAttachmentItem) => void;
  /** Callback fired when an upload fails */
  onUploadError?: (error: Error, file: File) => void;
  /** Callback fired when an attachment is removed */
  onAttachmentRemove?: (item: ReceiptAttachmentItem) => void;
  /** Max number of concurrent files allowed (default: 10) */
  maxFiles?: number;
  /** Whether the dropzone is disabled */
  disabled?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Whether to automatically upload immediately upon drop/selection (default: true) */
  autoUpload?: boolean;
  /** Custom upload handler overriding default fetch to `/api/uploads/receipts` */
  customUploadFn?: (input: {
    waqfProgramId: string;
    progressReportId?: string | null;
    file: File;
    isPhotoEvidence: boolean;
  }) => Promise<{
    id: string;
    waqfProgramId: string;
    progressReportId: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    isPhotoEvidence: boolean;
    createdAt: string;
  }>;
}

export type FileValidationError =
  | {
      type: 'SIZE_EXCEEDED';
      message: string;
      maxSizeBytes: number;
      actualSizeBytes: number;
    }
  | {
      type: 'INVALID_MIME';
      message: string;
      mimeType: string;
      allowedMimes: readonly AllowedReceiptMimeType[];
    };

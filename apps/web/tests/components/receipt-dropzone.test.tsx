import { describe, expect, mock, test } from 'bun:test';
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  detectMimeTypeFromBuffer,
  isAllowedReceiptMimeType,
  MAX_RECEIPT_FILE_SIZE_BYTES,
} from '@amwal/core/storage/mime';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptDropzone } from '../../src/components/receipts/receipt-dropzone';
import type { ReceiptAttachmentItem } from '../../src/components/receipts/types';

describe('ReceiptDropzone Component (Sprint 11 [I-2])', () => {
  test('renders dropzone idle state correctly with instructions & badge hints', () => {
    const html = renderToStaticMarkup(
      <ReceiptDropzone waqfProgramId="prog-123" />
    );

    expect(html).toContain(
      'Tarik &amp; lepas berkas kuitansi atau bukti fisik'
    );
    expect(html).toContain('JPG, PNG, WebP');
    expect(html).toContain('PDF Dokumen');
    expect(html).toContain('Maks. 5 MB per berkas');
    expect(html).toContain('type="file"');
  });

  test('renders disabled dropzone state correctly', () => {
    const html = renderToStaticMarkup(
      <ReceiptDropzone disabled waqfProgramId="prog-123" />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor-not-allowed');
  });

  test('renders uploaded items and correctly displays image preview and PDF document icon', () => {
    const mockItems: ReceiptAttachmentItem[] = [
      {
        id: 'att-1',
        fileName: 'foto-pondasi.jpg',
        fileSize: 1024 * 1024, // 1 MB
        mimeType: 'image/jpeg',
        isPhotoEvidence: true,
        status: 'success',
        previewUrl: 'blob:http://localhost/test-blob-1',
        createdAt: '2026-09-18T00:00:00.000Z',
      },
      {
        id: 'att-2',
        fileName: 'invoice-semen.pdf',
        fileSize: 500 * 1024, // 500 KB
        mimeType: 'application/pdf',
        isPhotoEvidence: false,
        status: 'success',
        createdAt: '2026-09-18T00:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <ReceiptDropzone value={mockItems} waqfProgramId="prog-123" />
    );

    expect(html).toContain('foto-pondasi.jpg');
    expect(html).toContain('invoice-semen.pdf');
    expect(html).toContain('1.00 MB');
    expect(html).toContain('500.0 KB');
    expect(html).toContain('Bukti Fisik');
    expect(html).toContain('Dokumen Kuitansi');
    expect(html).toContain('Syarat Bukti Terpenuhi:');
    expect(html).toContain('foto bukti fisik');
    expect(html).toContain('dokumen kuitansi');
    expect(html).toContain('✓ Foto Terlampir');
  });

  test('renders uploading status with spinner animation', () => {
    const mockItems: ReceiptAttachmentItem[] = [
      {
        id: 'att-uploading',
        fileName: 'uploading-bukti.jpg',
        fileSize: 800 * 1024,
        mimeType: 'image/jpeg',
        isPhotoEvidence: true,
        status: 'uploading',
      },
    ];

    const html = renderToStaticMarkup(
      <ReceiptDropzone value={mockItems} waqfProgramId="prog-123" />
    );

    expect(html).toContain('Mengunggah...');
  });

  test('renders warning when no physical photo evidence is marked', () => {
    const mockItems: ReceiptAttachmentItem[] = [
      {
        id: 'att-2',
        fileName: 'kuitansi-tokobangunan.pdf',
        fileSize: 300 * 1024,
        mimeType: 'application/pdf',
        isPhotoEvidence: false,
        status: 'success',
      },
    ];

    const html = renderToStaticMarkup(
      <ReceiptDropzone value={mockItems} waqfProgramId="prog-123" />
    );

    expect(html).toContain('Perhatian (Aturan Invarian):');
    expect(html).toContain(
      'Laporan progres mewajibkan minimal satu foto bukti fisik'
    );
    expect(html).toContain('Wajib 1 Foto');
  });

  test('renders error state with human-friendly message and retry capability', () => {
    const mockItems: ReceiptAttachmentItem[] = [
      {
        id: 'att-failed',
        fileName: 'foto-rusak.png',
        fileSize: 2 * 1024 * 1024,
        mimeType: 'image/png',
        isPhotoEvidence: true,
        status: 'error',
        errorMessage:
          'Format berkas ditolak oleh server (magic bytes terdeteksi tidak valid).',
      },
    ];

    const html = renderToStaticMarkup(
      <ReceiptDropzone value={mockItems} waqfProgramId="prog-123" />
    );

    expect(html).toContain('Gagal');
    expect(html).toContain(
      'Format berkas ditolak oleh server (magic bytes terdeteksi tidak valid).'
    );
  });

  test('validates 5 MB size limit and MIME restrictions match core specification', () => {
    expect(MAX_RECEIPT_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(ALLOWED_RECEIPT_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    expect(isAllowedReceiptMimeType('image/jpeg')).toBe(true);
    expect(isAllowedReceiptMimeType('image/png')).toBe(true);
    expect(isAllowedReceiptMimeType('image/webp')).toBe(true);
    expect(isAllowedReceiptMimeType('application/pdf')).toBe(true);
    expect(isAllowedReceiptMimeType('text/html')).toBe(false);
    expect(isAllowedReceiptMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedReceiptMimeType('application/x-msdownload')).toBe(false);
  });

  test('magic bytes rejection verifies fail-closed security invariants', () => {
    const htmlPayload = new TextEncoder().encode(
      '<html><body>Fake JPEG</body></html>'
    );
    expect(detectMimeTypeFromBuffer(htmlPayload)).toBeNull();

    const svgPayload = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    expect(detectMimeTypeFromBuffer(svgPayload)).toBeNull();

    const validJpegHeader = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    ]);
    expect(detectMimeTypeFromBuffer(validJpegHeader)).toBe('image/jpeg');

    const validPdfHeader = new TextEncoder().encode('%PDF-1.4 header');
    expect(detectMimeTypeFromBuffer(validPdfHeader)).toBe('application/pdf');
  });

  test('supports custom upload function prop for testing or custom handlers', async () => {
    const customUploadFn = mock(
      async (input: {
        waqfProgramId: string;
        file: File;
        isPhotoEvidence: boolean;
      }) => {
        await Promise.resolve();
        return {
          id: 'custom-att-id',
          waqfProgramId: input.waqfProgramId,
          progressReportId: null,
          fileName: input.file.name,
          mimeType: input.file.type,
          fileSize: input.file.size,
          isPhotoEvidence: input.isPhotoEvidence,
          createdAt: new Date().toISOString(),
        };
      }
    );

    const file = new File(['fake content'], 'test.jpg', { type: 'image/jpeg' });
    const result = await customUploadFn({
      waqfProgramId: 'prog-abc',
      file,
      isPhotoEvidence: true,
    });

    expect(result.id).toBe('custom-att-id');
    expect(result.fileName).toBe('test.jpg');
    expect(result.isPhotoEvidence).toBe(true);
    expect(customUploadFn).toHaveBeenCalledTimes(1);
  });
});

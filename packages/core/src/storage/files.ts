import { createLocalDiskStorageClient, mediaRoot } from './local-disk';
import type { StorageClientLike } from './types';

export type { StorageBucketClient, StorageClientLike } from './types';

export interface UploadReceiptFileParams {
  bucket: string;
  path: string;
  fileBody: Buffer | Uint8Array;
  mimeType: string;
  client?: StorageClientLike;
}

export interface CreateReceiptSignedUrlParams {
  bucket: string;
  path: string;
  expiresInSeconds?: number;
  client?: StorageClientLike;
}

export interface DeleteReceiptFileParams {
  bucket: string;
  path: string;
  client?: StorageClientLike;
}

export interface BuildReceiptObjectKeyParams {
  bucket?: string;
  programId: number | string;
  fileId: string;
  extension: string;
}

const LEADING_DOT_REGEX = /^\./;

let registeredClient: StorageClientLike | null = null;

/** Suntik klien (tes) atau `null` untuk kembali ke disk lokal. */
export const setStorageClient = (client: StorageClientLike | null): void => {
  registeredClient = client;
};

let diskClient: { root: string; client: StorageClientLike } | null = null;

/**
 * Klien penyimpanan dalam urutan fail-closed:
 * 1. klien yang diberikan pemanggil
 * 2. klien global terdaftar (`setStorageClient`, untuk tes)
 * 3. disk lokal di `MEDIA_ROOT` (volume Docker persisten; keputusan D4)
 * Di produksi `MEDIA_ROOT` wajib diatur, jika tidak error eksplisit.
 */
export const getSafeStorageClient = (
  injectedClient?: StorageClientLike
): StorageClientLike => {
  if (injectedClient) {
    return injectedClient;
  }
  if (registeredClient) {
    return registeredClient;
  }
  const root = mediaRoot();
  if (diskClient?.root !== root) {
    diskClient = { root, client: createLocalDiskStorageClient(root) };
  }
  return diskClient.client;
};

/**
 * Uploads a receipt file to private media storage with fail-closed security invariants.
 * Throws explicit error on any failure. Never returns dummy or mock paths.
 */
export const uploadReceiptFile = async (
  params: UploadReceiptFileParams
): Promise<{ path: string }> => {
  const client = getSafeStorageClient(params.client);

  const { data, error } = await client.storage
    .from(params.bucket)
    .upload(params.path, params.fileBody, {
      contentType: params.mimeType,
      upsert: true,
    });

  if (error || !data?.path) {
    throw new Error(
      `Fail-closed: Upload receipt file failed: ${error?.message ?? 'No path returned'}`
    );
  }

  return { path: data.path };
};

/**
 * Creates a signed URL for private receipt access with a default TTL of 600 seconds (10 minutes).
 * Throws explicit error on failure. Never returns dummy URLs.
 */
export const createReceiptSignedUrl = async (
  params: CreateReceiptSignedUrlParams
): Promise<string> => {
  const client = getSafeStorageClient(params.client);
  const ttl = params.expiresInSeconds ?? 600;

  const { data, error } = await client.storage
    .from(params.bucket)
    .createSignedUrl(params.path, ttl);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Fail-closed: Create receipt signed URL failed: ${error?.message ?? 'No signed URL returned'}`
    );
  }

  return data.signedUrl;
};

/**
 * Deletes a receipt file from private storage (e.g. compensation if database record creation fails).
 * Throws explicit error on failure.
 */
export const deleteReceiptFile = async (
  params: DeleteReceiptFileParams
): Promise<void> => {
  const client = getSafeStorageClient(params.client);

  const { error } = await client.storage
    .from(params.bucket)
    .remove([params.path]);

  if (error) {
    throw new Error(
      `Fail-closed: Delete receipt file failed: ${error.message}`
    );
  }
};

/**
 * Builds canonical object key for private receipt storage:
 * amwal-receipts/<programId>/<ulid>.<ext>
 */
export const buildReceiptObjectKey = (
  params: BuildReceiptObjectKeyParams
): string => {
  const bucket = params.bucket ?? 'amwal-receipts';
  const cleanExt = params.extension
    .replace(LEADING_DOT_REGEX, '')
    .toLowerCase();
  return `${bucket}/${params.programId}/${params.fileId}.${cleanExt}`;
};

/**
 * Parses a canonical object key back into bucket and relative path.
 */
export const parseReceiptObjectKey = (
  objectKey: string
): { bucket: string; path: string } => {
  const parts = objectKey.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid object key format: ${objectKey}`);
  }
  const bucket = parts[0] ?? '';
  const path = parts.slice(1).join('/');

  if (!(bucket && path)) {
    throw new Error(`Invalid object key components: ${objectKey}`);
  }

  return { bucket, path };
};

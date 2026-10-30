export interface StorageError {
  message: string;
  name?: string;
}

/** Klien bucket: bentuknya meniru API storage lama supaya tes dan pemanggil tetap sama. */
export interface StorageBucketClient {
  upload: (
    path: string,
    fileBody: Buffer | Uint8Array,
    fileOptions?: { contentType?: string; upsert?: boolean }
  ) => Promise<{
    data: { path: string } | null;
    error: StorageError | null;
  }>;
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{
    data: { signedUrl: string } | null;
    error: StorageError | null;
  }>;
  remove: (
    paths: string[]
  ) => Promise<{ data: unknown[] | null; error: StorageError | null }>;
}

export interface StorageClientLike {
  storage: {
    from: (bucket: string) => StorageBucketClient;
  };
}

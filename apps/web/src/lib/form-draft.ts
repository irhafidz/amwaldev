/**
 * Draf form di `sessionStorage` (UAT #4: form program yang panjang hilang
 * bila halaman ter-refresh). Hanya untuk satu tab dan satu sesi: tertutup
 * otomatis saat tab ditutup, jadi tidak ada data lama yang menggantung.
 * Semua akses dibungkus try/catch karena penyimpanan bisa diblokir.
 */

export interface StoredDraft<T> {
  /** Ada berkas (banner, RAB, legalitas) yang tidak ikut tersimpan. */
  hadFiles: boolean;
  savedAt: number;
  value: T;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readDraft<T>(
  key: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = safeSession()
): StoredDraft<T> | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    if (
      typeof parsed.savedAt !== 'number' ||
      parsed.value === undefined ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    return {
      hadFiles: Boolean(parsed.hadFiles),
      savedAt: parsed.savedAt,
      value: parsed.value,
    };
  } catch {
    return null;
  }
}

export function writeDraft<T>(
  key: string,
  value: T,
  hadFiles: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = safeSession()
): void {
  try {
    storage?.setItem(
      key,
      JSON.stringify({ hadFiles, savedAt: Date.now(), value })
    );
  } catch {
    // Penyimpanan penuh/diblokir: draf sekadar tidak tersimpan.
  }
}

export function clearDraft(
  key: string,
  storage: Pick<Storage, 'removeItem'> | undefined = safeSession()
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Tidak ada yang perlu dilakukan.
  }
}

function safeSession(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return;
  }
}

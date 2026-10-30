import { describe, expect, test } from 'bun:test';
import { clearDraft, readDraft, writeDraft } from '../src/lib/form-draft';

/** Penyimpanan palsu dalam memori; murni, tanpa browser. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    raw: data,
  };
}

describe('form-draft', () => {
  test('menulis lalu membaca draf yang sama', () => {
    const storage = memoryStorage();
    writeDraft('k', { name: 'Wakaf Masjid' }, true, storage);
    const draft = readDraft<{ name: string }>('k', storage);
    expect(draft?.value).toEqual({ name: 'Wakaf Masjid' });
    expect(draft?.hadFiles).toBe(true);
  });

  test('tanpa draf: null', () => {
    expect(readDraft('k', memoryStorage())).toBeNull();
  });

  test('draf lebih dari 24 jam dibuang', () => {
    const storage = memoryStorage();
    storage.setItem(
      'k',
      JSON.stringify({
        hadFiles: false,
        savedAt: Date.now() - 25 * 60 * 60 * 1000,
        value: { a: 1 },
      })
    );
    expect(readDraft('k', storage)).toBeNull();
    expect(storage.raw.has('k')).toBe(false);
  });

  test('isi rusak tidak melempar galat', () => {
    const storage = memoryStorage();
    storage.setItem('k', '{bukan json');
    expect(readDraft('k', storage)).toBeNull();
  });

  test('clearDraft menghapus; penyimpanan yang melempar galat tidak merusak', () => {
    const storage = memoryStorage();
    writeDraft('k', { a: 1 }, false, storage);
    clearDraft('k', storage);
    expect(readDraft('k', storage)).toBeNull();

    const blocked = {
      getItem: () => {
        throw new Error('diblokir');
      },
      removeItem: () => {
        throw new Error('diblokir');
      },
      setItem: () => {
        throw new Error('penuh');
      },
    };
    expect(() => writeDraft('k', 1, false, blocked)).not.toThrow();
    expect(() => clearDraft('k', blocked)).not.toThrow();
    expect(readDraft('k', blocked)).toBeNull();
  });
});

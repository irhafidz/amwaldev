import { describe, expect, test } from 'bun:test';
import {
  REVOKE_DELAY_MS,
  type SaveBlobEnv,
  saveBlobAs,
} from '../../src/lib/save-blob';

/** Lingkungan palsu yang mencatat urutan kejadian unduhan. */
function fakeEnv() {
  const log: string[] = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const anchor = {
    href: '',
    download: '',
    rel: '',
    style: { display: '' },
    click: () => log.push(`click ${anchor.download}`),
    remove: () => log.push('remove'),
  };
  const env: SaveBlobEnv = {
    createObjectURL: () => {
      log.push('create');
      return 'blob:amwal/1';
    },
    revokeObjectURL: (url) => log.push(`revoke ${url}`),
    document: {
      createElement: () => anchor as unknown as HTMLAnchorElement,
      body: {
        appendChild: (node: unknown) => {
          log.push('append');
          return node;
        },
      } as unknown as HTMLElement,
    },
    setTimeout: (callback, ms) => timers.push({ callback, ms }),
  };
  return { env, log, timers, anchor };
}

describe('saveBlobAs (QA-11)', () => {
  test('attaches the anchor before clicking and never revokes synchronously', () => {
    const { env, log, timers } = fakeEnv();
    saveBlobAs(new Blob(['%PDF-']), 'sertifikat-wakaf-1.pdf', env);

    expect(log).toEqual([
      'create',
      'append',
      'click sertifikat-wakaf-1.pdf',
      'remove',
    ]);
    // Dicabut belum — unduhan dimulai asinkron dan butuh URL-nya tetap hidup.
    expect(log).not.toContain('revoke blob:amwal/1');
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(REVOKE_DELAY_MS);

    timers[0]?.callback();
    expect(log.at(-1)).toBe('revoke blob:amwal/1');
  });

  test('the anchor is hidden and points at the blob URL', () => {
    const { env, anchor } = fakeEnv();
    saveBlobAs(new Blob(['x']), 'a.pdf', env);
    expect(anchor.href).toBe('blob:amwal/1');
    expect(anchor.style.display).toBe('none');
    expect(anchor.rel).toBe('noopener');
  });

  test('still schedules the revoke if click throws', () => {
    const { env, anchor, timers } = fakeEnv();
    anchor.click = () => {
      throw new Error('blocked');
    };
    expect(() => saveBlobAs(new Blob(['x']), 'a.pdf', env)).toThrow('blocked');
    expect(timers).toHaveLength(1);
  });
});

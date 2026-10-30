import { describe, expect, test } from 'bun:test';
import {
  buildShareLink,
  buildShareMessage,
  buildWhatsAppShareUrl,
} from '../src/components/share/share-template';

/**
 * `I-3` — the chat template is the only part of the share flow that can be
 * wrong in a way users notice (points at the wrong program, loses the
 * referral code, or arrives as a wall of text). The button's platform
 * plumbing is exercised in the browser; the message itself is pinned here.
 */

describe('share template — deep link', () => {
  test('appends ?ref= with the opaque referral code', () => {
    expect(buildShareLink('https://amwal.id/wakaf/masjid', 'ABC123')).toBe(
      'https://amwal.id/wakaf/masjid?ref=ABC123'
    );
  });

  test('keeps an existing query string intact', () => {
    expect(
      buildShareLink('https://amwal.id/wakaf/masjid?utm=chat', 'ABC123')
    ).toBe('https://amwal.id/wakaf/masjid?utm=chat&ref=ABC123');
  });

  test('leaves the link untouched when nobody is signed in', () => {
    expect(buildShareLink('https://amwal.id/wakaf/masjid', null)).toBe(
      'https://amwal.id/wakaf/masjid'
    );
    expect(buildShareLink('https://amwal.id/wakaf/masjid', '   ')).toBe(
      'https://amwal.id/wakaf/masjid'
    );
  });
});

describe('share template — message body', () => {
  test('carries program title, short description and the deep link', () => {
    const message = buildShareMessage({
      judul: 'Pembangunan Masjid',
      deskripsi: 'Renovasi ruang utama untuk 400 jamaah.',
      url: 'https://amwal.id/wakaf/masjid',
      refCode: 'ABC123',
      ajakan: 'berwakaf',
    });

    expect(message).toContain(
      'Mari berwakaf untuk program "Pembangunan Masjid"'
    );
    expect(message).toContain('Renovasi ruang utama untuk 400 jamaah.');
    expect(message).toContain('https://amwal.id/wakaf/masjid?ref=ABC123');
  });

  test('defaults the invitation verb when the module does not set one', () => {
    const message = buildShareMessage({
      judul: 'Zakat Maal',
      url: 'https://amwal.id/zakat',
    });

    expect(message).toContain('Mari berdonasi untuk program "Zakat Maal"');
  });

  test('omits the description block when there is no description', () => {
    const message = buildShareMessage({
      judul: 'Infaq Jumat',
      url: 'https://amwal.id/infaq',
    });

    expect(message).not.toContain('\n\n\n');
    expect(message.split('\n').filter(Boolean)).toHaveLength(2);
  });

  test('shortens a long description on a word boundary', () => {
    const message = buildShareMessage({
      judul: 'Qurban 1448',
      deskripsi: `${'kata '.repeat(60)}akhir`,
      url: 'https://amwal.id/qurban',
    });

    const summary = message.split('\n')[2] ?? '';
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(161);
    expect(summary).not.toContain('  ');
  });
});

describe('share template — WhatsApp fallback', () => {
  test('URL-encodes the whole message, newlines included', () => {
    const message = buildShareMessage({
      judul: 'Wakaf Pendidikan',
      url: 'https://amwal.id/wakaf/pendidikan',
    });
    const whatsappUrl = buildWhatsAppShareUrl(message);

    expect(whatsappUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(whatsappUrl).not.toContain('\n');
    expect(decodeURIComponent(whatsappUrl.split('text=')[1] ?? '')).toBe(
      message
    );
  });
});

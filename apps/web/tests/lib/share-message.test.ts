import { describe, expect, test } from 'bun:test';
import {
  buildShareMessage,
  buildTwitterShareUrl,
  buildWhatsAppShareUrl,
  SHARE_CATEGORIES,
  type ShareCategory,
} from '../../src/lib/share/message';

const CATEGORY_LABELS: Record<ShareCategory, string> = {
  INFAQ: 'Infaq',
  QURBAN: 'Qurban',
  SEDEKAH: 'Sedekah',
  WAKAF: 'Wakaf',
  ZAKAT: 'Zakat',
};

describe('share message utility [I-3]', () => {
  test('builds a persuasive message for every donation category', () => {
    for (const category of SHARE_CATEGORIES) {
      const message = buildShareMessage({
        category,
        title: 'Program Kebaikan',
        url: 'https://amwal.id/program/kebaikan',
      });

      expect(message).toContain(CATEGORY_LABELS[category]);
      expect(message).toContain('Program Kebaikan');
      expect(message).toContain('https://amwal.id/program/kebaikan');
      expect(message).toContain('Salurkan kebaikan Anda sekarang:');
    }
  });

  test('formats target and collected amounts with progress percentage', () => {
    const message = buildShareMessage({
      category: 'WAKAF',
      collectedAmount: 25_000_000,
      targetAmount: 100_000_000,
      title: 'Wakaf Produktif',
      url: 'https://amwal.id/wakaf-produktif',
    });

    expect(message).toContain('Terkumpul');
    expect(message).toContain('25.000.000');
    expect(message).toContain('target');
    expect(message).toContain('100.000.000');
    expect(message).toContain('(25%)');
  });

  test('supports collected-only and omits URL when requested', () => {
    const collectedOnly = buildShareMessage({
      category: 'SEDEKAH',
      collectedAmount: 1_500_000,
      title: 'Sedekah Yatim',
      url: 'https://amwal.id/sedekah-yatim',
    });
    const withoutUrl = buildShareMessage(
      {
        category: 'ZAKAT',
        title: 'Zakat Maal',
        url: 'https://amwal.id/zakat-maal',
      },
      { includeUrl: false }
    );

    expect(collectedOnly).toContain('Terkumpul:');
    expect(collectedOnly).toContain('1.500.000');
    expect(withoutUrl).not.toContain('https://amwal.id/zakat-maal');
    expect(withoutUrl).toContain('Salurkan kebaikan Anda sekarang:');
  });

  test('encodes WhatsApp and Twitter payloads as valid URLs', () => {
    const text = 'Wakaf "Pendidikan" & Kesehatan\nAyo donasi!';
    const url = 'https://amwal.id/program?utm=share&ref=a b';
    const whatsapp = buildWhatsAppShareUrl(text, url);
    const twitter = buildTwitterShareUrl(text, url);

    expect(whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    expect(whatsapp).toContain(encodeURIComponent(`${text}\n${url}`));
    expect(whatsapp).not.toContain(' ');

    expect(twitter.startsWith('https://twitter.com/intent/tweet?')).toBe(true);
    expect(twitter).toContain(`text=${encodeURIComponent(text)}`);
    expect(twitter).toContain(`url=${encodeURIComponent(url)}`);
    expect(twitter).not.toContain('a b');
  });
});

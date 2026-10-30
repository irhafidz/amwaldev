import { describe, expect, test } from 'bun:test';
import {
  parseYoutubeVideoId,
  youtubeEmbedUrl,
  youtubeLinkSchema,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '../../src/education/youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeVideoId', () => {
  test.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=30`,
    `https://youtu.be/${ID}?si=abcDEF`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/v/${ID}`,
    `  https://youtu.be/${ID}  `,
    `youtube.com/watch?v=${ID}`,
    `www.youtu.be/${ID}`.replace('www.', ''),
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ])('accepts %s', (input) => {
    expect(parseYoutubeVideoId(input)).toBe(ID);
  });

  test.each([
    ['empty', ''],
    ['blank', '   '],
    ['plain text', 'bukan tautan'],
    ['other video site', `https://vimeo.com/${ID}`],
    ['channel page', 'https://www.youtube.com/@amwal'],
    ['playlist only', 'https://www.youtube.com/playlist?list=PL1234567890A'],
    ['watch without v', 'https://www.youtube.com/watch'],
    ['id too short', 'https://youtu.be/short'],
    ['id too long', `https://youtu.be/${ID}EXTRA`],
    ['id with illegal chars', 'https://www.youtube.com/watch?v=abc<script>1'],
    ['youtube root', 'https://www.youtube.com/'],
    ['mp4 file', 'https://cdn.example.com/video.mp4'],
    ['file scheme', `file:///etc/passwd?v=${ID}`],
    ['javascript scheme', `javascript:alert('youtube.com/watch?v=${ID}')`],
    ['data scheme', `data:text/html,youtube.com/watch?v=${ID}`],
  ])('rejects %s', (_label, input) => {
    expect(parseYoutubeVideoId(input)).toBeNull();
  });

  test.each([
    [
      'suffix-spoofed host',
      `https://www.youtube.com.evil.example/watch?v=${ID}`,
    ],
    ['prefix-spoofed host', `https://evilyoutube.com/watch?v=${ID}`],
    ['youtube in the path', `https://evil.example/youtube.com/watch?v=${ID}`],
    [
      'youtube in the query',
      `https://evil.example/?u=youtube.com/watch?v=${ID}`,
    ],
    ['userinfo trick', `https://youtube.com@evil.example/watch?v=${ID}`],
    [
      'userinfo with youtube host',
      `https://user:pass@www.youtube.com/watch?v=${ID}`,
    ],
    ['lookalike short host', `https://youtu.be.evil.example/${ID}`],
    ['unknown subdomain', `https://evil.youtube.com/watch?v=${ID}`],
    ['punycode lookalike', `https://xn--youtub-8ve.com/watch?v=${ID}`],
  ])('rejects %s', (_label, input) => {
    expect(parseYoutubeVideoId(input)).toBeNull();
  });

  test('rejects absurdly long input without throwing', () => {
    expect(
      parseYoutubeVideoId(`https://youtu.be/${ID}?${'a'.repeat(5000)}`)
    ).toBeNull();
  });
});

describe('url builders', () => {
  test('watch, embed and thumbnail URLs are built only from the ID', () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeThumbnailUrl(ID)).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`
    );
    expect(youtubeEmbedUrl(ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1`
    );
    expect(youtubeEmbedUrl(ID, { autoplay: true })).toContain('autoplay=1');
  });
});

describe('youtubeLinkSchema', () => {
  test('normalises any valid link to the canonical watch URL', () => {
    for (const input of [
      `https://youtu.be/${ID}?t=5`,
      `https://www.youtube.com/embed/${ID}`,
      `youtube.com/shorts/${ID}`,
    ]) {
      expect(youtubeLinkSchema.parse(input)).toBe(youtubeWatchUrl(ID));
    }
  });

  test('gives a readable message for anything else', () => {
    const result = youtubeLinkSchema.safeParse('https://vimeo.com/123456789');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Tautan bukan video YouTube yang valid'
    );
    expect(youtubeLinkSchema.safeParse('').error?.issues[0]?.message).toBe(
      'Tautan video YouTube wajib diisi'
    );
  });
});

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from '../src/components/chat/chat-markdown';

const render = (content: string) =>
  renderToStaticMarkup(<ChatMarkdown content={content} />);

describe('ChatMarkdown', () => {
  test('renders bold, lists and numbered lists', () => {
    const html = render(
      '**Nisab** setara 85 gram.\n\n- Satu\n- Dua\n\n1. Pertama\n2. Kedua'
    );

    expect(html).toContain('<strong>Nisab</strong>');
    expect(html).toContain('<ul');
    expect(html).toContain('<li>Satu</li>');
    expect(html).toContain('<ol');
    expect(html).toContain('<li>Kedua</li>');
  });

  test('never emits active markup from model output', () => {
    const html = render(
      '<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[klik](javascript:alert(1))'
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
  });

  test('links are http(s) only and open safely', () => {
    const html = render('[Baznas](https://baznas.go.id)');

    expect(html).toContain('href="https://baznas.go.id"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});

import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdminPageHeader,
  AdminTabs,
} from '../src/components/admin/admin-primitives';
import { YoutubeLinkField } from '../src/components/admin/youtube-link-field';
import { YoutubeEmbed } from '../src/components/education/youtube-embed';
import { SegmentedTabs } from '../src/components/ui/segmented-tabs';
import { SelectField } from '../src/components/ui/select-field';

/** Rendering to static markup never fires handlers. */
function noop(): void {
  return;
}

describe('SelectField', () => {
  const html = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(
        SelectField,
        { 'aria-label': 'Kategori', value: 'a', onChange: noop, ...props },
        createElement('option', { value: '' }, 'Semua'),
        createElement('option', { value: 'a' }, 'Satu')
      )
    );

  test('renders a Radix combobox trigger (no native select popup) showing the selected label', () => {
    const markup = html();

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Kategori"');
    expect(markup).toContain('Satu');
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('aria-invalid');
  });

  test('an empty-string option can be selected (mapped around Radix)', () => {
    expect(html({ value: '' })).toContain('Semua');
  });

  test('error and disabled states are styled and exposed', () => {
    expect(html({ error: true })).toContain('aria-invalid="true"');
    expect(html({ error: true })).toContain('border-rose-400');
    expect(html({ disabled: true })).toContain('disabled=""');
    expect(html({ disabled: true })).toContain('text-slate-300');
  });

  test('className only styles the wrapper (layout), not the control', () => {
    const markup = html({ className: 'w-full sm:w-48' });

    expect(
      markup.startsWith('<div class="relative inline-block w-full sm:w-48"')
    ).toBe(true);
  });
});

describe('AdminTabs', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminTabs<'a' | 'b'>, {
      label: 'Contoh',
      onChange: noop,
      tabs: [
        { id: 'a', label: 'Satu', count: 3 },
        { id: 'b', label: 'Dua' },
      ],
      value: 'a',
    })
  );

  test('active tab has an emerald-700 underline, others are transparent', () => {
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain(
      'border-emerald-700 font-semibold text-emerald-900'
    );
    expect(markup).toContain('bg-emerald-50 text-emerald-700');
    expect(markup).not.toContain('rounded-full bg-[#1B5E20]');
    expect(markup).toContain('border-transparent font-medium text-slate-500');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-selected="false"/g)).toHaveLength(1);
  });

  test('shows the count next to its label', () => {
    expect(markup).toContain('Satu');
    expect(markup).toContain('>3<');
  });
});

describe('AdminPageHeader', () => {
  test('is the emerald hero: white title, mint description, mosaic overlay', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPageHeader, {
        title: 'Judul',
        description: 'Deskripsi',
        badge: createElement('span', null, 'Lencana'),
        actions: createElement('button', { type: 'button' }, 'Aksi'),
      })
    );

    expect(markup).toContain('bg-[#356152]');
    expect(markup).toContain('text-white');
    expect(markup).toContain('text-emerald-100');
    expect(markup).toContain('/patterns/islamic-mosaic-single.png');
    for (const text of ['Judul', 'Deskripsi', 'Lencana', 'Aksi']) {
      expect(markup).toContain(text);
    }
  });
});

describe('SegmentedTabs', () => {
  const markup = renderToStaticMarkup(
    createElement(SegmentedTabs<'a' | 'b'>, {
      label: 'Contoh',
      onChange: noop,
      tabs: [
        { id: 'a', label: 'Satu' },
        { id: 'b', label: 'Dua' },
      ],
      value: 'b',
    })
  );

  test('is a rounded-xl slate track with a white shadow-sm active segment, not capsules', () => {
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('rounded-xl bg-slate-100 p-1');
    expect(markup).toContain('bg-white font-medium');
    expect(markup).toContain('shadow-sm');
    expect(markup).not.toContain('rounded-full');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
  });
});

describe('YoutubeEmbed', () => {
  const markup = renderToStaticMarkup(
    createElement(YoutubeEmbed, { videoId: 'dQw4w9WgXcQ', title: 'Kajian' })
  );

  test('is a responsive 16:9 iframe with fullscreen enabled', () => {
    expect(markup).toContain('aspect-video w-full rounded-xl');
    expect(markup).toContain('allowFullScreen');
    expect(markup).toContain('fullscreen');
    expect(markup).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&amp;modestbranding=1"'
    );
    expect(markup).toContain('title="Kajian"');
  });
});

describe('YoutubeLinkField', () => {
  const render = (value: string) =>
    renderToStaticMarkup(
      createElement(YoutubeLinkField, {
        id: 'yt',
        onChange: noop,
        title: 'Pratinjau',
        value,
      })
    );

  test('has the required label and placeholder and no file input', () => {
    const markup = render('');
    expect(markup).toContain('Tautan Video YouTube');
    expect(markup).toContain(
      'placeholder="Contoh: https://www.youtube.com/watch?v=... atau https://youtu.be/..."'
    );
    expect(markup).not.toContain('type="file"');
    expect(markup).not.toContain('<iframe');
  });

  test('shows an interactive preview for a valid link', () => {
    const markup = render('https://youtu.be/dQw4w9WgXcQ');
    expect(markup).toContain('<iframe');
    expect(markup).toContain('/embed/dQw4w9WgXcQ');
    expect(markup).toContain('aria-invalid="false"');
  });

  test('flags an invalid link and shows no preview', () => {
    const markup = render(
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('Tautan bukan video YouTube yang valid');
    expect(markup).not.toContain('<iframe');
  });
});

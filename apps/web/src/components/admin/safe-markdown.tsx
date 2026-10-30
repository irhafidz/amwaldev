import { BookOpen, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Perender Markdown ringan untuk konten CMS edukasi/berita.
 *
 * Menggantikan jalur `dangerouslySetInnerHTML` dari desain acuan: seluruh
 * keluaran adalah node React (teks di-escape oleh React), tautan hanya
 * http(s), dan tag HTML warisan editor lama dibuang menjadi teks biasa.
 * Subset yang didukung: `#`/`##`/`###`, `>` kutipan (dalil bila diawali
 * 🕋/📜 atau memuat kata "dalil"), daftar `-`/`1.`, `---`, serta inline
 * `**tebal**`, `*miring*`, `~~coret~~`, `` `kode` ``, `[teks](https://…)`.
 */

const BLOCK_SPLIT = /\n\s*\n/;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_BREAK = /<br\s*\/?>|<\/(p|div|h[1-6]|li|blockquote)>/gi;
const INLINE_TOKEN =
  /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const LINK_TOKEN = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const HTTP_URL = /^https?:\/\//i;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE_PREFIX = /^>\s?/;
const BULLET = /^[-*•]\s+/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const HR = /^(-{3,}|\*{3,})$/;

function stripLegacyHtml(raw: string): string {
  return raw.replace(HTML_BREAK, '\n').replace(HTML_TAG, '');
}

function renderToken(token: string, key: string): ReactNode {
  if (token.startsWith('**')) {
    return (
      <strong className="font-bold text-slate-900" key={key}>
        {token.slice(2, -2)}
      </strong>
    );
  }
  if (token.startsWith('~~')) {
    return (
      <s className="text-slate-400 line-through" key={key}>
        {token.slice(2, -2)}
      </s>
    );
  }
  if (token.startsWith('`')) {
    return (
      <code
        className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono font-semibold text-[#1B5E20] text-[11px]"
        key={key}
      >
        {token.slice(1, -1)}
      </code>
    );
  }
  if (token.startsWith('[')) {
    const link = LINK_TOKEN.exec(token);
    const href = link?.[2];
    if (!(link && href && HTTP_URL.test(href))) {
      return token;
    }
    return (
      <a
        className="inline-flex items-center gap-0.5 font-bold text-[#1B5E20] underline hover:text-[#144716]"
        href={href}
        key={key}
        rel="noopener noreferrer"
        target="_blank"
      >
        {link[1]}
        <ExternalLink className="ml-0.5 inline h-3 w-3" />
      </a>
    );
  }
  return (
    <em className="text-slate-800 italic" key={key}>
      {token.slice(1, -1)}
    </em>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(renderToken(match[0], `${keyPrefix}-${index}`));
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  // Baris dalam satu blok statis (tidak diurutkan ulang), sehingga offset
  // karakter kumulatif menjadi kunci yang stabil.
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const line of lines) {
    if (offset > 0) {
      nodes.push(<br key={`${keyPrefix}-br-${offset}`} />);
    }
    nodes.push(...renderInline(line, `${keyPrefix}-${offset}`));
    offset += line.length + 1;
  }
  return nodes;
}

function renderHeading(level: number, text: string, key: string): ReactNode {
  const content = renderInline(text, key);
  if (level === 1) {
    return (
      <h1
        className="pt-2 font-black text-slate-900 text-xl tracking-tight sm:text-2xl"
        key={key}
      >
        {content}
      </h1>
    );
  }
  if (level === 2) {
    return (
      <h2
        className="pt-1.5 font-bold text-lg text-slate-900 tracking-tight sm:text-xl"
        key={key}
      >
        {content}
      </h2>
    );
  }
  return (
    <h3 className="pt-1 font-bold text-base text-slate-800" key={key}>
      {content}
    </h3>
  );
}

function renderQuote(block: string, key: string): ReactNode {
  const lines = block.split('\n').map((l) => l.replace(QUOTE_PREFIX, ''));
  const isDalil =
    block.startsWith('> 🕋') ||
    block.startsWith('> 📜') ||
    block.toLowerCase().includes('dalil');

  if (isDalil) {
    return (
      <div
        className="my-3 space-y-1.5 rounded-r-2xl border-[#1B5E20] border-l-4 bg-emerald-50/90 p-4 font-medium text-emerald-950 text-xs shadow-2xs sm:text-sm"
        key={key}
      >
        <div className="flex items-center gap-1.5 font-bold text-[#1B5E20] text-xs">
          <BookOpen className="h-4 w-4" />
          <span>Rujukan Fiqih &amp; Dalil Syariah</span>
        </div>
        <p className="italic leading-relaxed">{renderLines(lines, key)}</p>
      </div>
    );
  }
  return (
    <blockquote
      className="my-3 rounded-r-xl border-amber-400 border-l-3 bg-amber-50/40 p-3 pl-4 text-slate-700 text-xs italic sm:text-sm"
      key={key}
    >
      {renderLines(lines, key)}
    </blockquote>
  );
}

function renderList(lines: string[], key: string): ReactNode | null {
  if (lines.every((l) => BULLET.test(l))) {
    return (
      <ul className="my-2 list-none space-y-1.5 pl-1" key={key}>
        {lines.map((l, position) => (
          <li
            className="flex items-start gap-2 text-slate-800 text-xs sm:text-sm"
            key={`${key}-${position}-${l}`}
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B5E20]" />
            <span className="leading-relaxed">
              {renderInline(l.replace(BULLET, ''), `${key}-${position}`)}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const numbered = lines.map((l) => NUMBERED.exec(l));
  if (numbered.every(Boolean)) {
    return (
      <ol className="my-2 list-none space-y-1.5 pl-1" key={key}>
        {numbered.map((m, position) => (
          <li
            className="flex items-start gap-2 text-slate-800 text-xs sm:text-sm"
            key={`${key}-${position}-${m?.[0]}`}
          >
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-bold font-mono text-[#1B5E20] text-[11px]">
              {m?.[1]}
            </span>
            <span className="leading-relaxed">
              {renderInline(m?.[2] ?? '', `${key}-${position}`)}
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

function renderBlock(block: string, key: string): ReactNode {
  if (HR.test(block)) {
    return <hr className="my-6 border-slate-200" key={key} />;
  }
  const heading = HEADING.exec(block);
  if (heading && !block.includes('\n')) {
    return renderHeading(heading[1].length, heading[2], key);
  }
  if (block.startsWith('>')) {
    return renderQuote(block, key);
  }
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    renderList(lines, key) ?? (
      <p
        className="text-slate-800 text-xs leading-relaxed sm:text-sm"
        key={key}
      >
        {renderLines(lines, key)}
      </p>
    )
  );
}

export function SafeMarkdown({ content }: { content: string | null }) {
  const text = stripLegacyHtml(content ?? '').trim();
  if (!text) {
    return (
      <p className="text-slate-400 text-xs italic">Belum ada konten tulisan.</p>
    );
  }
  const blocks = text
    .split(BLOCK_SPLIT)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, position) =>
        renderBlock(block, `md-${position}-${block.length}`)
      )}
    </div>
  );
}

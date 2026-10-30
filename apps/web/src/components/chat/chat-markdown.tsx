import type { ReactNode } from 'react';

/**
 * Compact Markdown for assistant answers inside a chat bubble. Everything is a
 * React node (text is escaped by React, never `dangerouslySetInnerHTML`), and
 * links are limited to http(s). Supported: paragraphs, `-`/`*` and `1.` lists,
 * `#` headings (shown as bold lines), `---`, and inline `**bold**`, `*italic*`,
 * `` `code` `` and `[text](https://…)`.
 */

const BLOCK_SPLIT = /\n\s*\n/;
const INLINE =
  /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,})$/;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyBase}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          className="rounded bg-emerald-50 px-1 py-0.5 font-mono text-[#356152] text-[0.85em]"
          key={key}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = LINK.exec(part);
    if (link) {
      return (
        <a
          className="font-medium text-[#356152] underline underline-offset-2"
          href={link[2]}
          key={key}
          rel="noopener noreferrer"
          target="_blank"
        >
          {link[1]}
        </a>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function listItems(lines: string[], pattern: RegExp, keyBase: string) {
  return lines.map((line) => (
    <li key={`${keyBase}-${line}`}>
      {inline(pattern.exec(line)?.[1] ?? line, `${keyBase}-${line}`)}
    </li>
  ));
}

function renderBlock(block: string, key: string): ReactNode {
  const lines = block.split('\n').filter((line) => line.trim() !== '');

  if (RULE.test(block.trim())) {
    return <hr className="border-slate-200" key={key} />;
  }
  if (lines.length > 0 && lines.every((line) => BULLET.test(line))) {
    return (
      <ul className="list-disc space-y-1 pl-5" key={key}>
        {listItems(lines, BULLET, key)}
      </ul>
    );
  }
  if (lines.length > 0 && lines.every((line) => NUMBERED.test(line))) {
    return (
      <ol className="list-decimal space-y-1 pl-5" key={key}>
        {listItems(lines, NUMBERED, key)}
      </ol>
    );
  }
  const heading = HEADING.exec(block.trim());
  if (heading) {
    return (
      <p className="font-bold" key={key}>
        {inline(heading[1] ?? '', key)}
      </p>
    );
  }
  return (
    <p className="whitespace-pre-line" key={key}>
      {inline(block.trim(), key)}
    </p>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = content
    .split(BLOCK_SPLIT)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => renderBlock(block, `b${index}`))}
    </div>
  );
}

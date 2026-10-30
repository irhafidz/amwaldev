const MARKDOWN_NOISE = /[#*`_>[\]()]/g;
const WHITESPACE = /\s+/g;

/**
 * Plain-text teaser from an article body (markdown-ish): strips formatting
 * characters, collapses whitespace, and cuts at a word boundary. Returns an
 * empty string for empty or missing input.
 */
export function makeExcerpt(
  body: string | null | undefined,
  max = 140
): string {
  const text = (body ?? '')
    .replace(MARKDOWN_NOISE, '')
    .replace(WHITESPACE, ' ')
    .trim();
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}

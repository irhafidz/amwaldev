/**
 * Share template builder (`I-3`, Zone 2).
 *
 * Pure on purpose: the wording, the truncation and the `?ref=` merge are the
 * parts that must not drift between the four program pages, and they are the
 * parts a test can actually pin down. The button component owns only the
 * platform plumbing (Web Share API, clipboard, modal).
 *
 * Whoever places the button passes the referral code, and only when the
 * donor is signed in — the code is opaque (`I-4`), never a raw user id.
 */

/** A chat message longer than this stops being read on a phone. */
const MAX_DESCRIPTION_LENGTH = 160;

export interface ShareTemplateInput {
  judul: string;
  /** Short description; trimmed and shortened before it enters the message. */
  deskripsi?: string | null;
  /** Absolute deep link to the program page. */
  url: string;
  /** Opaque referral code — appended as `?ref=` when present. */
  refCode?: string | null;
  /** e.g. `berwakaf`, `berzakat`, `berinfaq`, `berqurban`. */
  ajakan?: string;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) {
    return trimmed;
  }

  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Adds `?ref=<kode>` (or `&ref=` when the link already carries a query) to a
 * program deep link. Malformed links are returned untouched rather than
 * throwing inside a click handler — the caller is a UI event, not a parser.
 */
export function buildShareLink(url: string, refCode?: string | null): string {
  const code = refCode?.trim();
  if (!code) {
    return url;
  }

  try {
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.set('ref', code);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** The full chat message a donor copies or hands to WhatsApp. */
export function buildShareMessage({
  judul,
  deskripsi,
  url,
  refCode,
  ajakan = 'berdonasi',
}: ShareTemplateInput): string {
  const link = buildShareLink(url, refCode);
  const lines = [
    `Mari ${ajakan} untuk program "${judul.trim()}" melalui Amwal.`,
  ];

  const summary = deskripsi ? truncate(deskripsi, MAX_DESCRIPTION_LENGTH) : '';
  if (summary) {
    lines.push('', summary);
  }

  lines.push('', `Salurkan kebaikan Anda di: ${link}`);

  return lines.join('\n');
}

/** WhatsApp click-to-chat with the message pre-filled. */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

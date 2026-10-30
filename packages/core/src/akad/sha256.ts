/**
 * Normalizes text and calculates its SHA-256 hex digest.
 * CRLF newlines are converted to LF, and outer whitespace is trimmed.
 *
 * Web Crypto (`crypto.subtle`), not `node:crypto` — this runs both on the
 * server and inside `AkadCheckbox` (a client component), and `node:crypto`
 * is externalized in the browser bundle, crashing on call. `crypto.subtle`
 * is native in Bun, Node 20+, and every browser, so one implementation
 * covers both sides and the client-computed hash still matches the
 * server's byte for byte.
 */
export async function sha256Body(body: string): Promise<string> {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

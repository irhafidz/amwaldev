export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedReceiptMimeType =
  (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

export const MAX_RECEIPT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const isAllowedReceiptMimeType = (
  mimeType: string
): mimeType is AllowedReceiptMimeType => {
  return (ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(mimeType);
};

export const getExtensionFromMimeType = (mimeType: string): string | null => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return null;
  }
};

const isMachOBinary = (buf: Uint8Array): boolean => {
  const isDirect =
    buf[0] === 0xfe &&
    buf[1] === 0xed &&
    buf[2] === 0xfa &&
    (buf[3] === 0xce || buf[3] === 0xcf);
  const isReverse =
    (buf[0] === 0xce || buf[0] === 0xcf) &&
    buf[1] === 0xfa &&
    buf[2] === 0xed &&
    buf[3] === 0xfe;
  return isDirect || isReverse;
};

const isExecutableOrScript = (buf: Uint8Array): boolean => {
  if (buf.length < 2) {
    return false;
  }

  // Windows PE / DOS ('MZ') or Shell script ('#!')
  if (
    (buf[0] === 0x4d && buf[1] === 0x5a) ||
    (buf[0] === 0x23 && buf[1] === 0x21)
  ) {
    return true;
  }

  if (buf.length < 4) {
    return false;
  }

  // Linux ELF
  if (
    buf[0] === 0x7f &&
    buf[1] === 0x45 &&
    buf[2] === 0x4c &&
    buf[3] === 0x46
  ) {
    return true;
  }

  // Java class (CA FE BA BE)
  if (
    buf[0] === 0xca &&
    buf[1] === 0xfe &&
    buf[2] === 0xba &&
    buf[3] === 0xbe
  ) {
    return true;
  }

  return isMachOBinary(buf);
};

const isHtmlOrSvg = (buf: Uint8Array): boolean => {
  const checkLen = Math.min(buf.length, 512);
  if (checkLen < 2) {
    return false;
  }

  // Convert header slice to ASCII string to check text-based payloads
  let headerText = '';
  for (let i = 0; i < checkLen; i += 1) {
    headerText += String.fromCharCode(buf[i] ?? 0);
  }

  const normalized = headerText.toLowerCase().trimStart();

  return (
    normalized.startsWith('<html') ||
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<svg') ||
    normalized.startsWith('<?xml') ||
    normalized.includes('<svg') ||
    normalized.includes('<html')
  );
};

/**
 * Validates authentic file magic bytes and returns canonical MIME type.
 * Returns null if the buffer is unrecognized, malicious (SVG/HTML/exe), or corrupted.
 */
export const detectMimeTypeFromBuffer = (
  buffer: Uint8Array | Buffer
): AllowedReceiptMimeType | null => {
  if (!buffer || buffer.length < 3) {
    return null;
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Reject executable binaries, shell scripts, and HTML/SVG payloads
  if (isExecutableOrScript(bytes) || isHtmlOrSvg(bytes)) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x45 && // 'E'
    bytes[10] === 0x42 && // 'B'
    bytes[11] === 0x50 // 'P'
  ) {
    return 'image/webp';
  }

  // 4. PDF: 25 50 44 46 2D ('%PDF-')
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // '%'
    bytes[1] === 0x50 && // 'P'
    bytes[2] === 0x44 && // 'D'
    bytes[3] === 0x46 && // 'F'
    bytes[4] === 0x2d // '-'
  ) {
    return 'application/pdf';
  }

  return null;
};

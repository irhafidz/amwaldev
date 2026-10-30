/**
 * Pembaca badan permintaan unggahan dengan pemotongan streaming: menolak di
 * byte (batas + 1) tanpa menampung muatan tak terbatas dan tanpa memercayai
 * header `Content-Length` dari klien. Dipakai rute unggah admin (kuitansi
 * program wakaf dan bukti donasi infaq).
 */
export type StreamResult =
  | { ok: true; rawBody: Uint8Array }
  | { ok: false; error: string; status: number };

export async function readStreamWithCutoff(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<StreamResult> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let isExceeded = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          isExceeded = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
  } catch (streamError) {
    return {
      ok: false,
      error: `Kesalahan saat membaca stream: ${
        streamError instanceof Error ? streamError.message : 'Unknown error'
      }`,
      status: 400,
    };
  }

  if (isExceeded) {
    return {
      ok: false,
      error: `Payload Too Large: Berkas melebihi batas maksimal ${Math.round(maxBytes / (1024 * 1024))} MB`,
      status: 413,
    };
  }

  if (totalBytes === 0) {
    return {
      ok: false,
      error: 'Bad Request: Berkas kosong',
      status: 400,
    };
  }

  const rawBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, rawBody };
}

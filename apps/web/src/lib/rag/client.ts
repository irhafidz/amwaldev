/**
 * Client for the `amwal-rag` service (FastAPI, one question in, one cited
 * answer out). Contract, read from the service's own code:
 *
 *   POST {base}/chat   header `X-API-Key`   body `{ "question": string }`
 *   200 -> { request_id, answer, sources: [{ sumber, unit, halaman|null }] }
 *   4xx/5xx -> { request_id, error: { code, message } }
 *
 * The question must be 3-500 characters. The service is single-turn: there is
 * no chat history in the request. It may take up to ~60 s (its own deadline),
 * so the timeout here is slightly longer and every failure is turned into a
 * `RagError` with a stable `kind` the router can map to a friendly message.
 */

export const RAG_MIN_QUESTION = 3;
export const RAG_MAX_QUESTION = 500;

export interface RagSource {
  halaman: number | null;
  sumber: string;
  unit: string;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
}

export type RagErrorKind =
  /** Service down, DNS failure, upstream (DeepSeek/Jina) unavailable, 5xx. */
  | 'unavailable'
  /** Service has no free slot (HTTP 429). */
  | 'busy'
  /** Took longer than the deadline. */
  | 'timeout'
  /** The service rejected the question (HTTP 422). */
  | 'invalid'
  /** Our API key is rejected or the service has none: a deployment problem. */
  | 'misconfigured';

export class RagError extends Error {
  readonly kind: RagErrorKind;
  readonly status: number | null;

  constructor(kind: RagErrorKind, message: string, status: number | null) {
    super(message);
    this.name = 'RagError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RagDeps {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
  /** Pause before the single retry on 429/503. Default 2 s. */
  retryDelayMs?: number;
  timeoutMs: number;
}

const TRAILING_SLASH = /\/+$/;

function kindForStatus(status: number): RagErrorKind {
  if (status === 429) {
    return 'busy';
  }
  if (status === 422) {
    return 'invalid';
  }
  if (status === 504) {
    return 'timeout';
  }
  if (status === 401) {
    return 'misconfigured';
  }
  return 'unavailable';
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function isRagAnswer(value: unknown): value is RagAnswer {
  const candidate = value as Partial<RagAnswer> | null;
  return (
    typeof candidate?.answer === 'string' && Array.isArray(candidate.sources)
  );
}

const DEFAULT_RETRY_DELAY_MS = 2000;

async function attemptRag(question: string, deps: RagDeps): Promise<RagAnswer> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

  let response: Response;
  try {
    response = await doFetch(
      `${deps.baseUrl.replace(TRAILING_SLASH, '')}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': deps.apiKey,
        },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      }
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new RagError(
      aborted ? 'timeout' : 'unavailable',
      aborted
        ? 'Layanan RAG tidak menjawab tepat waktu'
        : 'Layanan RAG tidak terjangkau',
      null
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new RagError(
      kindForStatus(response.status),
      await readErrorMessage(response),
      response.status
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RagError(
      'unavailable',
      'Respons layanan RAG bukan JSON',
      response.status
    );
  }
  if (!isRagAnswer(body)) {
    throw new RagError(
      'unavailable',
      'Bentuk respons layanan RAG tidak dikenali',
      response.status
    );
  }
  return { answer: body.answer, sources: body.sources };
}

/**
 * One retry, only when the service is momentarily busy (429) or not ready
 * (503). A timeout (504 or ours), a rejected key or anything else is final: a
 * second 60 s wait would not help and a wrong key never becomes right.
 */
export async function askRag(
  question: string,
  deps: RagDeps
): Promise<RagAnswer> {
  try {
    return await attemptRag(question, deps);
  } catch (error) {
    const retryable =
      error instanceof RagError &&
      (error.status === 429 || error.status === 503);
    if (!retryable) {
      throw error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
    );
    return await attemptRag(question, deps);
  }
}

/** The answer, followed by a Markdown list of the passages it was drawn from. */
export function withSources(result: RagAnswer): string {
  if (result.sources.length === 0) {
    return result.answer;
  }
  const lines = result.sources.map((source) => {
    const page = source.halaman === null ? '' : `, hlm. ${source.halaman}`;
    return `- ${source.sumber} (${source.unit}${page})`;
  });
  return `${result.answer}\n\n**Sumber rujukan:**\n${lines.join('\n')}`;
}

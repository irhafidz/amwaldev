/**
 * Amwal API client.
 *
 * - always sends `credentials: 'include'` so the httpOnly session cookies flow
 *   automatically (no token in localStorage — AI_RULES prohibition #1);
 * - silently refreshes an expired access token behind a single-flight mutex:
 *   10 parallel 401s trigger exactly one refresh request;
 * - redirects to the login screen only when the refresh itself fails.
 *
 * The auth endpoints themselves are owned by the backend lane (Naufal,
 * S10-N-02…06). This file only defines the transport contract.
 */

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  refreshImpl?: () => Promise<boolean>;
  onAuthFailure?: () => void;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuthRefresh?: boolean;
}

export type ApiResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

const LOGIN_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

const browserFetch: FetchLike = (input, init) => fetch(input, init);

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly refreshImpl: () => Promise<boolean>;
  private readonly onAuthFailure: () => void;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetchImpl = options.fetchImpl ?? browserFetch;
    this.refreshImpl =
      options.refreshImpl ?? (() => this.postRefreshToken().then(() => true));
    this.onAuthFailure =
      options.onAuthFailure ??
      (() => {
        if (typeof window === 'undefined') {
          return;
        }
        const current = window.location.pathname;
        if (current.startsWith('/auth/')) {
          return;
        }
        const redirect = encodeURIComponent(
          `${current}${window.location.search}`
        );
        window.location.assign(`/auth/login?redirect=${redirect}`);
      });
  }

  async request<T>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', body, skipAuthRefresh = false } = options;
    const doFetch = () =>
      this.fetchImpl(this.baseUrl + path, {
        method,
        credentials: 'include',
        headers:
          body === undefined
            ? undefined
            : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    let response = await doFetch();

    if (response.status === 401 && !skipAuthRefresh && !LOGIN_PATHS.has(path)) {
      const refreshed = await this.refreshOnce();

      if (refreshed) {
        response = await doFetch();
      } else {
        this.onAuthFailure();
        return {
          ok: false,
          status: 401,
          error: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
        };
      }
    }

    return this.parseResponse<T>(response);
  }

  private refreshOnce(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshImpl()
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  private async postRefreshToken(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      throw new Error('Refresh token tidak valid');
    }
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const raw = await response.text();
    let payload: unknown = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : response.statusText;
      return { ok: false, status: response.status, error: message };
    }

    return { ok: true, status: response.status, data: payload as T };
  }
}

export const api = new ApiClient();

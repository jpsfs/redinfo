import { ApiErrorCode } from '@redinfo/shared';
import { getAccessToken } from './authProvider';
import { refreshAccessToken } from './authRefresh';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Fetches `path`, retrying once with a refreshed access token if the first
 * attempt comes back 401 — the access token is short-lived (15 min) and
 * nothing polls for its expiry while someone stays on one screen, so this
 * is what keeps a still-valid refresh token from looking like a dropped
 * session. See `authRefresh`'s doc comment.
 */
async function fetchWithAuthRetry(path: string, init: RequestInit): Promise<Response> {
  const attempt = (token: string | null) => {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  const response = await attempt(getAccessToken());
  if (response.status !== 401) return response;

  const refreshed = await refreshAccessToken();
  return refreshed ? attempt(refreshed) : response;
}

/**
 * Authenticated fetch for the endpoints that aren't react-admin resources
 * (the availability matrix, the self-service submission screen, CSV exports).
 *
 * `dataProvider` covers CRUD resources; this covers everything else, so the
 * bearer token is read from one place (`authProvider`) rather than each
 * component reaching into localStorage itself.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await fetchWithAuthRetry(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const { message, code, params } = await readError(response);
    throw new ApiError(message, response.status, code, params);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Download a file from an authenticated endpoint.
 *
 * A plain `<a href>` cannot carry the bearer token, so the body is fetched
 * with the token and handed to the browser as an object URL instead.
 */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetchWithAuthRetry(path, {});
  if (!response.ok) {
    const { message, code, params } = await readError(response);
    throw new ApiError(message, response.status, code, params);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Upload a single file to an authenticated endpoint that expects it under the
 * multipart field name `file` (every such endpoint in this app does).
 *
 * `apiFetch` always sends JSON, and `fetch` needs to set its own multipart
 * boundary when handed a `FormData`, so this builds the request by hand
 * rather than going through it — same reasoning as `uploadAttachment.ts`,
 * generalised for the photo and certification-document endpoints.
 */
export async function apiUpload<T>(path: string, file: File | Blob): Promise<T> {
  const body = new FormData();
  body.append('file', file, file instanceof File ? file.name : 'ficheiro');

  const response = await fetchWithAuthRetry(path, { method: 'POST', body });

  if (!response.ok) {
    const { message, code, params } = await readError(response);
    throw new ApiError(message, response.status, code, params);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set when the API's response carries a machine code (#180 phase 4) — see `apiErrorLabel`. */
    readonly code?: ApiErrorCode,
    readonly params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ReadErrorResult {
  message: string;
  code?: ApiErrorCode;
  params?: Record<string, string | number>;
}

async function readError(response: Response): Promise<ReadErrorResult> {
  try {
    const body = await response.json();
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : response.statusText || `Request failed with status ${response.status}`;
    return { message, code: body?.code, params: body?.params };
  } catch {
    // Fall through to the status text below.
  }
  return { message: response.statusText || `Request failed with status ${response.status}` };
}

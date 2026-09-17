import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDownload, apiFetch } from './api';

const TOKEN_KEY = 'redinfo_access_token';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorResponse(body: unknown, status: number, statusText = 'Error'): Response {
  return {
    ok: false,
    status,
    statusText,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token from the auth provider', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-123');
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/availability/me');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer jwt-123');
    expect(options.method).toBe('GET');
  });

  it('omits the header when there is no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await apiFetch('/availability/me');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('serialises the body for a write', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await apiFetch('/availability/me', { method: 'PUT', body: { entries: [] } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.body).toBe('{"entries":[]}');
  });

  it('sends no body when none is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await apiFetch('/availability/me/decline', { method: 'POST' });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBeUndefined();
  });

  it('parses the JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ canSubmit: true }));

    await expect(apiFetch('/availability/me')).resolves.toEqual({ canSubmit: true });
  });

  it('returns undefined for an empty body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(apiFetch('/availability/me/decline', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('surfaces the API error message', async () => {
    fetchMock.mockResolvedValue(
      errorResponse({ statusCode: 403, message: 'window is closed' }, 403),
    );

    await expect(apiFetch('/availability/me')).rejects.toThrow('window is closed');
  });

  it('joins class-validator message arrays', async () => {
    fetchMock.mockResolvedValue(
      errorResponse({ message: ['date must be a Date', 'name should not be empty'] }, 400),
    );

    await expect(apiFetch('/holidays', { method: 'POST' })).rejects.toThrow(
      'date must be a Date, name should not be empty',
    );
  });

  it('falls back to the status text for a non-JSON error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);

    await expect(apiFetch('/availability/matrix')).rejects.toThrow('Bad Gateway');
  });

  it('carries the HTTP status on the error', async () => {
    fetchMock.mockResolvedValue(errorResponse({ message: 'nope' }, 403));

    await expect(apiFetch('/availability/matrix')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
    await expect(apiFetch('/availability/matrix')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiDownload', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
    // jsdom implements neither of these, and treats a real anchor click as an
    // unsupported navigation.
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function csvResponse(): Response {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      blob: () => Promise.resolve(new Blob(['date,shift\n'], { type: 'text/csv' })),
    } as unknown as Response;
  }

  it('sends the bearer token, since a plain link cannot', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-123');
    fetchMock.mockResolvedValue(csvResponse());

    await apiDownload('/availability/matrix/csv', 'availability.csv');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer jwt-123');
  });

  it('hands the body to the browser under the given filename', async () => {
    fetchMock.mockResolvedValue(csvResponse());
    const click = HTMLAnchorElement.prototype.click as unknown as ReturnType<typeof vi.fn>;

    await apiDownload('/availability/matrix/csv', 'availability-win-1.csv');

    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    // The object URL is released and the temporary anchor removed again.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(document.querySelector('a')).toBeNull();
  });

  it('throws with the API message when the export is refused', async () => {
    fetchMock.mockResolvedValue(errorResponse({ message: 'Forbidden resource' }, 403));

    await expect(apiDownload('/availability/matrix/csv', 'x.csv')).rejects.toThrow(
      'Forbidden resource',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

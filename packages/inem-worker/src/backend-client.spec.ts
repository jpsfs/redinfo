import { BackendClientError, HttpBackendClient } from './backend-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('HttpBackendClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('claimJob', () => {
    it('sends the bearer token and returns the claimed job', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { job: { id: 'job-1', storageState: {}, startedAt: '2026-09-02T10:00:00.000Z' } }));
      const client = new HttpBackendClient('http://backend:3000', 'secret-token');

      const job = await client.claimJob();

      expect(job).toEqual({ id: 'job-1', storageState: {}, startedAt: '2026-09-02T10:00:00.000Z' });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend:3000/internal/inem/login-jobs',
        expect.objectContaining({ headers: { Authorization: 'Bearer secret-token' } }),
      );
    });

    it('returns null when there is no job to claim', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { job: null }));
      const client = new HttpBackendClient('http://backend:3000', 'secret-token');
      expect(await client.claimJob()).toBeNull();
    });

    it('throws BackendClientError on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, {}));
      const client = new HttpBackendClient('http://backend:3000', 'wrong-token');
      await expect(client.claimJob()).rejects.toBeInstanceOf(BackendClientError);
    });
  });

  describe('submitResult', () => {
    it('POSTs the result as JSON to the job-scoped result endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse(204, undefined));
      const client = new HttpBackendClient('http://backend:3000', 'secret-token');

      await client.submitResult('job-1', { ok: false, reason: 'otp_timeout', message: 'no code arrived' });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend:3000/internal/inem/login-jobs/job-1/result',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ok: false, reason: 'otp_timeout', message: 'no code arrived' }),
        }),
      );
    });

    it('throws BackendClientError on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const client = new HttpBackendClient('http://backend:3000', 'secret-token');
      await expect(client.submitResult('job-1', { ok: false, reason: 'unknown_error', message: 'boom' })).rejects.toBeInstanceOf(
        BackendClientError,
      );
    });
  });

  describe('bootstrapOwaSession', () => {
    it('POSTs the storageState blob', async () => {
      fetchMock.mockResolvedValue(jsonResponse(204, undefined));
      const client = new HttpBackendClient('http://backend:3000', 'secret-token');

      await client.bootstrapOwaSession({ cookies: ['a'] });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend:3000/internal/inem/owa-session',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ storageState: { cookies: ['a'] } }) }),
      );
    });
  });
});

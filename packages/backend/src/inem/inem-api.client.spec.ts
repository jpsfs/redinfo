import { InemApiClient, InemApiError, InemCookieJar, InemSessionExpiredError } from './inem-api.client';

const COOKIES: InemCookieJar = { alAuth: 'a-token', samlsessionid: null, deviceId: null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('InemApiClient', () => {
  let fetchMock: jest.Mock;
  let client: InemApiClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new InemApiClient('https://portalpem.inem.pt');
  });

  it('sends the alAuth cookie alone — no bearer token, no CSRF header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(['CVCAMPO']));
    await client.getEntities(COOKIES);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://portalpem.inem.pt/api/Entity');
    expect(init.headers.Cookie).toBe('alAuth=a-token');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('never follows a redirect', async () => {
    fetchMock.mockResolvedValue(jsonResponse(['CVCAMPO']));
    await client.getUnits(COOKIES, 'CVCAMPO');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('builds the unit query with the entity', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await client.getUnits(COOKIES, 'CVCAMPO');
    expect(fetchMock.mock.calls[0][0]).toBe('https://portalpem.inem.pt/api/unit?entity=CVCAMPO');
  });

  it('parses the INOP reason map', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ TEPH_Falta: 'Sem Tripulação' }));
    await expect(client.getInopReasons(COOKIES)).resolves.toEqual({ TEPH_Falta: 'Sem Tripulação' });
  });

  it('treats a 403 as a dead session, not a generic error', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"detail":"forbidden"}', {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );
    await expect(client.getUnits(COOKIES, 'CVCAMPO')).rejects.toThrow(InemSessionExpiredError);
  });

  it('refuses to treat a redirect as empty data', async () => {
    const redirectResponse = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response;
    fetchMock.mockResolvedValue(redirectResponse);
    await expect(client.getUnits(COOKIES, 'CVCAMPO')).rejects.toThrow(InemApiError);
  });

  it('refuses a non-JSON body rather than guessing its shape', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(client.getUnits(COOKIES, 'CVCAMPO')).rejects.toThrow(InemApiError);
  });

  describe('putUnits', () => {
    it('sends the batch map, not {UnitID, Active, INOPReason}', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      await client.putUnits(COOKIES, 'CVCAMPO', { CVCAMPO1: { INOP: '00' } });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://portalpem.inem.pt/api/unit');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({
        pending: { CVCAMPO1: { INOP: '00' } },
        currentEntity: 'CVCAMPO',
      });
    });

    it('accepts the 204 No Content success response', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      await expect(
        client.putUnits(COOKIES, 'CVCAMPO', { CVCAMPO1: { INOP: 'TEPH_Falta' } }),
      ).resolves.toBeUndefined();
    });

    it('raises InemSessionExpiredError on a 403', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
      await expect(
        client.putUnits(COOKIES, 'CVCAMPO', { CVCAMPO1: { INOP: '00' } }),
      ).rejects.toThrow(InemSessionExpiredError);
    });
  });
});

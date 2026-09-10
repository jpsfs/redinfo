import { randomBytes } from 'node:crypto';
import { INEMSessionStatus, OWASessionStatus } from '@prisma/client';
import { IdentityCipher } from '../common/identity-cipher';
import { InemApiClient, InemCookieJar, InemSessionExpiredError } from './inem-api.client';
import { InemSessionService } from './inem-session.service';

const CIPHER_KEY = `k1:${randomBytes(32).toString('base64')}`;

interface InemSessionRow {
  id: string;
  status: INEMSessionStatus;
  cookies: Buffer | null;
  expiresAt: Date | null;
  failureCount: number;
  lastError: string | null;
  pendingLoginId: string | null;
  pendingLoginStartedAt: Date | null;
  cachedInopReasons: Record<string, string> | null;
  updatedAt: Date;
}

interface OwaSessionRow {
  id: string;
  status: OWASessionStatus;
  storageState: Buffer | null;
  updatedAt: Date;
}

function inemSessionRow(overrides: Partial<InemSessionRow> = {}): InemSessionRow {
  return {
    id: 'inem',
    status: INEMSessionStatus.ACTIVE,
    cookies: null,
    expiresAt: null,
    failureCount: 0,
    lastError: null,
    pendingLoginId: null,
    pendingLoginStartedAt: null,
    cachedInopReasons: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function owaSessionRow(overrides: Partial<OwaSessionRow> = {}): OwaSessionRow {
  return {
    id: 'owa',
    status: OWASessionStatus.ACTIVE,
    storageState: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function sealedCookies(cipher: IdentityCipher, cookies: InemCookieJar): Buffer {
  return cipher.seal('inem-session', 'inem', cookies);
}

function buildPrismaStub(sessionRow = inemSessionRow(), owaRow = owaSessionRow()) {
  const stub = {
    iNEMSession: {
      findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(sessionRow)),
      update: jest.fn().mockImplementation(({ data }) => {
        Object.assign(sessionRow, data);
        return Promise.resolve(sessionRow);
      }),
    },
    oWASession: {
      findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(owaRow)),
      update: jest.fn().mockImplementation(({ data }) => {
        Object.assign(owaRow, data);
        return Promise.resolve(owaRow);
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(stub)),
  };
  return { stub, sessionRow, owaRow };
}

function enableInem() {
  process.env.INEM_ENABLED = 'true';
  process.env.INEM_USERNAME = 'delegation';
  process.env.INEM_BASE_URL = 'https://portalpem.inem.pt';
}

describe('InemSessionService', () => {
  let cipher: IdentityCipher;
  let client: InemApiClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    enableInem();
    cipher = new IdentityCipher(CIPHER_KEY);
    client = new InemApiClient('https://portalpem.inem.pt');
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.INEM_ENABLED;
    delete process.env.INEM_USERNAME;
    delete process.env.INEM_BASE_URL;
  });

  describe('isEnabled', () => {
    it('is disabled with no INEM_USERNAME, even if INEM_ENABLED=true', () => {
      delete process.env.INEM_USERNAME;
      const { stub } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);
      expect(service.isEnabled).toBe(false);
    });
  });

  describe('getCookiesOrNull', () => {
    it('never touches the database when disabled', async () => {
      delete process.env.INEM_USERNAME;
      const { stub } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);
      expect(await service.getCookiesOrNull()).toBeNull();
      expect(stub.iNEMSession.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('returns null once the circuit breaker has tripped', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.FAILED }));
      const service = new InemSessionService(stub as never, cipher, client);
      expect(await service.getCookiesOrNull()).toBeNull();
    });

    it('returns null when no session has ever been bootstrapped', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ cookies: null }));
      const service = new InemSessionService(stub as never, cipher, client);
      expect(await service.getCookiesOrNull()).toBeNull();
    });

    it('decrypts and returns the stored cookie jar', async () => {
      const cookies: InemCookieJar = { alAuth: 'a1', samlsessionid: 's1', deviceId: 'd1' };
      const { stub } = buildPrismaStub(inemSessionRow({ cookies: sealedCookies(cipher, cookies) }));
      const service = new InemSessionService(stub as never, cipher, client);
      expect(await service.getCookiesOrNull()).toEqual(cookies);
    });
  });

  // #218: a bare in-memory cache resets to null on every restart, which in
  // production means every deploy re-serves the wrong-scheme compile-time
  // fallback until the next reconcile. Persisting it closes that gap.
  describe('cached INOP reasons', () => {
    it('starts with nothing cached before onModuleInit has run', () => {
      const { stub } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);
      expect(service.getCachedInopReasons()).toBeNull();
    });

    it('never touches the database on module init when disabled', async () => {
      delete process.env.INEM_USERNAME;
      const { stub } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);

      await service.onModuleInit();

      expect(stub.iNEMSession.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('hydrates the in-memory cache from the persisted row on module init', async () => {
      const live = { '04': 'Ocupada' };
      const { stub } = buildPrismaStub(inemSessionRow({ cachedInopReasons: live }));
      const service = new InemSessionService(stub as never, cipher, client);

      await service.onModuleInit();

      expect(service.getCachedInopReasons()).toEqual(live);
    });

    it('leaves the cache null on module init when nothing was ever persisted', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ cachedInopReasons: null }));
      const service = new InemSessionService(stub as never, cipher, client);

      await service.onModuleInit();

      expect(service.getCachedInopReasons()).toBeNull();
    });

    it('setCachedInopReasons updates the in-memory cache and persists it, so a later restart can rehydrate it', async () => {
      const { stub, sessionRow } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);
      const live = { '04': 'Ocupada' };

      await service.setCachedInopReasons(live);

      expect(service.getCachedInopReasons()).toEqual(live);
      expect(stub.iNEMSession.update).toHaveBeenCalledWith({
        where: { id: 'inem' },
        data: { cachedInopReasons: live },
      });
      expect(sessionRow.cachedInopReasons).toEqual(live);
    });
  });

  // A prior transient failure can leave the session flagged EXPIRED even
  // once cookies are proven to work again — nothing else clears that flag
  // on a plain success, so a real outbound call succeeding is the trigger.
  describe('markHealthy', () => {
    it('never touches the database when disabled', async () => {
      delete process.env.INEM_USERNAME;
      const { stub } = buildPrismaStub();
      const service = new InemSessionService(stub as never, cipher, client);
      await service.markHealthy();
      expect(stub.iNEMSession.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('clears a stale EXPIRED flag back to ACTIVE and resets the failure count', async () => {
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.EXPIRED, failureCount: 1, lastError: 'fetch failed' }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.markHealthy();

      expect(sessionRow.status).toBe(INEMSessionStatus.ACTIVE);
      expect(sessionRow.failureCount).toBe(0);
      expect(sessionRow.lastError).toBeNull();
    });

    it('is a no-op once already ACTIVE — no wasted write', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.ACTIVE }));
      const service = new InemSessionService(stub as never, cipher, client);
      await service.markHealthy();
      expect(stub.iNEMSession.update).not.toHaveBeenCalled();
    });

    it('never overrides a tripped breaker', async () => {
      const { stub, sessionRow } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.FAILED }));
      const service = new InemSessionService(stub as never, cipher, client);
      await service.markHealthy();
      expect(sessionRow.status).toBe(INEMSessionStatus.FAILED);
      expect(stub.iNEMSession.update).not.toHaveBeenCalled();
    });

    it('never clobbers a login already in flight', async () => {
      const { stub, sessionRow } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.LOGGING_IN }));
      const service = new InemSessionService(stub as never, cipher, client);
      await service.markHealthy();
      expect(sessionRow.status).toBe(INEMSessionStatus.LOGGING_IN);
      expect(stub.iNEMSession.update).not.toHaveBeenCalled();
    });
  });

  describe('pingStatistics', () => {
    it('marks the session healthy once the statistics call succeeds', async () => {
      const cookies: InemCookieJar = { alAuth: 'a1', samlsessionid: 's1', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.EXPIRED, lastError: 'fetch failed', cookies: sealedCookies(cipher, cookies) }),
      );
      const service = new InemSessionService(stub as never, cipher, client);
      jest.spyOn(client, 'getStatistics').mockResolvedValue(undefined as never);

      await service.pingStatistics();

      expect(sessionRow.status).toBe(INEMSessionStatus.ACTIVE);
      expect(sessionRow.lastError).toBeNull();
    });

    it('recovers instead of marking healthy when the session turns out to be expired', async () => {
      const cookies: InemCookieJar = { alAuth: 'a1', samlsessionid: 's1', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.EXPIRED, cookies: sealedCookies(cipher, cookies) }),
      );
      const service = new InemSessionService(stub as never, cipher, client);
      jest.spyOn(client, 'getStatistics').mockRejectedValue(new InemSessionExpiredError('/api/statistics'));
      const recoverSpy = jest.spyOn(service, 'recover').mockResolvedValue(undefined);

      await service.pingStatistics();

      expect(recoverSpy).toHaveBeenCalledTimes(1);
      expect(sessionRow.status).toBe(INEMSessionStatus.EXPIRED);
    });
  });

  describe('recover', () => {
    it('does nothing once the breaker has tripped — no HTTP calls, no update', async () => {
      const { stub, sessionRow } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.FAILED }));
      const service = new InemSessionService(stub as never, cipher, client);
      await service.recover();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sessionRow.status).toBe(INEMSessionStatus.FAILED);
    });

    it('does nothing while a login is already in flight', async () => {
      const { stub } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-1' }),
      );
      const service = new InemSessionService(stub as never, cipher, client);
      await service.recover();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('warm re-mints successfully and goes ACTIVE', async () => {
      const cookies: InemCookieJar = { alAuth: 'stale', samlsessionid: 'saml-1', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ cookies: sealedCookies(cipher, cookies), status: INEMSessionStatus.EXPIRED, failureCount: 1 }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://fac.inem.pt/saml-idp/portalpem/login/' } }),
        )
        .mockResolvedValueOnce(assertionResponse())
        .mockResolvedValueOnce(acsResponse('fresh-alauth'));

      await service.recover();

      expect(sessionRow.status).toBe(INEMSessionStatus.ACTIVE);
      expect(sessionRow.failureCount).toBe(0);
      expect(sessionRow.lastError).toBeNull();
      const opened = cipher.open<InemCookieJar>('inem-session', 'inem', sessionRow.cookies as Buffer);
      expect(opened.alAuth).toBe('fresh-alauth');
    });

    it('falls through to a cold login when the IdP session is also dead', async () => {
      const cookies: InemCookieJar = { alAuth: 'stale', samlsessionid: 'dead-saml', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ cookies: sealedCookies(cipher, cookies), status: INEMSessionStatus.EXPIRED }),
        owaSessionRow({ status: OWASessionStatus.ACTIVE, storageState: Buffer.from('sealed') }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://fac.inem.pt/saml-idp/portalpem/login/' } }),
        )
        .mockResolvedValueOnce(loginFormResponse());

      await service.recover();

      expect(sessionRow.status).toBe(INEMSessionStatus.LOGGING_IN);
      expect(sessionRow.pendingLoginId).toEqual(expect.any(String));
      expect(sessionRow.pendingLoginStartedAt).toBeInstanceOf(Date);
      // Only two requests — no cold login POST here, that's #215's worker's job.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stays EXPIRED with a clear error when OWA has never been bootstrapped', async () => {
      const cookies: InemCookieJar = { alAuth: 'stale', samlsessionid: 'dead-saml', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ cookies: sealedCookies(cipher, cookies) }),
        owaSessionRow({ status: OWASessionStatus.UNSET, storageState: null }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://fac.inem.pt/saml-idp/portalpem/login/' } }),
        )
        .mockResolvedValueOnce(loginFormResponse());

      await service.recover();

      expect(sessionRow.status).toBe(INEMSessionStatus.EXPIRED);
      expect(sessionRow.lastError).toMatch(/bootstrap/i);
    });

    it('bootstraps a cold login directly when there is no session at all yet', async () => {
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ cookies: null, status: INEMSessionStatus.UNKNOWN }),
        owaSessionRow({ status: OWASessionStatus.ACTIVE, storageState: Buffer.from('sealed') }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.recover();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sessionRow.status).toBe(INEMSessionStatus.LOGGING_IN);
    });
  });

  describe('proactiveReMint', () => {
    it('does nothing when there is no samlsessionid to roll yet', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ cookies: null }));
      const service = new InemSessionService(stub as never, cipher, client);
      await service.proactiveReMint();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rolls samlsessionid even though alAuth is already healthy', async () => {
      const cookies: InemCookieJar = { alAuth: 'still-good', samlsessionid: 'saml-1', deviceId: null };
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ cookies: sealedCookies(cipher, cookies), status: INEMSessionStatus.ACTIVE }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      fetchMock
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'https://fac.inem.pt/saml-idp/portalpem/login/' } }),
        )
        .mockResolvedValueOnce(assertionResponse())
        .mockResolvedValueOnce(acsResponse('rolled-alauth'));

      await service.proactiveReMint();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const opened = cipher.open<InemCookieJar>('inem-session', 'inem', sessionRow.cookies as Buffer);
      expect(opened.alAuth).toBe('rolled-alauth');
    });
  });

  describe('claimLoginJob / submitLoginResult', () => {
    it('claims the pending job with the decrypted OWA storageState', async () => {
      const storageState = { cookies: ['owa-cookie'] };
      const startedAt = new Date('2026-09-02T10:00:00.000Z');
      const { stub } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-1', pendingLoginStartedAt: startedAt }),
        owaSessionRow({ storageState: cipher.seal('owa-session', 'owa', storageState) }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      const job = await service.claimLoginJob();
      expect(job).toEqual({ id: 'job-1', storageState, startedAt: startedAt.toISOString() });
    });

    it('returns null when there is nothing pending', async () => {
      const { stub } = buildPrismaStub(inemSessionRow({ status: INEMSessionStatus.ACTIVE }));
      const service = new InemSessionService(stub as never, cipher, client);
      expect(await service.claimLoginJob()).toBeNull();
    });

    it('persists the refreshed cookies and OWA storageState on success', async () => {
      const { stub, sessionRow, owaRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-1', failureCount: 1 }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.submitLoginResult('job-1', {
        ok: true,
        cookies: { alAuth: 'new-alauth', samlsessionid: 'new-saml', deviceId: null },
        expiresAt: '2026-09-03T00:00:00.000Z',
        refreshedStorageState: { cookies: ['refreshed'] },
      });

      expect(sessionRow.status).toBe(INEMSessionStatus.ACTIVE);
      expect(sessionRow.failureCount).toBe(0);
      expect(sessionRow.pendingLoginId).toBeNull();
      expect(cipher.open('inem-session', 'inem', sessionRow.cookies as Buffer)).toEqual({
        alAuth: 'new-alauth',
        samlsessionid: 'new-saml',
        deviceId: null,
      });
      expect(cipher.open('owa-session', 'owa', owaRow.storageState as Buffer)).toEqual({ cookies: ['refreshed'] });
    });

    it('ignores a result for a stale/unknown job id', async () => {
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-current' }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.submitLoginResult('job-old', { ok: false, reason: 'unknown_error', message: 'boom' });

      expect(sessionRow.status).toBe(INEMSessionStatus.LOGGING_IN);
      expect(sessionRow.pendingLoginId).toBe('job-current');
    });

    it('trips the breaker after two consecutive login failures', async () => {
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-1', failureCount: 1 }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.submitLoginResult('job-1', { ok: false, reason: 'otp_timeout', message: 'no code arrived' });

      expect(sessionRow.status).toBe(INEMSessionStatus.FAILED);
      expect(sessionRow.failureCount).toBe(2);
    });

    it('stays EXPIRED (not FAILED) after only one failure', async () => {
      const { stub, sessionRow } = buildPrismaStub(
        inemSessionRow({ status: INEMSessionStatus.LOGGING_IN, pendingLoginId: 'job-1', failureCount: 0 }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.submitLoginResult('job-1', { ok: false, reason: 'otp_timeout', message: 'no code arrived' });

      expect(sessionRow.status).toBe(INEMSessionStatus.EXPIRED);
      expect(sessionRow.failureCount).toBe(1);
    });
  });

  describe('bootstrapOwaSession', () => {
    it('seals the storageState and marks the OWA session ACTIVE', async () => {
      const { stub, owaRow } = buildPrismaStub(inemSessionRow(), owaSessionRow({ status: OWASessionStatus.UNSET }));
      const service = new InemSessionService(stub as never, cipher, client);

      await service.bootstrapOwaSession({ cookies: ['a'], origins: [] });

      expect(owaRow.status).toBe(OWASessionStatus.ACTIVE);
      expect(cipher.open('owa-session', 'owa', owaRow.storageState as Buffer)).toEqual({
        cookies: ['a'],
        origins: [],
      });
    });

    it('overwrites a previously EXPIRED session, same as a re-run of the bootstrap script', async () => {
      const { stub, owaRow } = buildPrismaStub(
        inemSessionRow(),
        owaSessionRow({ status: OWASessionStatus.EXPIRED, storageState: Buffer.from('stale') }),
      );
      const service = new InemSessionService(stub as never, cipher, client);

      await service.bootstrapOwaSession({ cookies: ['fresh'] });

      expect(owaRow.status).toBe(OWASessionStatus.ACTIVE);
      expect(cipher.open('owa-session', 'owa', owaRow.storageState as Buffer)).toEqual({ cookies: ['fresh'] });
    });
  });
});

function loginFormResponse(): Response {
  return new Response('<form id="login_form"><input name="username"/></form>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function assertionResponse(): Response {
  const headers = new Headers({ 'Content-Type': 'text/html' });
  headers.append('set-cookie', 'samlsessionid=rolled-saml; Path=/; Max-Age=28800');
  const html =
    '<form><input type="hidden" name="SAMLResponse" value="c2FtbA=="/>' +
    '<input type="hidden" name="RelayState" value="/Dashboard"/></form>';
  return new Response(html, { status: 200, headers });
}

function acsResponse(alAuth: string): Response {
  const headers = new Headers({ location: '/Dashboard' });
  headers.append('set-cookie', `alAuth=${alAuth}; Path=/; Secure; HttpOnly; SameSite=None`);
  return new Response(null, { status: 302, headers });
}

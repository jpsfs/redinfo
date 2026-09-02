import { Injectable, Logger } from '@nestjs/common';

/** The `alAuth` + friends jar this client is handed for every call. Owns no state itself. */
export interface InemCookieJar {
  alAuth: string;
  /** `fac.inem.pt`-scoped. Only ever read/written by the warm re-mint chain in `InemSessionService`. */
  samlsessionid: string | null;
  deviceId: string | null;
}

/** `GET /api/unit` row shape — see docs/inem-portal-contract.md. */
export interface InemUnitApiRow {
  StationName: string | null;
  Station: string | null;
  UnitID: string;
  CarID: string | null;
  DeviceID: string | null;
  DeviceAlias: string | null;
  Active: string | null;
  INOPReason: string | null;
  UnitType: string | null;
}

/** `GET /api/Statistics` shape. */
export interface InemStatisticsApiRow {
  UnitByType: Record<string, number>;
  Available: number;
  INOP: number;
  Busy: number;
  NumberOfRadios: number;
}

/**
 * Thrown for the confirmed dead-session signature: a `403` from any `/api/*`
 * call. Callers (`InemSessionService`) catch this specifically to trigger
 * recovery; anything else is a genuine error and propagates.
 */
export class InemSessionExpiredError extends Error {
  constructor(readonly path: string) {
    super(`INEM session expired calling ${path}`);
    this.name = 'InemSessionExpiredError';
  }
}

/** Anything from the wire that isn't the 403 dead-session signature: network failure, bad status, bad body shape. */
export class InemApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'InemApiError';
  }
}

/**
 * The INEM `/api/*` REST surface (`docs/inem-portal-contract.md#rest-api`).
 * Takes cookies as a parameter on every call and holds no state of its own —
 * `InemSessionService` is the only thing that reads or writes `InemCookieJar`
 * values; this class just spends them.
 *
 * Deliberately does not follow redirects (`redirect: 'manual'`): a redirect
 * or a non-JSON body must never be coerced into empty data — see the
 * contract doc's "A dead session presents as an empty list" failure mode.
 */
@Injectable()
export class InemApiClient {
  private readonly logger = new Logger(InemApiClient.name);
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.INEM_BASE_URL ?? 'https://portalpem.inem.pt') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getEntities(cookies: InemCookieJar): Promise<string[]> {
    return this.get<string[]>(cookies, '/api/Entity');
  }

  getInopReasons(cookies: InemCookieJar): Promise<Record<string, string>> {
    return this.get<Record<string, string>>(cookies, '/api/INOP');
  }

  getUnits(cookies: InemCookieJar, entity: string): Promise<InemUnitApiRow[]> {
    return this.get<InemUnitApiRow[]>(cookies, `/api/unit?entity=${encodeURIComponent(entity)}`);
  }

  getStatistics(cookies: InemCookieJar, entity: string): Promise<InemStatisticsApiRow> {
    return this.get<InemStatisticsApiRow>(cookies, `/api/Statistics?entity=${encodeURIComponent(entity)}`);
  }

  /**
   * The write path. `pending` is a batch map — several units in one call —
   * and `INEM_AVAILABLE_INOP_CODE` ('00') is what marks a unit available.
   * There is no `Active` field; see docs/inem-portal-contract.md for why an
   * earlier `{UnitID, Active, INOPReason}` guess was wrong.
   */
  async putUnits(
    cookies: InemCookieJar,
    entity: string,
    pending: Record<string, { INOP: string }>,
  ): Promise<void> {
    const path = '/api/unit';
    const res = await this.fetch(cookies, path, {
      method: 'PUT',
      body: JSON.stringify({ pending, currentEntity: entity }),
    });
    if (res.status === 403) {
      this.logger.warn(`INEM PUT ${path} -> 403 (session expired)`);
      throw new InemSessionExpiredError(path);
    }
    if (this.isUnfollowedRedirect(res)) {
      throw new InemApiError(`INEM PUT ${path} returned an unexpected redirect`);
    }
    if (res.status !== 204) {
      throw new InemApiError(`INEM PUT ${path} -> ${res.status}`, res.status);
    }
  }

  private async get<T>(cookies: InemCookieJar, path: string): Promise<T> {
    const res = await this.fetch(cookies, path, { method: 'GET' });

    if (res.status === 403) {
      this.logger.warn(`INEM GET ${path} -> 403 (session expired)`);
      throw new InemSessionExpiredError(path);
    }
    if (this.isUnfollowedRedirect(res)) {
      // Never coerce a redirected response into empty data — this is exactly
      // how INEM's own SPA quietly renders a dead session as an empty table.
      throw new InemApiError(`INEM GET ${path} returned an unexpected redirect`);
    }
    if (!res.ok) {
      throw new InemApiError(`INEM GET ${path} -> ${res.status}`, res.status);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new InemApiError(`INEM GET ${path} returned non-JSON content-type "${contentType}"`);
    }
    return (await res.json()) as T;
  }

  private fetch(cookies: InemCookieJar, path: string, init: { method: string; body?: string }): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: init.method,
      body: init.body,
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `alAuth=${cookies.alAuth}`,
      },
    });
  }

  private isUnfollowedRedirect(res: Response): boolean {
    return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
  }
}

import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { INEMSession, INEMSessionStatus, OWASessionStatus, Prisma } from '@prisma/client';
import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher, UnknownIdentityKeyError } from '../common/identity-cipher';
import { InemApiClient, InemCookieJar, InemSessionExpiredError } from './inem-api.client';
import { extractSamlAssertion, isInemLoginForm } from './inem-saml.util';

const INEM_SESSION_ID = 'inem';
const INEM_SESSION_SCOPE = 'inem-session';
const OWA_SESSION_ID = 'owa';
const OWA_SESSION_SCOPE = 'owa-session';

/** After this many consecutive cold-login failures, the breaker trips and stays tripped until a human intervenes. */
const LOGIN_FAILURE_LIMIT = 2;

/** Single-flight key: only one recovery attempt (warm re-mint or cold-login handoff) runs at a time. */
const RECOVERY_LOCK_SQL = Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inem-session-recover')::bigint)`;

type WarmReMintResult =
  | { ok: true; cookies: InemCookieJar }
  | { ok: false; reason: 'login_required' | 'error'; message?: string };

/**
 * The session broker (#214). Owns `alAuth` + `samlsessionid` in `INEMSession`
 * and the OWA `storageState` in `OWASession`. Every outbound INEM call in
 * this module goes through here first for its cookies — `InemApiClient` is
 * never called with cookies from anywhere else.
 *
 * State machine: `UNKNOWN → LOGGING_IN → ACTIVE → EXPIRED → LOGGING_IN`, plus
 * terminal `FAILED` (the circuit breaker). See
 * `docs/inem-portal-contract.md` for the wire contract this drives.
 */
@Injectable()
export class InemSessionService {
  private readonly logger = new Logger(InemSessionService.name);
  private readonly baseUrl: string;
  private readonly entity: string;
  private readonly enabled: boolean;

  /**
   * The live `GET /api/INOP` map, refreshed by the reconciler on every
   * successful pass. In-memory rather than persisted: it's display data with
   * a documented compile-time fallback (`INEM_INOP_REASONS`), not state that
   * needs to survive a restart.
   */
  private cachedInopReasons: Record<string, string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: IdentityCipher,
    private readonly client: InemApiClient,
  ) {
    this.baseUrl = (process.env.INEM_BASE_URL ?? 'https://portalpem.inem.pt').replace(/\/$/, '');
    this.entity = process.env.INEM_ENTITY ?? 'CVCAMPO';
    // Fails soft with no credentials configured — staging/dev stay without
    // real INEM credentials by design (see .env.example).
    this.enabled = process.env.INEM_ENABLED === 'true' && !!process.env.INEM_USERNAME;
  }

  get entityId(): string {
    return this.entity;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setCachedInopReasons(reasons: Record<string, string>): void {
    this.cachedInopReasons = reasons;
  }

  getCachedInopReasons(): Record<string, string> | null {
    return this.cachedInopReasons;
  }

  async getOverview(): Promise<{ status: INEMSessionStatus; lastError: string | null }> {
    const row = await this.row();
    return { status: row.status, lastError: row.lastError };
  }

  /**
   * Cookies to call INEM with, or `null` when there is currently nothing
   * usable — a tripped breaker, a login in flight, or a session never
   * bootstrapped. Callers must not treat `null` as "call anyway"; they skip
   * this cycle and leave whatever state they hold untouched.
   */
  async getCookiesOrNull(): Promise<InemCookieJar | null> {
    if (!this.enabled) return null;
    const row = await this.row();
    if (row.status === INEMSessionStatus.FAILED || !row.cookies) return null;
    return this.openCookies(Buffer.from(row.cookies));
  }

  /** Reactive recovery: call after an `InemSessionExpiredError` (a 403 from `/api/*`). */
  async recover(): Promise<void> {
    if (!this.enabled) return;
    await this.withRecoveryLock((tx, row) => this.performRecovery(tx, row, { bootstrapWhenNoSession: true }));
  }

  /**
   * Keep-alive layer 2. Rolls `samlsessionid` on a timer well inside its 8h
   * window, *even when `alAuth` is perfectly healthy* — `alAuth` keep-alive
   * traffic never touches `fac.inem.pt` and so never rolls it. Does nothing
   * if there is no `samlsessionid` to roll yet; bootstrapping a session from
   * nothing is the reactive path's job, not the timer's.
   */
  async proactiveReMint(): Promise<void> {
    if (!this.enabled) return;
    await this.withRecoveryLock((tx, row) => this.performRecovery(tx, row, { bootstrapWhenNoSession: false }));
  }

  /**
   * Keep-alive layer 1: a cheap, side-effect-free ping that also surfaces a
   * dead `alAuth` promptly instead of waiting for the reconciler's next pass.
   */
  async pingStatistics(): Promise<void> {
    const cookies = await this.getCookiesOrNull();
    if (!cookies) {
      await this.recover();
      return;
    }
    try {
      await this.client.getStatistics(cookies, this.entity);
    } catch (err) {
      if (err instanceof InemSessionExpiredError) {
        await this.recover();
        return;
      }
      throw err;
    }
  }

  /** #214's half of the worker contract: hand the in-flight job to a polling worker. `null` when there is none. */
  async claimLoginJob(): Promise<INEMLoginJob | null> {
    const row = await this.row();
    if (row.status !== INEMSessionStatus.LOGGING_IN || !row.pendingLoginId || !row.pendingLoginStartedAt) {
      return null;
    }
    const owa = await this.owaRow();
    if (owa.status !== OWASessionStatus.ACTIVE || !owa.storageState) {
      // The prerequisite vanished between beginColdLogin() and this poll —
      // bail back to EXPIRED so the next recovery attempt starts clean.
      await this.prisma.iNEMSession.update({
        where: { id: INEM_SESSION_ID },
        data: {
          status: INEMSessionStatus.EXPIRED,
          pendingLoginId: null,
          pendingLoginStartedAt: null,
          lastError: 'OWA session is not active — run the #215 bootstrap script.',
        },
      });
      return null;
    }

    return {
      id: row.pendingLoginId,
      storageState: this.cipher.open(OWA_SESSION_SCOPE, OWA_SESSION_ID, Buffer.from(owa.storageState)),
      startedAt: row.pendingLoginStartedAt.toISOString(),
    };
  }

  /** The other half: the worker's `{ cookies, expiresAt, refreshedStorageState } | { ok: false, ... }` result. */
  async submitLoginResult(jobId: string, result: INEMLoginJobResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(RECOVERY_LOCK_SQL);
      const row = await tx.iNEMSession.findUniqueOrThrow({ where: { id: INEM_SESSION_ID } });

      if (row.pendingLoginId !== jobId) {
        // A stale or duplicate result from a job we've already moved past
        // (superseded, or the breaker tripped in the meantime). Not an
        // error the worker should retry over.
        this.logger.warn(`Ignoring INEM login result for unknown/stale job ${jobId}`);
        return;
      }

      if (result.ok) {
        await tx.iNEMSession.update({
          where: { id: INEM_SESSION_ID },
          data: {
            status: INEMSessionStatus.ACTIVE,
            cookies: this.cipher.seal(INEM_SESSION_SCOPE, INEM_SESSION_ID, result.cookies as InemCookieJar),
            expiresAt: new Date(result.expiresAt),
            failureCount: 0,
            lastError: null,
            pendingLoginId: null,
            pendingLoginStartedAt: null,
          },
        });
        // The OWA cookie is a sliding window that refreshes on use — not
        // persisting this is the failure that works for months and then
        // dies with no proximate cause.
        await tx.oWASession.update({
          where: { id: OWA_SESSION_ID },
          data: { storageState: this.cipher.seal(OWA_SESSION_SCOPE, OWA_SESSION_ID, result.refreshedStorageState) },
        });
        return;
      }

      const failureCount = row.failureCount + 1;
      const tripped = failureCount >= LOGIN_FAILURE_LIMIT;
      this.logger.error(`INEM cold login failed (${result.reason}): ${result.message}`);
      if (tripped) {
        this.logger.error(
          'INEM login circuit breaker tripped after 2 consecutive failures — automated retries stop here; recovery is manual.',
        );
      }
      await tx.iNEMSession.update({
        where: { id: INEM_SESSION_ID },
        data: {
          status: tripped ? INEMSessionStatus.FAILED : INEMSessionStatus.EXPIRED,
          failureCount,
          lastError: `${result.reason}: ${result.message}`,
          pendingLoginId: null,
          pendingLoginStartedAt: null,
        },
      });

      if (result.reason === 'owa_session_expired') {
        await tx.oWASession.update({ where: { id: OWA_SESSION_ID }, data: { status: OWASessionStatus.EXPIRED } });
      }
    });
  }

  // ── Recovery internals ───────────────────────────────────────────────────

  private async withRecoveryLock(
    fn: (tx: Prisma.TransactionClient, row: INEMSession) => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(RECOVERY_LOCK_SQL);
      const row = await tx.iNEMSession.findUniqueOrThrow({ where: { id: INEM_SESSION_ID } });
      await fn(tx, row);
    });
  }

  private async performRecovery(
    tx: Prisma.TransactionClient,
    row: INEMSession,
    opts: { bootstrapWhenNoSession: boolean },
  ): Promise<void> {
    if (row.status === INEMSessionStatus.FAILED || row.status === INEMSessionStatus.LOGGING_IN) {
      return; // breaker tripped (manual recovery only) or a login is already in flight
    }

    const cookies = row.cookies ? this.openCookies(Buffer.from(row.cookies)) : null;
    if (!cookies?.samlsessionid) {
      if (opts.bootstrapWhenNoSession) await this.beginColdLogin(tx, row);
      return;
    }

    const remint = await this.attemptWarmReMint(cookies);
    if (remint.ok) {
      await tx.iNEMSession.update({
        where: { id: INEM_SESSION_ID },
        data: {
          status: INEMSessionStatus.ACTIVE,
          cookies: this.cipher.seal(INEM_SESSION_SCOPE, INEM_SESSION_ID, remint.cookies),
          failureCount: 0,
          lastError: null,
        },
      });
      return;
    }
    if (remint.reason === 'login_required') {
      // The IdP session itself is dead — the warm path is exhausted.
      await this.beginColdLogin(tx, row);
      return;
    }

    this.logger.warn(`INEM warm re-mint failed, will retry: ${remint.message}`);
    await tx.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: { status: INEMSessionStatus.EXPIRED, lastError: remint.message ?? 'warm re-mint failed' },
    });
  }

  /** Hands off to #215's worker. Does not itself touch the circuit breaker — only a *result* (`submitLoginResult`) does. */
  private async beginColdLogin(tx: Prisma.TransactionClient, row: INEMSession): Promise<void> {
    const owa = await tx.oWASession.findUniqueOrThrow({ where: { id: OWA_SESSION_ID } });
    if (owa.status !== OWASessionStatus.ACTIVE || !owa.storageState) {
      await tx.iNEMSession.update({
        where: { id: INEM_SESSION_ID },
        data: {
          status: INEMSessionStatus.EXPIRED,
          lastError: 'OWA session is not active — run the #215 bootstrap script before a cold login can proceed.',
        },
      });
      return;
    }

    await tx.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: {
        status: INEMSessionStatus.LOGGING_IN,
        pendingLoginId: randomJobId(),
        pendingLoginStartedAt: new Date(),
      },
    });
  }

  /**
   * The warm re-mint chain (`docs/inem-portal-contract.md#warm-re-mint--plain-http-no-browser`):
   * `GET /saml/signin` → follow to the IdP → the response is either the
   * login form (dead) or a SAML auto-POST assertion (alive) → `POST` the
   * assertion to `/saml/acs` → the redirect response carries the new
   * `alAuth`. Three requests, no browser, no password, no OTP.
   */
  private async attemptWarmReMint(cookies: InemCookieJar): Promise<WarmReMintResult> {
    if (!cookies.samlsessionid) return { ok: false, reason: 'login_required' };

    try {
      const signin = await fetch(`${this.baseUrl}/saml/signin`, { redirect: 'manual' });
      const idpUrl = signin.headers.get('location');
      if (!isRedirect(signin) || !idpUrl) {
        return { ok: false, reason: 'error', message: `unexpected /saml/signin response (status ${signin.status})` };
      }

      const idpRes = await fetch(idpUrl, { headers: { Cookie: facCookieHeader(cookies) } });
      const html = await idpRes.text();
      const rolledSamlSessionId =
        extractCookieValue(idpRes.headers.getSetCookie(), 'samlsessionid') ?? cookies.samlsessionid;
      const rolledDeviceId = extractCookieValue(idpRes.headers.getSetCookie(), 'device_id') ?? cookies.deviceId;

      if (isInemLoginForm(html)) {
        return { ok: false, reason: 'login_required' };
      }
      const assertion = extractSamlAssertion(html);
      if (!assertion) {
        return { ok: false, reason: 'error', message: 'IdP response was neither a login form nor an assertion form' };
      }

      const acsRes = await fetch(`${this.baseUrl}/saml/acs`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ SAMLResponse: assertion.samlResponse, RelayState: assertion.relayState }).toString(),
      });
      const alAuth = extractCookieValue(acsRes.headers.getSetCookie(), 'alAuth');
      if (!alAuth) {
        return { ok: false, reason: 'error', message: `/saml/acs did not set alAuth (status ${acsRes.status})` };
      }

      return {
        ok: true,
        cookies: { alAuth, samlsessionid: rolledSamlSessionId, deviceId: rolledDeviceId },
      };
    } catch (err) {
      // Network failure or anything else unexpected — not a "login required"
      // finding, so no cold login here. Just report and let the next tick retry.
      return { ok: false, reason: 'error', message: (err as Error).message };
    }
  }

  private openCookies(blob: Buffer): InemCookieJar | null {
    try {
      return this.cipher.open<InemCookieJar>(INEM_SESSION_SCOPE, INEM_SESSION_ID, blob);
    } catch (cause) {
      if (!(cause instanceof UnknownIdentityKeyError)) {
        this.logger.error(`INEM session blob could not be opened: ${(cause as Error).message}`);
      }
      return null;
    }
  }

  private row(): Promise<INEMSession> {
    return this.prisma.iNEMSession.findUniqueOrThrow({ where: { id: INEM_SESSION_ID } });
  }

  private owaRow() {
    return this.prisma.oWASession.findUniqueOrThrow({ where: { id: OWA_SESSION_ID } });
  }
}

function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400;
}

function facCookieHeader(cookies: InemCookieJar): string {
  const parts = [`samlsessionid=${cookies.samlsessionid}`];
  if (cookies.deviceId) parts.push(`device_id=${cookies.deviceId}`);
  return parts.join('; ');
}

function extractCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${name}=([^;]*)`));
    if (match) return match[1];
  }
  return null;
}

function randomJobId(): string {
  return `inem-login-${randomUUID()}`;
}

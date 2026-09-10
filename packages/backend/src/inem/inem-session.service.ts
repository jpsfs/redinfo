import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { INEMSession, INEMSessionStatus, OWASessionStatus, Prisma } from '@prisma/client';
import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher, UnknownIdentityKeyError } from '../common/identity-cipher';
import { InemApiClient, InemApiError, InemCookieJar, InemSessionExpiredError } from './inem-api.client';
import { extractSamlAssertion, isInemLoginForm } from './inem-saml.util';
import { inemTrustedDispatcher } from './inem-trusted-ca';

const INEM_SESSION_ID = 'inem';
const INEM_SESSION_SCOPE = 'inem-session';
const OWA_SESSION_ID = 'owa';
const OWA_SESSION_SCOPE = 'owa-session';

/**
 * After this many consecutive failures of the *same kind of effort* — cold
 * login, warm re-mint, or a live reconcile/keep-alive call — the breaker
 * trips and every scheduled loop goes outbound-silent until a human
 * intervenes (`getCookiesOrNull`/`performRecovery` both refuse to touch a
 * `FAILED` session). Found live 2026-09-10: a bare TLS/network failure on the
 * warm re-mint chain used to retry forever without ever tripping, hammering
 * `portalpem.inem.pt` every few minutes indefinitely — the platform this
 * integration talks to is someone else's, and repeatedly failing the exact
 * same way is a signal to stop, not to keep trying. Set to 2 rather than 1 so
 * a single transient blip doesn't require a manual reset; not higher, so a
 * real, persistent problem can't run unbounded.
 */
const CONSECUTIVE_FAILURE_LIMIT = 2;

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
export class InemSessionService implements OnModuleInit {
  private readonly logger = new Logger(InemSessionService.name);
  private readonly baseUrl: string;
  private readonly entity: string;
  private readonly enabled: boolean;

  /**
   * The live `GET /api/INOP` map, refreshed by the reconciler on every
   * successful pass. Kept in memory for cheap reads, but backed by
   * `INEMSession.cachedInopReasons` (#218): a bare in-memory cache reset to
   * null on every restart, which in production means every deploy re-serves
   * the wrong-scheme compile-time `INEM_INOP_REASONS` fallback until the
   * next reconcile — persisting it means a restart re-hydrates yesterday's
   * real map instead.
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

  async onModuleInit(): Promise<void> {
    // Same guard as `getCookiesOrNull`: staging/dev run with the feature
    // disabled and no INEM row to speak of — never touch Prisma here unless
    // the integration is actually on.
    if (!this.enabled) return;
    const row = await this.row();
    if (row.cachedInopReasons) this.cachedInopReasons = row.cachedInopReasons as Record<string, string>;
  }

  get entityId(): string {
    return this.entity;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async setCachedInopReasons(reasons: Record<string, string>): Promise<void> {
    this.cachedInopReasons = reasons;
    await this.prisma.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: { cachedInopReasons: reasons },
    });
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
      await this.recordApiFailure(err);
      return;
    }
    await this.markHealthy();
  }

  /**
   * Called after any outbound INEM call that just succeeded with the
   * session's current cookies — the surest evidence the session is fine,
   * even if it's still flagged `EXPIRED` from an earlier transient failure
   * (a blip that never got a chance to self-correct, since nothing else
   * calls this on the success path — only a warm re-mint's own success
   * does). Never touches a tripped breaker or a login in flight; those are
   * `recover()`'s job, not this one's.
   */
  async markHealthy(): Promise<void> {
    if (!this.enabled) return;
    const row = await this.row();
    if (row.status === INEMSessionStatus.ACTIVE || row.status === INEMSessionStatus.FAILED || row.status === INEMSessionStatus.LOGGING_IN) {
      return;
    }
    await this.prisma.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: { status: INEMSessionStatus.ACTIVE, failureCount: 0, lastError: null },
    });
  }

  /**
   * Records a failure from a live call that reached INEM with cookies good
   * enough to be sent (i.e. not `InemSessionExpiredError` — that has its own
   * `recover()` path) — the reconciler's `GET`/`PUT` calls and the
   * statistics keep-alive ping both funnel their non-session errors here.
   *
   * A 4xx response trips the breaker immediately, no second chance: it's
   * INEM telling us the request itself is wrong (bad payload, a permission
   * revoked, ...), and retrying the identical request on a schedule forever
   * only hammers their server for an outcome that cannot change without a
   * code or config fix here. Anything else (a network blip, INEM's own 5xx)
   * gets the same one-retry grace as a cold-login or warm re-mint failure
   * before tripping — see `CONSECUTIVE_FAILURE_LIMIT`.
   *
   * A no-op once already `FAILED`: nothing to escalate, and the loops that
   * call this already stopped reaching INEM at all by that point. Also a
   * no-op mid-`LOGGING_IN` — same reasoning as `markHealthy`'s own guard,
   * and the gap `markHealthy` doesn't have: `getCookiesOrNull` can still hand
   * back a non-null jar while a cold login is in flight (`beginColdLogin`
   * only flips `status`, it never clears the old `cookies` column), so a
   * reconcile pass or the keep-alive ping racing against that login can spend
   * those stale cookies, get back something other than the `403` `recover()`
   * knows to ignore during `LOGGING_IN`, and land here instead — which used
   * to flip `status` to `EXPIRED`/`FAILED` out from under the login, orphaning
   * it: `pendingLoginId` stays set forever, `claimLoginJob` starts refusing it
   * (it requires `status === LOGGING_IN`), and the worker's eventual
   * `submitLoginResult` for a human's already-completed MFA is discarded as
   * "unknown/stale job".
   */
  async recordApiFailure(err: unknown): Promise<void> {
    if (!this.enabled) return;
    const row = await this.row();
    if (row.status === INEMSessionStatus.FAILED || row.status === INEMSessionStatus.LOGGING_IN) return;

    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof InemApiError ? err.status : undefined;
    const isClientError = status !== undefined && status >= 400 && status < 500;
    const failureCount = row.failureCount + 1;
    const tripped = isClientError || failureCount >= CONSECUTIVE_FAILURE_LIMIT;

    if (tripped) {
      this.logger.error(
        isClientError
          ? `INEM circuit breaker tripped immediately on a ${status} response — retrying the same request would not change the outcome; recovery is manual: ${message}`
          : `INEM circuit breaker tripped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures — automated retries stop here; recovery is manual: ${message}`,
      );
    } else {
      this.logger.warn(`INEM call failed: ${message}`);
    }

    await this.prisma.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: { status: tripped ? INEMSessionStatus.FAILED : INEMSessionStatus.EXPIRED, failureCount, lastError: message },
    });
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

  /**
   * The bootstrap script's (#215) one write: a human completed MFA in a
   * headed browser once, and the script posts the resulting `storageState`
   * here to be sealed and stored. Never called by the poll-loop worker
   * itself — only `submitLoginResult` (`refreshedStorageState`) refreshes it
   * after that.
   */
  async bootstrapOwaSession(storageState: unknown): Promise<void> {
    await this.prisma.oWASession.update({
      where: { id: OWA_SESSION_ID },
      data: {
        status: OWASessionStatus.ACTIVE,
        storageState: this.cipher.seal(OWA_SESSION_SCOPE, OWA_SESSION_ID, storageState),
      },
    });
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
      const tripped = failureCount >= CONSECUTIVE_FAILURE_LIMIT;
      this.logger.error(`INEM cold login failed (${result.reason}): ${result.message}`);
      if (tripped) {
        this.logger.error(
          `INEM circuit breaker tripped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive cold-login failures — automated retries stop here; recovery is manual.`,
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

    // Used to stay EXPIRED forever regardless of how many times this failed —
    // found live 2026-09-10 retrying every few minutes against a TLS error
    // that could never self-correct, indefinitely. Now shares the same
    // breaker and threshold as a cold-login failure: one retry's grace, then
    // a full stop.
    const failureCount = row.failureCount + 1;
    const tripped = failureCount >= CONSECUTIVE_FAILURE_LIMIT;
    const message = remint.message ?? 'warm re-mint failed';
    this.logger.warn(`INEM warm re-mint failed: ${message}`);
    if (tripped) {
      this.logger.error(
        `INEM circuit breaker tripped after ${CONSECUTIVE_FAILURE_LIMIT} consecutive warm re-mint failures — automated retries stop here; recovery is manual.`,
      );
    }
    await tx.iNEMSession.update({
      where: { id: INEM_SESSION_ID },
      data: { status: tripped ? INEMSessionStatus.FAILED : INEMSessionStatus.EXPIRED, failureCount, lastError: message },
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
   *
   * All three go through `inemTrustedDispatcher` (`inem-trusted-ca.ts`) — the
   * first two are `portalpem.inem.pt`, same broken TLS chain `InemApiClient`
   * needs the workaround for. Skipping it here is exactly the bug that kept
   * production stuck failing "fetch failed" after that fix already shipped.
   */
  private async attemptWarmReMint(cookies: InemCookieJar): Promise<WarmReMintResult> {
    if (!cookies.samlsessionid) return { ok: false, reason: 'login_required' };

    try {
      const signin = await fetch(`${this.baseUrl}/saml/signin`, { redirect: 'manual', dispatcher: inemTrustedDispatcher });
      const idpUrl = signin.headers.get('location');
      if (!isRedirect(signin) || !idpUrl) {
        return { ok: false, reason: 'error', message: `unexpected /saml/signin response (status ${signin.status})` };
      }

      // Same trust-store workaround applies here even though `idpUrl` is
      // `fac.inem.pt`, not `portalpem.inem.pt` — the extra intermediate is
      // additive to Node's own roots (see `inem-trusted-ca.ts`), so it's a
      // no-op if this host's chain is actually fine and a fix if it isn't.
      const idpRes = await fetch(idpUrl, { headers: { Cookie: facCookieHeader(cookies) }, dispatcher: inemTrustedDispatcher });
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
        dispatcher: inemTrustedDispatcher,
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

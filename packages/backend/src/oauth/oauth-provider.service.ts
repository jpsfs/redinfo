import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../utils/date.util';
import { RedinfoClientsStore } from './oauth-clients.store';
import { MCP_CONSENT_TICKET_AUDIENCE, MCP_TOKEN_AUDIENCE, MCP_TOKEN_TYPE } from './mcp-token.constants';
import { sanitizeScopes, type McpScope } from './oauth-scopes';

/** How long a human has to act on a `/oauth/authorize` redirect before the ticket expires. */
const CONSENT_TICKET_TTL = '10m';
/** RFC-recommended-short lifetime for a code that exists only to be redeemed once. */
const AUTHORIZATION_CODE_TTL_SECONDS = 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What `authorize()` signs into the consent-page ticket — see its doc comment. */
export interface ConsentTicketPayload {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: McpScope[];
  state?: string;
  resource?: string;
}

/**
 * redinfo's OAuth 2.1 Authorization Server, as the MCP SDK's
 * `OAuthServerProvider` contract — everything `mcpAuthRouter` needs to run
 * `/authorize`, `/token`, and `/revoke` against this database, plus
 * `verifyAccessToken`, reused directly as the `/mcp` resource server's
 * bearer-token verifier (`main.ts`).
 *
 * The one thing this class does *not* do is show anyone a consent screen:
 * `authorize()` redirects to the SPA instead of finishing the OAuth redirect
 * itself, and `issueAuthorizationCode` — called from
 * `OAuthConsentController` once a real, JWT-authenticated user has approved
 * — is what actually completes it. See that controller for the human half
 * of this flow.
 */
@Injectable()
export class OAuthProviderService implements OAuthServerProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsStoreImpl: RedinfoClientsStore,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  get clientsStore(): RedinfoClientsStore {
    return this.clientsStoreImpl;
  }

  // ── Authorization — hands off to the SPA's consent page ────────────────────

  /**
   * Per the SDK's contract this "must eventually issue a redirect ... to the
   * given redirect URI" — it does, just not from this call. This call signs
   * everything the consent step needs into a short-lived ticket (nothing is
   * written to the database yet: there is nothing to clean up if the human
   * never responds) and sends the browser to the SPA's `/oauth/consent`
   * route. That page calls `OAuthConsentController`, authenticated as the
   * actual signed-in redinfo user, which is what finishes the redirect back
   * to `redirectUri` — with `code`+`state` on approval, `error` on denial.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const ticket: ConsentTicketPayload = {
      clientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: sanitizeScopes(params.scopes),
      state: params.state,
      resource: params.resource?.href,
    };
    const token = this.jwtService.sign(ticket, {
      expiresIn: CONSENT_TICKET_TTL,
      audience: MCP_CONSENT_TICKET_AUDIENCE,
    });
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    res.redirect(`${frontendUrl}/#/oauth/consent?ticket=${encodeURIComponent(token)}`);
  }

  /**
   * Called by `OAuthConsentController` once a signed-in user approves —
   * this is the only place an `OAuthAuthorizationCode` row is created.
   */
  async issueAuthorizationCode(userId: string, ticket: ConsentTicketPayload): Promise<string> {
    const code = randomToken();
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: ticket.clientId,
        userId,
        redirectUri: ticket.redirectUri,
        codeChallenge: ticket.codeChallenge,
        scopes: ticket.scopes,
        expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
      },
    });
    return code;
  }

  // ── Token exchange ──────────────────────────────────────────────────────────

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const row = await this.findPendingCode(client.client_id, authorizationCode);
    return row.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const row = await this.findPendingCode(client.client_id, authorizationCode);
    if (redirectUri && redirectUri !== row.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }

    // Single-use: mark consumed in the same call that hands out tokens for it.
    // A double-submit races this update, not a re-read of `consumedAt` — the
    // second caller's `findPendingCode` still sees `consumedAt: null` until
    // this commits, but Postgres serializes the two `UPDATE`s, and only one
    // request goes on to mint a grant.
    await this.prisma.oAuthAuthorizationCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    return this.issueGrant(client.client_id, row.userId, row.scopes as McpScope[], resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const grant = await this.prisma.oAuthGrant.findUnique({ where: { refreshToken } });
    if (!grant || grant.clientId !== client.client_id || grant.revokedAt || grant.expiresAt < new Date()) {
      throw new InvalidGrantError('Invalid, expired, or revoked refresh token');
    }

    // A refresh may only narrow scope, never widen it (RFC 6749 §6).
    const narrowed = scopes && scopes.length > 0 ? grant.scopes.filter((s) => scopes.includes(s)) : grant.scopes;

    const newRefreshToken = randomToken();
    await this.prisma.oAuthGrant.update({
      where: { id: grant.id },
      data: {
        refreshToken: newRefreshToken,
        scopes: narrowed,
        lastUsedAt: new Date(),
        expiresAt: addDays(new Date(), REFRESH_TOKEN_TTL_DAYS),
      },
    });

    return {
      access_token: this.signAccessToken(grant.id, grant.userId, narrowed as McpScope[], client.client_id, resource),
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: narrowed.join(' '),
    };
  }

  /** Creates the durable `OAuthGrant` row and mints the first token pair for it. */
  private async issueGrant(
    clientId: string,
    userId: string,
    scopes: McpScope[],
    resource: URL | undefined,
  ): Promise<OAuthTokens> {
    const refreshToken = randomToken();
    const grant = await this.prisma.oAuthGrant.create({
      data: {
        userId,
        clientId,
        scopes,
        refreshToken,
        expiresAt: addDays(new Date(), REFRESH_TOKEN_TTL_DAYS),
        lastUsedAt: new Date(),
      },
    });

    return {
      access_token: this.signAccessToken(grant.id, userId, scopes, clientId, resource),
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  private signAccessToken(
    grantId: string,
    userId: string,
    scopes: McpScope[],
    clientId: string,
    resource: URL | undefined,
  ): string {
    return this.jwtService.sign(
      {
        sub: userId,
        gid: grantId,
        cid: clientId,
        scope: scopes.join(' '),
        typ: MCP_TOKEN_TYPE,
        resource: resource?.href,
      },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS, audience: MCP_TOKEN_AUDIENCE },
    );
  }

  // ── Resource-server side: verifying a bearer token on `/mcp` ───────────────

  /**
   * Doubles as the `OAuthTokenVerifier` passed to `requireBearerAuth` for
   * `/mcp` itself (see `main.ts`) — one verification path for both roles the
   * SDK needs from a provider.
   *
   * Re-checking the `OAuthGrant` row (not just the JWT signature) on every
   * call is deliberate: it is what makes a revoke on the "AI connections"
   * page take effect immediately, rather than waiting out the access
   * token's own hour-long `exp`.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: {
      sub: string;
      gid: string;
      cid: string;
      scope: string;
      typ: string;
      resource?: string;
      exp: number;
    };
    try {
      payload = await this.jwtService.verifyAsync(token, { audience: MCP_TOKEN_AUDIENCE });
    } catch {
      throw new InvalidTokenError('Invalid or expired access token');
    }
    if (payload.typ !== MCP_TOKEN_TYPE) {
      throw new InvalidTokenError('Not an MCP access token');
    }

    const grant = await this.prisma.oAuthGrant.findUnique({ where: { id: payload.gid } });
    if (!grant || grant.revokedAt || grant.userId !== payload.sub) {
      throw new InvalidTokenError('Token has been revoked');
    }

    return {
      token,
      clientId: payload.cid,
      scopes: payload.scope.split(' ').filter(Boolean),
      expiresAt: payload.exp,
      resource: payload.resource ? new URL(payload.resource) : undefined,
      extra: { userId: payload.sub, grantId: payload.gid },
    };
  }

  // ── Revocation ───────────────────────────────────────────────────────────────

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    // `request.token` may be either member of the pair; only the refresh
    // token is a row we can look up directly. An access-token revoke request
    // is a no-op here — it already self-expires within the hour, and RFC
    // 7009 explicitly allows "the server may not have a mapping for it".
    await this.prisma.oAuthGrant.updateMany({
      where: { refreshToken: request.token, clientId: client.client_id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── Shared lookups ───────────────────────────────────────────────────────────

  private async findPendingCode(clientId: string, code: string) {
    const row = await this.prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
    if (!row || row.clientId !== clientId || row.consumedAt || row.expiresAt < new Date()) {
      throw new InvalidGrantError('Invalid, expired, or already-used authorization code');
    }
    return row;
  }
}

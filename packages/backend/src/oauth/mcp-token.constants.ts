/**
 * The claims that separate an MCP access token from an ordinary portal
 * session token, even though both are HS256 JWTs signed with the same
 * `JWT_SECRET`.
 *
 * Kept in their own zero-dependency file so `auth/strategies/jwt.strategy.ts`
 * can import just this constant — rejecting a token carrying it — without
 * pulling in the rest of `src/oauth/`. See that file's `validate()` for the
 * portal side of the split, and `oauth-provider.service.ts` for where these
 * are actually signed and verified.
 *
 * Deliberately additive rather than a new required claim on portal tokens:
 * every portal access/refresh token ever issued (including ones already
 * live in staging/production sessions before this shipped) has no `aud`
 * claim at all, so `JwtStrategy` only ever checks for the *presence* of
 * `MCP_TOKEN_AUDIENCE`, never requires a specific portal audience. That
 * keeps this change from silently logging out every signed-in user the
 * moment it deploys.
 */
export const MCP_TOKEN_AUDIENCE = 'redinfo-mcp';
export const MCP_TOKEN_TYPE = 'mcp';

/** The audience on the short-lived ticket `authorize()` hands the consent page. */
export const MCP_CONSENT_TICKET_AUDIENCE = 'redinfo-mcp-consent';

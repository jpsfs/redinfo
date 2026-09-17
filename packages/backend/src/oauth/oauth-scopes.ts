/**
 * The two scopes offered on the consent screen — see the plan's "coarse
 * scopes, intersected with role" decision. A grant's scopes are a ceiling,
 * never a grant of privilege on their own: `mcp/tools/tool-registry.ts`
 * intersects whatever a token carries with `hasPermission(user.roles, …)`
 * from `@redinfo/shared` before a tool is ever listed or called, so a
 * connection can never do more than the person already can in the portal —
 * only less, if they chose to grant less.
 */
export const MCP_READ_SCOPE = 'redinfo:read';
export const MCP_WRITE_SCOPE = 'redinfo:write';

export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value);
}

/** Drops anything a client requested that isn't one of ours, rather than erroring. */
export function sanitizeScopes(requested: string[] | undefined): McpScope[] {
  return (requested ?? []).filter(isMcpScope);
}

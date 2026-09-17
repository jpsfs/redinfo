import { Inject, Injectable } from '@nestjs/common';
import { hasPermission, type UserRole } from '@redinfo/shared';
import type { McpScope } from '../oauth/oauth-scopes';
import { MCP_TOOL_DEFINITIONS } from './mcp.tokens';
import type { McpToolDefinition } from './mcp-tool.types';

/**
 * The one place a tool's visibility is decided — used identically for
 * `tools/list` (so an assistant never sees a tool it couldn't call) and
 * again immediately before `tools/call` dispatches (so a stale tool list on
 * the client side, or a scope narrowed mid-session by a refresh, can never
 * run something the token no longer covers). Mirrors `RolesGuard`'s
 * `@Actions` check — same `hasPermission` from `@redinfo/shared`, the one
 * permission table in this repo.
 */
@Injectable()
export class ToolRegistryService {
  constructor(@Inject(MCP_TOOL_DEFINITIONS) private readonly allTools: McpToolDefinition[]) {}

  toolsFor(roles: UserRole[], scopes: McpScope[]): McpToolDefinition[] {
    return this.allTools.filter(
      (tool) =>
        scopes.includes(tool.scope) &&
        (tool.requiredActions.length === 0 ||
          tool.requiredActions.every((action) => hasPermission(roles, action))),
    );
  }
}

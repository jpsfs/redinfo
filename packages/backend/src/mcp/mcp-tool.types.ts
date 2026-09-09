import type { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { Action, UserRole } from '@redinfo/shared';
import type { McpScope } from '../oauth/oauth-scopes';

/** The full serialized person `UsersService.findOne` returns — every domain service already takes this. */
export type McpUser = { id: string; roles: UserRole[] };

/** What a tool handler gets alongside its parsed arguments. */
export interface McpToolContext {
  user: McpUser;
  scopes: McpScope[];
}

/**
 * One MCP tool, declared rather than hand-registered — `ToolRegistryService`
 * is what turns a list of these into what `tools/list` advertises and what
 * `tools/call` is allowed to run, filtering on `scope` and `requiredActions`
 * *before* a tool ever reaches an AI client, the same "never even see it"
 * shape as `useCapabilities()` on the frontend.
 *
 * `handler`'s `args` is deliberately untyped against `inputSchema` here — a
 * heterogeneous array of these (`ToolRegistryService`'s whole point) can't
 * carry a different `Shape` per element without existential typing TS
 * doesn't have. The SDK parses and validates `args` against `inputSchema`
 * before a handler ever runs (`McpServer.registerTool`), so each handler
 * body reads its own fields knowing they already match the schema it wrote
 * two lines above.
 */
export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** `redinfo:read` or `redinfo:write` — see `oauth-scopes.ts`. */
  scope: McpScope;
  /**
   * The `@Actions(...)` this tool's REST equivalent would require. Empty
   * means self-scoped (a "my own data" tool, matching a route with neither
   * `@Actions` nor `@Roles` — see the backend controller-pattern doc).
   */
  requiredActions: Action[];
  annotations?: ToolAnnotations;
  handler: (args: Record<string, any>, ctx: McpToolContext) => Promise<unknown>;
}

/** Implemented by each domain's `<domain>.tools.ts` — see `mcp.module.ts` for how these combine. */
export interface McpToolProvider {
  getTools(): McpToolDefinition[];
}

import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpScope } from '../oauth/oauth-scopes';
import { ToolRegistryService } from './tool-registry.service';
import { McpAuditService } from './mcp-audit.service';
import type { McpToolContext, McpUser } from './mcp-tool.types';

/**
 * Builds one `McpServer` per request (stateless mode — see `mcp.mount.ts`),
 * with only the tools this token's scopes and this user's roles actually
 * allow already registered. There is nothing to reconfigure per-connection
 * beyond that: `McpServer` itself carries no request state this codebase
 * cares about, so a fresh instance per request is simpler than pooling one.
 */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly audit: McpAuditService,
  ) {}

  build(user: McpUser, scopes: McpScope[], clientId: string): McpServer {
    const server = new McpServer(
      { name: 'redinfo', version: '0.1.0' },
      { instructions: 'Read and act on redinfo — schedules, availability, volunteer hours, event reports and live runs — as the connected person, within their own role.' },
    );

    const context: McpToolContext = { user, scopes };

    for (const tool of this.registry.toolsFor(user.roles, scopes)) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        },
        async (args: Record<string, unknown>) => {
          this.audit.logToolCall({ userId: user.id, roles: user.roles, clientId, toolName: tool.name });
          try {
            const result = await tool.handler(args as never, context);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
            };
          }
        },
      );
    }

    return server;
  }
}

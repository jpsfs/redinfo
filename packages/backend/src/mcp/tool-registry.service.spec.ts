import { Action, UserRole } from '@redinfo/shared';
import { ToolRegistryService } from './tool-registry.service';
import type { McpToolDefinition } from './mcp-tool.types';

const readTool: McpToolDefinition = {
  name: 'get_my_duties',
  title: 'Get my duties',
  description: '...',
  inputSchema: {},
  scope: 'redinfo:read',
  requiredActions: [],
  handler: async () => ({}),
};

const gatedWriteTool: McpToolDefinition = {
  name: 'publish_schedule',
  title: 'Publish a schedule',
  description: '...',
  inputSchema: {},
  scope: 'redinfo:write',
  requiredActions: [Action.MANAGE_SCHEDULES],
  handler: async () => ({}),
};

function makeRegistry(tools: McpToolDefinition[]) {
  return new ToolRegistryService(tools);
}

describe('ToolRegistryService.toolsFor', () => {
  it('includes a self-scoped tool for any authenticated role, as long as the scope is granted', () => {
    const registry = makeRegistry([readTool, gatedWriteTool]);

    const tools = registry.toolsFor([UserRole.EMERGENCY_OPERATIONAL], ['redinfo:read']);

    expect(tools.map((t) => t.name)).toEqual(['get_my_duties']);
  });

  it('hides a scope-gated tool the token was never granted, even if the role could use it', () => {
    const registry = makeRegistry([readTool, gatedWriteTool]);

    const tools = registry.toolsFor([UserRole.SYSTEM_ADMIN], ['redinfo:read']);

    expect(tools.map((t) => t.name)).toEqual(['get_my_duties']);
  });

  it('hides an action-gated tool from a role that lacks the action, even with the scope granted', () => {
    const registry = makeRegistry([readTool, gatedWriteTool]);

    const tools = registry.toolsFor([UserRole.EMERGENCY_OPERATIONAL], ['redinfo:read', 'redinfo:write']);

    expect(tools.map((t) => t.name)).toEqual(['get_my_duties']);
  });

  it('shows an action-gated tool once both the scope and the role permission line up', () => {
    const registry = makeRegistry([readTool, gatedWriteTool]);

    const tools = registry.toolsFor([UserRole.EMERGENCY_COORDINATOR], ['redinfo:read', 'redinfo:write']);

    expect(tools.map((t) => t.name).sort()).toEqual(['get_my_duties', 'publish_schedule']);
  });
});

import { Injectable, Logger } from '@nestjs/common';

/**
 * Same JSON shape as `auth/interceptors/audit.interceptor.ts`, extended with
 * the two fields an HTTP request doesn't have: which OAuth client is
 * calling, and which tool. One audit trail either way — a coordinator
 * reading logs shouldn't need to know whether a `MANAGE_SCHEDULES` action
 * came from the SPA or from an assistant acting on someone's behalf.
 */
@Injectable()
export class McpAuditService {
  private readonly logger = new Logger('McpAudit');

  logToolCall(params: { userId: string; roles: string[]; clientId: string; toolName: string }): void {
    this.logger.log(
      JSON.stringify({
        userId: params.userId,
        roles: params.roles,
        clientId: params.clientId,
        tool: params.toolName,
      }),
    );
  }
}

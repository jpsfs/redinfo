import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { OAuthProviderService } from '../oauth/oauth-provider.service';
import { sanitizeScopes } from '../oauth/oauth-scopes';
import { UsersService } from '../users/users.service';
import { McpServerFactory } from './mcp-server.factory';

/**
 * Mounts `POST/GET/DELETE /mcp`, the resource server side of this feature —
 * called once from `main.ts`, alongside `mcpAuthRouter` for the AS side.
 *
 * Raw Express rather than a Nest controller: `StreamableHTTPServerTransport`
 * needs the underlying `IncomingMessage`/`ServerResponse` to stream a
 * response over, which Nest's own response pipeline (interceptors,
 * `ValidationPipe`, the global `ApiErrorFilter`) is built to wrap a single
 * JSON body, not fight with.
 *
 * Stateless: a brand new `McpServer` and `StreamableHTTPServerTransport` are
 * built for every request (`sessionIdGenerator: undefined`) rather than kept
 * alive across a session — the tool list a token is entitled to can only be
 * known once its bearer token has been verified anyway, and statelessness is
 * what lets this run behind more than one backend replica with no sticky
 * routing.
 */
export function mountMcpServer(
  app: INestApplication,
  oauthProvider: OAuthProviderService,
  mcpPublicUrl: string,
): void {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(`${mcpPublicUrl}/mcp`));
  const usersService = app.get(UsersService);
  const serverFactory = app.get(McpServerFactory);

  app.use(
    '/mcp',
    requireBearerAuth({ verifier: oauthProvider, resourceMetadataUrl }),
    async (req: Request & { auth?: AuthInfo }, res: Response) => {
      const auth = req.auth!;
      const userId = auth.extra?.userId as string | undefined;
      const user = userId ? await usersService.findOne(userId).catch(() => null) : null;

      if (!user || !user.isActive) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'This account is inactive or no longer exists.',
        });
        return;
      }

      const server = serverFactory.build(user, sanitizeScopes(auth.scopes), auth.clientId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },
  );
}

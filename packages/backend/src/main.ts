import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';
import { OAuthProviderService } from './oauth/oauth-provider.service';
import { MCP_SCOPES } from './oauth/oauth-scopes';
import { mountMcpServer } from './mcp/mcp.mount';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // CORS (allow frontend origin)
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Adds `code`/`params` to the response body of the exceptions that carry
  // them (#180 phase 4) — every other exception's body is unchanged.
  app.useGlobalFilters(new ApiErrorFilter());

  // ── MCP: OAuth 2.1 Authorization Server + the `/mcp` resource server ───────
  //
  // Both live at the application root, alongside `/auth/*` — reached
  // directly by an external AI client or browser, never through the SPA's
  // own `/api`-prefixed `apiFetch` convention. The externally-reachable
  // origin for these is the same one the browser knows the app by:
  // `FRONTEND_URL` in production (nginx proxies these exact paths straight
  // through to this backend — see `nginx/nginx.conf`), and in local dev,
  // Vite's own proxy does the same for `http://localhost:5173` (see
  // `vite.config.ts`). `MCP_PUBLIC_URL` exists only as an override for the
  // unusual case of wanting this reachable somewhere other than where the
  // SPA is.
  const port = process.env.PORT ?? 3000;
  const mcpPublicUrl = (
    process.env.MCP_PUBLIC_URL ??
    process.env.FRONTEND_URL ??
    'http://localhost:5173'
  ).replace(/\/+$/, '');
  const oauthProvider = app.get(OAuthProviderService);
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(mcpPublicUrl),
      resourceServerUrl: new URL(`${mcpPublicUrl}/mcp`),
      resourceName: 'redinfo',
      scopesSupported: [...MCP_SCOPES],
    }),
  );
  mountMcpServer(app, oauthProvider, mcpPublicUrl);

  // OpenAPI / Swagger
  const config = new DocumentBuilder()
    .setTitle('RedInfo API')
    .setDescription('Information system for Red Cross branch')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`📄 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();

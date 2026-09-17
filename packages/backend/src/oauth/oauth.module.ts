import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdentityCipher } from '../common/identity-cipher';
import { RedinfoClientsStore } from './oauth-clients.store';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthConsentController } from './oauth-consent.controller';
import { OAuthGrantsController } from './oauth-grants.controller';
import { OAuthAdminClientsController } from './oauth-admin-clients.controller';

/**
 * The OAuth 2.1 Authorization Server — see the model-index comment on
 * `OAuthClient`/`OAuthAuthorizationCode`/`OAuthGrant` in `schema.prisma` and
 * `OAuthProviderService`'s doc comment for the shape of the whole flow.
 *
 * `main.ts` is what actually mounts the SDK's `mcpAuthRouter` (the
 * `/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/*` surface)
 * against `OAuthProviderService` — those are raw Express routes fixed by the
 * MCP SDK at the application root, not Nest controllers, so they aren't
 * declared here. This module supplies the provider they run against, plus
 * the three Nest-routed pieces either side of it: the consent hand-off
 * (`OAuthConsentController`), the "AI connections" self-service list
 * (`OAuthGrantsController`), and confidential-client provisioning
 * (`OAuthAdminClientsController`).
 *
 * `JwtModule` is registered here rather than imported from `AuthModule`
 * (which does not export it) — same `JWT_SECRET`, so a token either module
 * signs verifies against the other's copy, but each is free of the other's
 * unrelated wiring.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    RedinfoClientsStore,
    OAuthProviderService,
    { provide: IdentityCipher, useFactory: () => new IdentityCipher() },
  ],
  controllers: [OAuthConsentController, OAuthGrantsController, OAuthAdminClientsController],
  exports: [OAuthProviderService, JwtModule],
})
export class OAuthModule {}

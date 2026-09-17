import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@redinfo/shared';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher } from '../common/identity-cipher';
import { RedinfoClientsStore } from './oauth-clients.store';
import { OAuthProviderService } from './oauth-provider.service';

/**
 * The OAuth 2.1 Authorization Server (`src/oauth/`) against a real Postgres.
 *
 * Skipped unless DATABASE_URL is set — see `live-runs.integration.spec.ts`
 * for the shape this follows. What only a real database can answer, and is
 * therefore here: that a code really can only be redeemed once (the
 * consumed-at check races a real UPDATE, not a mock), that a revoked
 * grant's still-unexpired JWT is rejected the moment the row says so, and
 * that a sealed confidential-client secret round-trips through a real
 * `IdentityCipher` key.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@oauth.test`;

describeIntegration('OAuth Authorization Server (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const cipher = new IdentityCipher(`it-${RUN}:${Buffer.alloc(32, 7).toString('base64')}`);
  const clientsStore = new RedinfoClientsStore(prisma, cipher);
  const jwtService = new JwtService({ secret: `it-secret-${RUN}` });
  const config = { get: () => 'https://frontend.test' };
  const provider = new OAuthProviderService(prisma, clientsStore, jwtService, config as never);

  let user: { id: string };
  let publicClient: OAuthClientInformationFull;
  let confidentialClientRowId: string;

  const createdUserIds: string[] = [];
  const createdClientRowIds: string[] = [];

  beforeAll(async () => {
    user = await prisma.user.create({
      data: {
        email: email('crew'),
        firstName: 'Crew',
        lastName: 'Test',
        roles: [UserRole.EMERGENCY_OPERATIONAL],
        isActive: true,
      },
    });
    createdUserIds.push(user.id);

    const publicRow = await prisma.oAuthClient.create({
      data: {
        clientId: `public-${RUN}`,
        clientName: 'Test Assistant',
        redirectUris: ['https://assistant.test/callback'],
        isDynamic: true,
      },
    });
    createdClientRowIds.push(publicRow.id);
    publicClient = { client_id: publicRow.clientId, redirect_uris: publicRow.redirectUris };

    const confidentialRow = await prisma.oAuthClient.create({
      data: {
        clientId: `confidential-${RUN}`,
        clientName: 'Copilot Studio',
        redirectUris: ['https://copilotstudio.test/callback'],
        isDynamic: false,
      },
    });
    confidentialClientRowId = confidentialRow.id;
    createdClientRowIds.push(confidentialRow.id);
    await prisma.oAuthClient.update({
      where: { id: confidentialRow.id },
      data: { clientSecretSealed: cipher.seal('oauth-client-secret', confidentialRow.id, 'super-secret') },
    });
  });

  afterAll(async () => {
    await prisma.oAuthGrant.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.oAuthAuthorizationCode.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.oAuthClient.deleteMany({ where: { id: { in: createdClientRowIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('opens a confidential client secret through a real IdentityCipher key', async () => {
    const info = await clientsStore.getClient(`confidential-${RUN}`);
    expect(info?.client_secret).toBe('super-secret');
    expect(info?.token_endpoint_auth_method).toBe('client_secret_post');
    // AAD binds the blob to this exact row — opening under the wrong id must fail.
    expect(() => cipher.open('oauth-client-secret', 'a-different-row-id', cipher.seal('oauth-client-secret', confidentialClientRowId, 'x'))).toThrow();
  });

  it('registers a public client via DCR and immediately makes it resolvable', async () => {
    const registered = await clientsStore.registerClient({
      client_name: `DCR client ${RUN}`,
      redirect_uris: ['https://dcr.test/callback'],
      token_endpoint_auth_method: 'none',
      client_id: `dcr-${RUN}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as never);
    createdClientRowIds.push((await prisma.oAuthClient.findUniqueOrThrow({ where: { clientId: registered.client_id } })).id);

    const fetched = await clientsStore.getClient(registered.client_id);
    expect(fetched?.client_name).toBe(`DCR client ${RUN}`);
    expect(fetched?.client_secret).toBeUndefined();
  });

  it('runs the full authorize → consent → token → refresh → verify → revoke lifecycle', async () => {
    // 1. A code is only ever minted by `issueAuthorizationCode` — never by `authorize()` itself.
    const code = await provider.issueAuthorizationCode(user.id, {
      clientId: publicClient.client_id,
      clientName: 'Test Assistant',
      redirectUri: publicClient.redirect_uris[0],
      codeChallenge: 'the-challenge',
      scopes: ['redinfo:read', 'redinfo:write'],
      state: 'state-1',
    });

    // 2. The redirect_uri used at exchange must match the one authorized.
    await expect(
      provider.exchangeAuthorizationCode(publicClient, code, undefined, 'https://not-the-real-callback.test'),
    ).rejects.toBeInstanceOf(InvalidGrantError);

    // 3. A correct exchange succeeds and mints a grant + token pair.
    const tokens = await provider.exchangeAuthorizationCode(publicClient, code);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.access_token).toBeTruthy();

    // 4. The same code cannot be redeemed twice.
    await expect(provider.exchangeAuthorizationCode(publicClient, code)).rejects.toBeInstanceOf(InvalidGrantError);

    // 5. The freshly minted access token verifies, resolving back to this user.
    const authInfo = await provider.verifyAccessToken(tokens.access_token!);
    expect(authInfo.extra?.userId).toBe(user.id);
    expect(authInfo.scopes.sort()).toEqual(['redinfo:read', 'redinfo:write']);

    // 6. Refreshing narrows scope on request, and rotates the refresh token.
    const refreshed = await provider.exchangeRefreshToken(publicClient, tokens.refresh_token!, ['redinfo:read']);
    expect(refreshed.scope).toBe('redinfo:read');
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    // 7. The old refresh token is gone once rotated.
    await expect(provider.exchangeRefreshToken(publicClient, tokens.refresh_token!)).rejects.toBeInstanceOf(
      InvalidGrantError,
    );

    // 8. Revoking takes effect immediately — the original access token's JWT
    // signature is still valid, but the grant behind it is gone.
    await provider.revokeToken(publicClient, { token: refreshed.refresh_token! });
    await expect(provider.verifyAccessToken(tokens.access_token!)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

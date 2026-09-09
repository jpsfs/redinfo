import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { OAuthProviderService } from './oauth-provider.service';
import { MCP_TOKEN_AUDIENCE, MCP_TOKEN_TYPE } from './mcp-token.constants';

const client = { client_id: 'client-1', redirect_uris: ['https://assistant.example/callback'] };

function makePrisma() {
  return {
    oAuthAuthorizationCode: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    oAuthGrant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
}

function makeService() {
  const prisma = makePrisma();
  const clientsStore = {} as never;
  const jwtService = {
    sign: jest.fn((payload: Record<string, unknown>) => JSON.stringify(payload)),
    verifyAsync: jest.fn(async (token: string) => JSON.parse(token)),
  };
  const config = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  const service = new OAuthProviderService(prisma as never, clientsStore, jwtService as never, config as never);
  return { service, prisma, jwtService };
}

describe('OAuthProviderService', () => {
  describe('authorize', () => {
    it('redirects to the SPA consent route with a signed ticket, never straight to the client', async () => {
      const { service } = makeService();
      const res = { redirect: jest.fn() };

      await service.authorize(
        client as never,
        { redirectUri: client.redirect_uris[0], codeChallenge: 'chal', scopes: ['redinfo:read'], state: 's1' },
        res as never,
      );

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const location = res.redirect.mock.calls[0][0] as string;
      expect(location).toContain('http://localhost:5173/#/oauth/consent?ticket=');
      expect(location).not.toContain(client.redirect_uris[0]);
    });

    it('drops any requested scope this server does not offer', async () => {
      const { service, jwtService } = makeService();
      const res = { redirect: jest.fn() };

      await service.authorize(
        client as never,
        { redirectUri: client.redirect_uris[0], codeChallenge: 'chal', scopes: ['redinfo:read', 'admin:god-mode'] },
        res as never,
      );

      const [ticketPayload] = jwtService.sign.mock.calls[0];
      expect(ticketPayload.scopes).toEqual(['redinfo:read']);
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('rejects a code issued to a different client', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'code-1',
        clientId: 'someone-else',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.exchangeAuthorizationCode(client as never, 'the-code')).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('rejects an already-consumed code', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'code-1',
        clientId: client.client_id,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.exchangeAuthorizationCode(client as never, 'the-code')).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('rejects an expired code', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'code-1',
        clientId: client.client_id,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.exchangeAuthorizationCode(client as never, 'the-code')).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('marks the code consumed and issues a grant + token pair on success', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'code-1',
        clientId: client.client_id,
        userId: 'user-1',
        redirectUri: client.redirect_uris[0],
        codeChallenge: 'chal',
        scopes: ['redinfo:read'],
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.oAuthGrant.create.mockResolvedValue({ id: 'grant-1' });

      const tokens = await service.exchangeAuthorizationCode(client as never, 'the-code');

      expect(prisma.oAuthAuthorizationCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.oAuthGrant.create).toHaveBeenCalled();
      expect(tokens.token_type).toBe('bearer');
      expect(tokens.refresh_token).toBeTruthy();
      expect(tokens.access_token).toBeTruthy();
    });
  });

  describe('exchangeRefreshToken', () => {
    it('rejects a revoked grant', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthGrant.findUnique.mockResolvedValue({
        id: 'grant-1',
        clientId: client.client_id,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        scopes: ['redinfo:read'],
      });

      await expect(service.exchangeRefreshToken(client as never, 'rt')).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('only ever narrows scope, never widens it', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthGrant.findUnique.mockResolvedValue({
        id: 'grant-1',
        clientId: client.client_id,
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        scopes: ['redinfo:read'],
      });
      prisma.oAuthGrant.update.mockResolvedValue(undefined);

      const tokens = await service.exchangeRefreshToken(client as never, 'rt', ['redinfo:read', 'redinfo:write']);

      // Asked for write too, but the grant only ever held read.
      expect(tokens.scope).toBe('redinfo:read');
    });
  });

  describe('verifyAccessToken', () => {
    it('rejects a token that is not typ:mcp, even if the audience matches', async () => {
      const { service } = makeService();
      const token = JSON.stringify({ typ: 'something-else', aud: MCP_TOKEN_AUDIENCE, gid: 'g1', sub: 'u1' });

      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('rejects a token whose grant has been revoked', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthGrant.findUnique.mockResolvedValue({ id: 'g1', userId: 'u1', revokedAt: new Date() });
      const token = JSON.stringify({ typ: MCP_TOKEN_TYPE, gid: 'g1', sub: 'u1', cid: 'c1', scope: 'redinfo:read', exp: 999 });

      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('returns AuthInfo carrying the user id for a live, unrevoked grant', async () => {
      const { service, prisma } = makeService();
      prisma.oAuthGrant.findUnique.mockResolvedValue({ id: 'g1', userId: 'u1', revokedAt: null });
      const token = JSON.stringify({
        typ: MCP_TOKEN_TYPE,
        gid: 'g1',
        sub: 'u1',
        cid: 'c1',
        scope: 'redinfo:read redinfo:write',
        exp: 999,
      });

      const info = await service.verifyAccessToken(token);

      expect(info.clientId).toBe('c1');
      expect(info.scopes).toEqual(['redinfo:read', 'redinfo:write']);
      expect(info.extra).toEqual({ userId: 'u1', grantId: 'g1' });
    });
  });

  describe('revokeToken', () => {
    it('revokes only the matching, still-active grant for that client', async () => {
      const { service, prisma } = makeService();

      await service.revokeToken(client as never, { token: 'rt-1' });

      expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({
        where: { refreshToken: 'rt-1', clientId: client.client_id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});

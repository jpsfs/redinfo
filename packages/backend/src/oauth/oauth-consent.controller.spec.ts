import { BadRequestException } from '@nestjs/common';
import { OAuthConsentController } from './oauth-consent.controller';

const ticketPayload = {
  clientId: 'client-1',
  clientName: 'Claude',
  redirectUri: 'https://claude.ai/callback',
  codeChallenge: 'chal',
  scopes: ['redinfo:read'],
  state: 'xyz',
};

function makeController() {
  const oauthProvider = { issueAuthorizationCode: jest.fn().mockResolvedValue('the-code') };
  const jwtService = { verify: jest.fn().mockReturnValue(ticketPayload) };
  const controller = new OAuthConsentController(oauthProvider as never, jwtService as never);
  return { controller, oauthProvider, jwtService };
}

describe('OAuthConsentController', () => {
  it('describe() surfaces only the client name and scopes, never the redirect URI or PKCE challenge', async () => {
    const { controller } = makeController();

    const result = await controller.describe('the-ticket');

    expect(result).toEqual({ clientName: 'Claude', scopes: ['redinfo:read'] });
  });

  it('describe() rejects an expired or tampered ticket with a friendly message, not a raw JWT error', async () => {
    const { controller, jwtService } = makeController();
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(controller.describe('stale')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decide("allow") mints a code and redirects to the real client, carrying state through', async () => {
    const { controller, oauthProvider } = makeController();

    const result = await controller.decide({ ticket: 'the-ticket', decision: 'allow' }, { id: 'user-1' });

    expect(oauthProvider.issueAuthorizationCode).toHaveBeenCalledWith('user-1', ticketPayload);
    expect(result.redirectUrl).toBe('https://claude.ai/callback?code=the-code&state=xyz');
  });

  it('decide("deny") never mints a code, and redirects with error=access_denied', async () => {
    const { controller, oauthProvider } = makeController();

    const result = await controller.decide({ ticket: 'the-ticket', decision: 'deny' }, { id: 'user-1' });

    expect(oauthProvider.issueAuthorizationCode).not.toHaveBeenCalled();
    expect(result.redirectUrl).toBe('https://claude.ai/callback?error=access_denied&state=xyz');
  });
});

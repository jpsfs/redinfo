import { ExecutionContext } from '@nestjs/common';
import { MicrosoftAuthGuard } from './microsoft-oauth.guard';

function makeContext(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

// Same behaviour as GoogleAuthGuard — see its spec for the full reasoning.
describe('MicrosoftAuthGuard.handleRequest', () => {
  it('passes a matched user through', () => {
    const guard = new MicrosoftAuthGuard();
    const req: any = {};

    const result = guard.handleRequest(null, { id: 'u-1' }, undefined, makeContext(req));

    expect(result).toEqual({ id: 'u-1' });
    expect(req.oauthError).toBeUndefined();
  });

  it('stashes a strategy error on the request instead of throwing', () => {
    const guard = new MicrosoftAuthGuard();
    const req: any = {};
    const err = new Error('invalid_grant');

    const result = guard.handleRequest(err, undefined, undefined, makeContext(req));

    expect(result).toBeUndefined();
    expect(req.oauthError).toBe(err);
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { MCP_TOKEN_AUDIENCE, MCP_TOKEN_TYPE } from '../../oauth/mcp-token.constants';

// See `mcp-token.constants.ts`: this is an additive rejection (only tokens
// carrying the MCP marker are refused), never a required portal audience —
// that's what keeps every already-issued portal token valid across this
// change, so most of this file is "a plain portal payload still works".

const person = { id: 'u-1', isActive: true };

function makeStrategy() {
  const usersService = { findOne: jest.fn().mockResolvedValue(person) };
  const config = { get: jest.fn().mockReturnValue('test-secret') };
  const strategy = new JwtStrategy(config as never, usersService as never);
  return { strategy, usersService };
}

describe('JwtStrategy.validate', () => {
  it('accepts an ordinary portal payload, with no aud/typ claim at all', async () => {
    const { strategy, usersService } = makeStrategy();

    const result = await strategy.validate({ sub: 'u-1', email: 'a@b.test', roles: ['EMERGENCY_OPERATIONAL'] });

    expect(result).toBe(person);
    expect(usersService.findOne).toHaveBeenCalledWith('u-1');
  });

  it('rejects a payload carrying the MCP audience', async () => {
    const { strategy, usersService } = makeStrategy();

    await expect(
      strategy.validate({ sub: 'u-1', email: 'a@b.test', roles: [], aud: MCP_TOKEN_AUDIENCE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('rejects a payload carrying the MCP token type, even without the audience claim', async () => {
    const { strategy, usersService } = makeStrategy();

    await expect(
      strategy.validate({ sub: 'u-1', email: 'a@b.test', roles: [], typ: MCP_TOKEN_TYPE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('rejects an inactive account', async () => {
    const { strategy, usersService } = makeStrategy();
    usersService.findOne.mockResolvedValue({ id: 'u-1', isActive: false });

    await expect(
      strategy.validate({ sub: 'u-1', email: 'a@b.test', roles: [] }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

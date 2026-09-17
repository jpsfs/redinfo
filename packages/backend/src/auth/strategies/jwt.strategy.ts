import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { MCP_TOKEN_AUDIENCE, MCP_TOKEN_TYPE } from '../../oauth/mcp-token.constants';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  /** Set only on an MCP access token — see `mcp-token.constants.ts`. */
  aud?: string;
  typ?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    // An MCP access token is signed with this same JWT_SECRET (see
    // `oauth-provider.service.ts`) but must never authenticate the REST API
    // it was never issued for — see `mcp-token.constants.ts` for why this is
    // a rejection of a marked token rather than a required portal audience.
    if (payload.aud === MCP_TOKEN_AUDIENCE || payload.typ === MCP_TOKEN_TYPE) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }
}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { AuthProvider } from '@prisma/client';

// passport-microsoft does not ship types; use require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MicrosoftStrategy = require('passport-microsoft').Strategy;

@Injectable()
export class MicrosoftOAuthStrategy extends PassportStrategy(MicrosoftStrategy, 'microsoft') {
  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      clientID: config.get<string>('MICROSOFT_CLIENT_ID')!,
      clientSecret: config.get<string>('MICROSOFT_CLIENT_SECRET')!,
      callbackURL: config.get<string>('MICROSOFT_CALLBACK_URL')!,
      tenant: config.get<string>('MICROSOFT_TENANT_ID') ?? 'common',
      scope: ['user.read'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Record<string, any>,
    done: (err: any, user?: any) => void,
  ) {
    const email: string =
      profile.emails?.[0]?.value ??
      profile._json?.mail ??
      profile._json?.userPrincipalName ??
      '';

    const user = await this.usersService.findOrCreateOAuthUser({
      email,
      firstName: profile.name?.givenName ?? profile.displayName ?? '',
      lastName: profile.name?.familyName ?? '',
      provider: AuthProvider.MICROSOFT,
      providerId: profile.id,
    });

    done(null, user);
  }
}

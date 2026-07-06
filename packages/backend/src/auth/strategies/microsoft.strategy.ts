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
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    const clientID = config.get<string>('MICROSOFT_CLIENT_ID');
    const clientSecret = config.get<string>('MICROSOFT_CLIENT_SECRET');
    const callbackURL = config.get<string>('MICROSOFT_CALLBACK_URL');
    const tenant = config.get<string>('MICROSOFT_TENANT_ID') ?? 'common';
    const enabled = Boolean(clientID && clientSecret && callbackURL);

    if (!enabled) {
      console.warn(
        '[Auth] Microsoft OAuth disabled: missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_CALLBACK_URL.',
      );
    }

    super({
      clientID: clientID ?? 'microsoft-disabled',
      clientSecret: clientSecret ?? 'microsoft-disabled',
      callbackURL: callbackURL ?? 'http://localhost:3000/auth/microsoft/callback',
      tenant,
      scope: ['user.read'],
    });

    this.enabled = enabled;
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Record<string, any>,
    done: (err: any, user?: any) => void,
  ) {
    if (!this.enabled) {
      return done(null, false);
    }

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

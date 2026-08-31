import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { AuthProvider } from '@prisma/client';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private usersService: UsersService,
  ) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL');
    const enabled = Boolean(clientID && clientSecret && callbackURL);

    if (!enabled) {
      console.warn(
        '[Auth] Google OAuth disabled: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL.',
      );
    }

    super({
      clientID: clientID ?? 'google-disabled',
      clientSecret: clientSecret ?? 'google-disabled',
      callbackURL: callbackURL ?? 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });

    this.enabled = enabled;
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    if (!this.enabled) {
      return done(null, false);
    }

    const { id, name, emails } = profile;
    const email = emails?.[0]?.value ?? '';

    const user = await this.usersService.findOrLinkOAuthUser({
      email,
      firstName: name?.givenName ?? '',
      lastName: name?.familyName ?? '',
      provider: AuthProvider.GOOGLE,
      providerId: id,
    });

    // No matching admin-provisioned account (or it's tied to a different
    // provider) — `false` fails the auth without throwing, so the guard can
    // redirect the browser back to the login page instead of a raw error.
    done(null, user ?? false);
  }
}

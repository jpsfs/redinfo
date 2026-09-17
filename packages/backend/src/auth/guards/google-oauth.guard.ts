import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Carries the "keep me signed in" checkbox across the Google redirect
 * round-trip via OAuth's `state` param, since the frontend only ever gets to
 * make one request here — a plain `<a href>` to `/auth/google?remember=...`.
 *
 * Neither strategy is configured with `state: true` (see `GoogleStrategy`),
 * so passport-oauth2 doesn't own a state store to fight with: a literal
 * string passed here is sent to Google as-is and echoed back unmodified on
 * `google/callback` as `req.query.state`. It's just a UI preference riding
 * along, not a CSRF nonce, so no verification is needed either way.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return { state: req.query?.remember === 'true' ? 'true' : 'false' };
  }

  /**
   * Nothing here may throw: this runs mid-redirect, and the default
   * `handleRequest` throwing would surface as a raw 500/401 page to a
   * browser that just came back from Google, instead of the login screen.
   *
   * Two failure shapes reach this, both left as `req.user` unset so
   * `googleCallback` can redirect to the frontend with an error to show:
   *  - No matching admin-provisioned account (`GoogleStrategy` calls
   *    `done(null, false)`) — `err` is unset here, `user` is falsy.
   *  - A token-exchange error from passport-oauth2 (`err` set) — most
   *    commonly a mobile browser replaying the callback URL (backgrounded
   *    tab restored, page reloaded) after the authorization code was
   *    already redeemed by the first, successful hit. Stashing it on the
   *    request lets the controller tell the two apart for the message it
   *    shows, and logging it here is the only place this ever surfaces —
   *    swallowing it silently would make a real misconfiguration invisible.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err) {
      this.logger.warn(
        `Google OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      context.switchToHttp().getRequest().oauthError = err;
      return undefined as TUser;
    }
    return (user || undefined) as TUser;
  }
}

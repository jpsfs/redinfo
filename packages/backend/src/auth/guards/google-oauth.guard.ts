import { ExecutionContext, Injectable } from '@nestjs/common';
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
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return { state: req.query?.remember === 'true' ? 'true' : 'false' };
  }

  /**
   * A failed OAuth attempt (no matching admin-provisioned account — see
   * `GoogleStrategy`/`findOrLinkOAuthUser`) must not throw here: this runs
   * mid-redirect, and the default `handleRequest` throwing `Unauthorized`
   * would surface as a raw 401 JSON page to a browser that just came back
   * from Google. Instead, leave `req.user` unset and let `googleCallback`
   * redirect to the frontend with an error to show instead.
   */
  handleRequest<TUser = unknown>(err: unknown, user: unknown): TUser {
    if (err) throw err;
    return (user || undefined) as TUser;
  }
}

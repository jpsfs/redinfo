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
}

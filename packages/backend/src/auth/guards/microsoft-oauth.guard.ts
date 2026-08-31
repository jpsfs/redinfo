import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same "keep me signed in" state passthrough as `GoogleAuthGuard` — see its
 * doc comment.
 */
@Injectable()
export class MicrosoftAuthGuard extends AuthGuard('microsoft') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return { state: req.query?.remember === 'true' ? 'true' : 'false' };
  }

  /** See `GoogleAuthGuard.handleRequest` — same "don't throw mid-redirect" reasoning. */
  handleRequest<TUser = unknown>(err: unknown, user: unknown): TUser {
    if (err) throw err;
    return (user || undefined) as TUser;
  }
}

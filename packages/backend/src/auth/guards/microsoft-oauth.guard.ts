import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same "keep me signed in" state passthrough as `GoogleAuthGuard` — see its
 * doc comment.
 */
@Injectable()
export class MicrosoftAuthGuard extends AuthGuard('microsoft') {
  private readonly logger = new Logger(MicrosoftAuthGuard.name);

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return { state: req.query?.remember === 'true' ? 'true' : 'false' };
  }

  /** See `GoogleAuthGuard.handleRequest` — same "don't throw mid-redirect" reasoning. */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err) {
      this.logger.warn(
        `Microsoft OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      context.switchToHttp().getRequest().oauthError = err;
      return undefined as TUser;
    }
    return (user || undefined) as TUser;
  }
}

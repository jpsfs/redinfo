import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Guards `/internal/inem/login-jobs*` (#214). The caller is
 * `packages/inem-worker` (#215), a machine with no user — so this checks a
 * shared-secret bearer token (`INEM_WORKER_TOKEN`) instead of
 * `JwtAuthGuard`/`RolesGuard`.
 */
@Injectable()
export class InemWorkerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INEM_WORKER_TOKEN;
    // No token configured means the internal endpoints are unreachable
    // rather than open — the same fail-soft-but-never-open posture as the
    // rest of this feature with no INEM credentials.
    if (!expected) return false;

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers['authorization'] ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

    return timingSafeEqualStrings(provided, expected);
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Different lengths can't be compared by timingSafeEqual, but this branch
  // itself doesn't need to be constant-time: the token isn't length-secret,
  // and the interesting oracle (byte-by-byte guessing) only exists once the
  // lengths already match.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

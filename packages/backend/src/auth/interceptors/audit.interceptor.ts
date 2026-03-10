import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { ACTIONS_KEY, ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    const actions = this.reflector.getAllAndOverride<string[]>(ACTIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!actions && !roles) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            userId: user?.id,
            role: user?.role,
            method: req.method,
            path: req.path,
            requiredActions: actions ?? [],
            requiredRoles: roles ?? [],
          }),
        );
      }),
    );
  }
}

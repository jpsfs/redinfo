import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorCode } from '@redinfo/shared';

/**
 * Adds `code`/`params` to the JSON body of the handful of exceptions that
 * carry them (see `api-error.exception.ts`) — everything else passes through
 * with Nest's ordinary `{ message, error, statusCode }` body, unchanged.
 *
 * Registered globally in `main.ts`. `@Catch(HttpException)` rather than no
 * argument at all: this only ever needs to touch HTTP exceptions, and
 * catching everything would mean re-implementing Nest's own handling for
 * things this was never meant to see (a database error, a programming bug).
 */
@Catch(HttpException)
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const base = typeof body === 'string' ? { message: body } : body;

    const coded = exception as HttpException & {
      code?: ApiErrorCode;
      params?: Record<string, string | number>;
    };

    response.status(status).json({
      ...base,
      statusCode: status,
      ...(coded.code ? { code: coded.code, params: coded.params } : {}),
    });
  }
}

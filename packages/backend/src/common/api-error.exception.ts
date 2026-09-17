import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiErrorCode } from '@redinfo/shared';

/**
 * The shape #180 phase 4 adds to a subset of `HttpException`s: a machine
 * `code` and optional interpolation `params`, alongside the ordinary English
 * `message`. `ApiErrorFilter` reads these two extra properties off any
 * exception that has them — that is the entire contract, so a plain
 * `NotFoundException` (which does not) keeps behaving exactly as before.
 *
 * Three subclasses rather than one parametrised class: each mirrors a
 * `@nestjs/common` exception whose HTTP status is already the right one for
 * the case, so a call site reads the same way it did before this existed.
 */
interface CodedError {
  readonly code: ApiErrorCode;
  readonly params?: Record<string, string | number>;
}

export class ApiConflictException extends ConflictException implements CodedError {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(message);
  }
}

export class ApiBadRequestException extends BadRequestException implements CodedError {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(message);
  }
}

export class ApiForbiddenException extends ForbiddenException implements CodedError {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(message);
  }
}

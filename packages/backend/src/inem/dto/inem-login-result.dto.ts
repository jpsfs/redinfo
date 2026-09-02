import { INEMLoginJobResult } from '@redinfo/shared';
import { IsBoolean, IsDefined, IsIn, IsISO8601, IsString, ValidateIf } from 'class-validator';

const FAILURE_REASONS = ['captcha_challenge', 'otp_timeout', 'owa_session_expired', 'unknown_error'] as const;

/**
 * `POST /internal/inem/login-jobs/:id/result` body — the worker's half of
 * the `INEMLoginJob`/`INEMLoginJobResult` contract in shared. The caller is
 * `packages/inem-worker` (#215), a trusted machine behind `InemWorkerGuard`,
 * not end-user input — so `cookies`/`refreshedStorageState` are accepted as
 * opaque blobs and passed straight to `IdentityCipher` rather than validated
 * field by field; their shape is the worker contract's to own.
 */
export class InemLoginResultDto {
  @IsBoolean()
  ok: boolean;

  @ValidateIf((dto: InemLoginResultDto) => dto.ok === true)
  @IsDefined()
  cookies?: unknown;

  @ValidateIf((dto: InemLoginResultDto) => dto.ok === true)
  @IsISO8601()
  expiresAt?: string;

  @ValidateIf((dto: InemLoginResultDto) => dto.ok === true)
  @IsDefined()
  refreshedStorageState?: unknown;

  @ValidateIf((dto: InemLoginResultDto) => dto.ok === false)
  @IsIn(FAILURE_REASONS)
  reason?: (typeof FAILURE_REASONS)[number];

  @ValidateIf((dto: InemLoginResultDto) => dto.ok === false)
  @IsString()
  message?: string;

  toResult(): INEMLoginJobResult {
    return this.ok
      ? {
          ok: true,
          cookies: this.cookies,
          expiresAt: this.expiresAt as string,
          refreshedStorageState: this.refreshedStorageState,
        }
      : { ok: false, reason: this.reason as (typeof FAILURE_REASONS)[number], message: this.message ?? '' };
  }
}

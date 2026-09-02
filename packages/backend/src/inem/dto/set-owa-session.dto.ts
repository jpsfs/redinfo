import { IsDefined } from 'class-validator';

/**
 * `POST /internal/inem/owa-session` body — the bootstrap script's (#215) one
 * write. `storageState` is accepted as an opaque blob and passed straight to
 * `IdentityCipher`, same reasoning as `InemLoginResultDto`: its shape is
 * Playwright's `context.storageState()` output, not something this DTO needs
 * to understand field by field.
 */
export class SetOwaSessionDto {
  @IsDefined()
  storageState: unknown;
}

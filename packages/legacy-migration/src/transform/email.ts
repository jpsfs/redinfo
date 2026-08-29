/**
 * `User.email` is `@unique` and NOT NULL; legacy `socorrista.email` is free
 * text that may be blank, malformed, or — since nothing in legacy enforced
 * uniqueness — shared by two different people. All three failure shapes get
 * the same answer: a synthetic `v-<legacyId>@import.invalid` address, never a
 * dropped row. Losing a volunteer from the import because their email column
 * was empty is a worse outcome than giving them an address a coordinator can
 * fix later; the report lists every placeholder so that fix actually happens.
 *
 * Dedup strategy, pinned by the spec: the **first** legacy row to claim a
 * normalised address keeps it; every later row that would collide falls back
 * to its own placeholder instead of erroring the whole run or silently
 * overwriting the first claim with a suffixed variant that looks like a real
 * address for someone else.
 */
import { PLACEHOLDER_EMAIL_DOMAIN } from '../mapping.config';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmailShape(email: string): boolean {
  return EMAIL_SHAPE.test(email);
}

export function placeholderEmail(legacyId: string): string {
  return `v-${legacyId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export type EmailSource = 'legacy' | 'placeholder';

export interface EmailResolution {
  email: string;
  source: EmailSource;
  /** Set exactly when `source === 'placeholder'` — why the legacy value was not used. */
  reason?: 'BLANK' | 'INVALID_SHAPE' | 'DUPLICATE';
}

/**
 * Resolves one row's email against the run's running set of already-claimed
 * addresses. `seenEmails` is owned by the caller and mutated here on a
 * successful claim — the same pattern `upsert-engine.ts` uses for its dry-run
 * shadow map, so one loader pass needs exactly one `Set`, threaded through in
 * legacy-id order.
 */
export function resolveEmail(
  legacyId: string,
  rawEmail: string | null | undefined,
  seenEmails: Set<string>,
): EmailResolution {
  const normalised = normaliseEmail(rawEmail);

  if (!normalised) {
    return { email: placeholderEmail(legacyId), source: 'placeholder', reason: 'BLANK' };
  }
  if (!isValidEmailShape(normalised)) {
    return { email: placeholderEmail(legacyId), source: 'placeholder', reason: 'INVALID_SHAPE' };
  }
  if (seenEmails.has(normalised)) {
    return { email: placeholderEmail(legacyId), source: 'placeholder', reason: 'DUPLICATE' };
  }

  seenEmails.add(normalised);
  return { email: normalised, source: 'legacy' };
}

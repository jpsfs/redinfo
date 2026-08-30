/**
 * `saidas.descricao` (plaintext `longtext`) → `EventReport.operationalReport`
 * (NOT NULL sanitised HTML).
 *
 * Four steps, in order:
 * 1. HTML-escape the plaintext, split on newlines, wrap each non-empty line
 *    in `<p>`. Skipping the escape would corrupt any narrative containing
 *    `<` or `&` — a crew's free text is exactly the kind of input that has
 *    both.
 * 2. Prepend the `tipo_ocorrencia` label as a bolded first paragraph.
 * 3. Append a "campos não migrados" list for whatever the caller says has no
 *    target field. Deliberately generic — this module takes the note strings
 *    as input rather than deciding what belongs in them. **`saidas.contacto`
 *    (a phone number) is never one of them** — Q7 (resolved): a phone number
 *    is dropped entirely, never written into `operationalReport` or any other
 *    field. Loader 12 does not read `saidas.contacto` for any purpose.
 * 4. Run the whole thing through `sanitizeReportHtml` — the same function the
 *    API uses on every write, so imported markup is trusted exactly as much
 *    as markup a crew typed today — then truncate on a tag boundary at
 *    `MAX_OPERATIONAL_REPORT_LENGTH`, leaving room for a visible truncation
 *    marker rather than silently dropping the tail.
 */
import { MAX_OPERATIONAL_REPORT_LENGTH } from '@redinfo/shared';
import { sanitizeReportHtml } from '../../../backend/src/event-reports/sanitize-report';

const TRUNCATION_MARKER = '<p><em>[truncado na importação]</em></p>';

export interface NarrativeInput {
  /** `saidas.descricao`. */
  descricao: string;
  /** `tipo_ocorrencia` resolved to a label — see `transform/enums.ts::mapOcorrenciaLabel`. */
  ocorrenciaLabel: string | null;
  /**
   * Facts from columns with no target field, already formatted as the caller
   * wants them shown (e.g. `"idade_AM: Meses"`, `"apoio_inem código não mapeado: heli"`).
   * Empty when there is nothing to note.
   */
  droppedNotes: string[];
}

export interface NarrativeResult {
  html: string;
  truncated: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes first (so no line-splitting risk from an injected literal `\n` in an entity), then wraps. */
function plaintextToParagraphs(text: string): string {
  return escapeHtml(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${line}</p>`)
    .join('');
}

function droppedFieldsBlock(notes: string[]): string {
  if (notes.length === 0) return '';
  const items = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
  return `<p><strong>Campos não migrados:</strong></p><ul>${items}</ul>`;
}

/** Cuts at the last complete tag boundary at or before `maxLength` — never mid-`<tag>`. */
function truncateOnTagBoundary(html: string, maxLength: number): string {
  if (html.length <= maxLength) return html;
  const slice = html.slice(0, maxLength);
  const lastTagEnd = slice.lastIndexOf('>');
  return lastTagEnd === -1 ? '' : slice.slice(0, lastTagEnd + 1);
}

export function buildNarrative(input: NarrativeInput): NarrativeResult {
  const parts: string[] = [];
  if (input.ocorrenciaLabel) {
    parts.push(`<p><strong>Tipo de ocorrência:</strong> ${escapeHtml(input.ocorrenciaLabel)}</p>`);
  }
  parts.push(plaintextToParagraphs(input.descricao));
  parts.push(droppedFieldsBlock(input.droppedNotes));

  const sanitized = sanitizeReportHtml(parts.join(''));
  if (sanitized.length <= MAX_OPERATIONAL_REPORT_LENGTH) {
    return { html: sanitized, truncated: false };
  }

  const budget = MAX_OPERATIONAL_REPORT_LENGTH - TRUNCATION_MARKER.length;
  const cut = truncateOnTagBoundary(sanitized, budget);
  // Re-run through the sanitizer: the cut can leave an unclosed block (e.g. a
  // `<ul>` with some `<li>`s dropped), and sanitize-html closes it back up —
  // this is what keeps the truncated output valid HTML rather than merely
  // valid-looking text.
  return { html: sanitizeReportHtml(cut + TRUNCATION_MARKER), truncated: true };
}

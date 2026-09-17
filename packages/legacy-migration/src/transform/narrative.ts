/**
 * `saidas.descricao` → `EventReport.operationalReport` (NOT NULL sanitised
 * HTML).
 *
 * `descricao` is declared `longtext`, but it is **not plaintext**: the legacy
 * app wrote it from a rich-text control, and the real dump confirms it — of
 * 1,835 rows, 1,814 (~99%) already contain HTML tags (`<p>`, entities like
 * `&eacute;`/`&nbsp;`, etc.); the rest are blank. Treating it as plaintext
 * (escaping `<`/`&` and re-wrapping each line in `<p>`) was tried once and
 * was wrong — it turned every already-formatted report into visibly escaped
 * tag soup (`&lt;p&gt;...`) instead of preserving the formatting a crew
 * member actually typed. The new platform has the same shape of field
 * (`RichTextEditor`/`RichTextViewer`, sanitised HTML, no markdown — see
 * `sanitize-report.ts`), so the correct move is to carry the legacy HTML
 * through as HTML, not re-derive it from scratch.
 *
 * Three steps, in order:
 * 1. Prepend the `tipo_ocorrencia` label as a bolded first paragraph (this
 *    one *is* plain text from a controlled lookup, so it is escaped).
 * 2. Pass `descricao` through untouched (as HTML) and append a "campos não
 *    migrados" list for whatever the caller says has no target field — also
 *    genuinely plain text, also escaped. Deliberately generic: this module
 *    takes the note strings as input rather than deciding what belongs in
 *    them. **`saidas.contacto` (a phone number) is never one of them** — Q7
 *    (resolved): a phone number is dropped entirely, never written into
 *    `operationalReport` or any other field. Loader 12 does not read
 *    `saidas.contacto` for any purpose.
 * 3. Run the whole thing through `sanitizeReportHtml` — the same function the
 *    API uses on every write, so imported markup is trusted exactly as much
 *    as markup a crew typed today. It also does the real work of downgrading
 *    legacy markup outside the new editor's tag set (tables, spans, fonts,
 *    images, inline styles) to plain text rather than dropping it silently,
 *    and decodes the legacy entities along the way. Then truncate on a tag
 *    boundary at `MAX_OPERATIONAL_REPORT_LENGTH`, leaving room for a visible
 *    truncation marker rather than silently dropping the tail.
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
  // `descricao` is already HTML from the legacy rich-text control (confirmed
  // against the dump — see the module doc comment) — passed through as-is
  // and left to `sanitizeReportHtml` below to downgrade to the new editor's
  // tag set, not re-escaped as if it were plain text typed just now.
  parts.push(input.descricao);
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

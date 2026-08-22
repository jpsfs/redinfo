// `sanitize-html` is pinned to an exact version on purpose: from 2.14 it pulls
// an ESM-only htmlparser2, which a CommonJS Nest build cannot require and Jest
// refuses to transform. Widen the range only after checking both still work.
import sanitizeHtml from 'sanitize-html';

/**
 * The tags the operational report may contain: exactly what the editor's
 * StarterKit can produce, including the marks its keyboard shortcuts and input
 * rules reach (`# ` for a heading, `> ` for a quote, ``` for code) even though
 * the toolbar only offers bold, italic and lists.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'hr',
];

/**
 * Server-side sanitization of a rich-text report.
 *
 * A report is written by one person and later read by coordinators, so stored
 * markup is untrusted input however it arrived: `ValidationPipe` checks that
 * `operationalReport` is a string of a sane length, and nothing more — it has
 * no opinion about what is inside it.
 *
 * Attributes are dropped wholesale rather than filtered. Nothing StarterKit
 * emits needs one (bar an ordered list's start), and an empty attribute
 * allowlist removes the whole class of `on*`, `href`, `src` and `style`
 * payloads rather than trying to out-guess them one at a time.
 */
export function sanitizeReportHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // `start` keeps a list that begins at 3 numbered from 3; it cannot carry script.
    allowedAttributes: { ol: ['start'] },
    // Drop the content of anything disallowed too, so a stripped <script>
    // cannot leave its body behind as visible text.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  });
}

import { sanitizeReportHtml } from './sanitize-report';

// ── The operational report is untrusted markup (ADO #162) ─────────────────────
//
// It is written by one person and later read by coordinators, so it is stored
// XSS surface: `ValidationPipe` only checks it is a string of a sane length and
// has no opinion about what is inside it. Attributes are dropped wholesale, so
// these cases are about the class of payload, not an exhaustive blocklist.

describe('sanitizeReportHtml', () => {
  it('keeps the formatting the editor actually produces', () => {
    const html =
      '<p>Patient found <strong>conscious</strong> and <em>breathing</em>.</p>' +
      '<ul><li>Airway clear</li></ul><ol><li>Immobilised</li></ol>' +
      '<h2>Handover</h2><blockquote>Stable on arrival</blockquote>';
    expect(sanitizeReportHtml(html)).toBe(html);
  });

  it('strips a script tag and its body, leaving no visible residue', () => {
    const clean = sanitizeReportHtml('<p>Before</p><script>alert(1)</script><p>After</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('alert(1)');
    expect(clean).toBe('<p>Before</p><p>After</p>');
  });

  it('drops event-handler attributes', () => {
    const clean = sanitizeReportHtml('<p onmouseover="steal()">Vitals</p>');
    expect(clean).toBe('<p>Vitals</p>');
  });

  it('drops an image payload entirely', () => {
    expect(sanitizeReportHtml('<img src=x onerror="alert(1)">')).toBe('');
  });

  it('drops links rather than trusting their target', () => {
    const clean = sanitizeReportHtml('<a href="javascript:alert(1)">tap</a>');
    expect(clean).not.toContain('href');
    expect(clean).not.toContain('javascript');
    expect(clean).toContain('tap');
  });

  it('drops inline styles', () => {
    expect(sanitizeReportHtml('<p style="position:fixed;top:0">x</p>')).toBe('<p>x</p>');
  });

  it('strips style blocks and their contents', () => {
    const clean = sanitizeReportHtml('<style>body{display:none}</style><p>x</p>');
    expect(clean).toBe('<p>x</p>');
  });

  it('removes an iframe', () => {
    expect(sanitizeReportHtml('<iframe src="http://evil.test"></iframe>')).toBe('');
  });

  it('keeps an ordered list numbering from where it started', () => {
    expect(sanitizeReportHtml('<ol start="3"><li>x</li></ol>')).toBe(
      '<ol start="3"><li>x</li></ol>',
    );
  });

  it('reduces markup-only content to nothing, so it cannot pass as a written report', () => {
    // Paired with the service sanitizing *before* validating: this is what
    // makes `<script>note</script>` fail "the report cannot be empty".
    expect(sanitizeReportHtml('<script>note</script>')).toBe('');
  });

  it('leaves plain text alone', () => {
    expect(sanitizeReportHtml('No markup at all')).toBe('No markup at all');
  });
});

import { MAX_OPERATIONAL_REPORT_LENGTH } from '@redinfo/shared';
import { sanitizeReportHtml } from '../../../backend/src/event-reports/sanitize-report';
import { buildNarrative } from './narrative';

describe('buildNarrative', () => {
  // `descricao` is HTML from the legacy rich-text control (confirmed against
  // the real dump — 1,814 of 1,835 rows already contain tags), so it is
  // carried through, not re-escaped as if a crew had just typed it.
  it('passes legacy rich-text HTML through, preserving its paragraphs and formatting', () => {
    const result = buildNarrative({
      descricao: '<p>Chamada particular para fem.</p><p>Sinais vitais <strong>normais</strong> e est&aacute;veis.</p>',
      ocorrenciaLabel: null,
      droppedNotes: [],
    });
    expect(result.html).toContain('<p>Chamada particular para fem.</p>');
    expect(result.html).toContain('<p>Sinais vitais <strong>normais</strong> e estáveis.</p>');
  });

  it('downgrades a tag outside the new editor\'s allowed set to plain text rather than dropping its content', () => {
    const result = buildNarrative({
      descricao: '<div><span style="color:red">Vítima</span> transportada</div>',
      ocorrenciaLabel: null,
      droppedNotes: [],
    });
    expect(result.html).toContain('Vítima transportada');
    expect(result.html).not.toContain('<div>');
    expect(result.html).not.toContain('<span');
  });

  it('never lets stray markup in the legacy text carry a script or an event handler through', () => {
    const result = buildNarrative({
      descricao: '<p onclick="alert(1)">Nota</p><script>alert(2)</script>',
      ocorrenciaLabel: null,
      droppedNotes: [],
    });
    expect(result.html).toBe('<p>Nota</p>');
  });

  it('prepends the occurrence type as a bolded first paragraph', () => {
    const result = buildNarrative({
      descricao: 'Descrição',
      ocorrenciaLabel: 'Atropelamento',
      droppedNotes: [],
    });
    expect(result.html.startsWith('<p><strong>Tipo de ocorrência:</strong> Atropelamento</p>')).toBe(true);
  });

  it('omits the type paragraph entirely when there is no label', () => {
    const result = buildNarrative({ descricao: 'Descrição', ocorrenciaLabel: null, droppedNotes: [] });
    expect(result.html).not.toContain('Tipo de ocorrência');
  });

  it('appends a "campos não migrados" list for whatever the caller names, and nothing about a phone number', () => {
    const result = buildNarrative({
      descricao: 'Descrição',
      ocorrenciaLabel: null,
      droppedNotes: ['idade_AM: Meses', 'apoio_inem código não mapeado: heli'],
    });
    expect(result.html).toContain('Campos não migrados');
    expect(result.html).toContain('idade_AM: Meses');
    expect(result.html).toContain('apoio_inem código não mapeado: heli');
    expect(result.html.toLowerCase()).not.toContain('contacto');
    expect(result.html.toLowerCase()).not.toContain('telefone');
  });

  it('omits the dropped-fields block entirely when there is nothing to note', () => {
    const result = buildNarrative({ descricao: 'Descrição', ocorrenciaLabel: null, droppedNotes: [] });
    expect(result.html).not.toContain('Campos não migrados');
  });

  it('truncates at MAX_OPERATIONAL_REPORT_LENGTH on a tag boundary and marks the cut', () => {
    const longLine = `<p>${'A'.repeat(MAX_OPERATIONAL_REPORT_LENGTH)}</p>`;
    const result = buildNarrative({ descricao: longLine, ocorrenciaLabel: null, droppedNotes: [] });

    expect(result.truncated).toBe(true);
    expect(result.html.length).toBeLessThanOrEqual(MAX_OPERATIONAL_REPORT_LENGTH);
    expect(result.html).toContain('[truncado na importação]');
    // Never cut mid-tag: the payload up to the marker must be well-formed
    // enough that sanitizing it again changes nothing (see the fixed-point
    // test below) — an odd `<` with no matching `>` would fail that.
    expect(result.html.endsWith('</p>')).toBe(true);
  });

  it('does not truncate a narrative under the limit', () => {
    const result = buildNarrative({ descricao: 'Short report', ocorrenciaLabel: null, droppedNotes: [] });
    expect(result.truncated).toBe(false);
    expect(result.html).not.toContain('truncado');
  });

  it('is a fixed point of sanitizeReportHtml', () => {
    const result = buildNarrative({
      descricao: 'Linha um\nLinha dois',
      ocorrenciaLabel: 'Queda',
      droppedNotes: ['nota'],
    });
    expect(sanitizeReportHtml(result.html)).toBe(result.html);
  });
});

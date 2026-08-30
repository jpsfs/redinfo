import { MAX_OPERATIONAL_REPORT_LENGTH } from '@redinfo/shared';
import { sanitizeReportHtml } from '../../../backend/src/event-reports/sanitize-report';
import { buildNarrative } from './narrative';

describe('buildNarrative', () => {
  it('escapes < and & in the plaintext rather than passing them through', () => {
    const result = buildNarrative({
      descricao: 'Vítima com dor <forte> & agitada',
      ocorrenciaLabel: null,
      droppedNotes: [],
    });
    expect(result.html).toContain('Vítima com dor &lt;forte&gt; &amp; agitada');
    expect(result.html).not.toContain('<forte>');
  });

  it('turns each non-empty line into its own paragraph', () => {
    const result = buildNarrative({
      descricao: 'Primeira linha\n\nSegunda linha\nTerceira linha',
      ocorrenciaLabel: null,
      droppedNotes: [],
    });
    expect(result.html).toBe('<p>Primeira linha</p><p>Segunda linha</p><p>Terceira linha</p>');
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
    const longLine = 'A'.repeat(MAX_OPERATIONAL_REPORT_LENGTH);
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

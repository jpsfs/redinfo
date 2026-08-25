import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MicIcon from '@mui/icons-material/Mic';
import MicNoneIcon from '@mui/icons-material/MicNone';
import {
  ABCDE_BANDS,
  AbcdeBand,
  AbcdeFindings,
  AssessmentInput,
  CHAMU_FIELDS,
  ChamuField,
  MAX_ASSESSMENT_POSITION_LENGTH,
} from '@redinfo/shared';
import { abcdeBandLabel, chamuLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { timeOfDay } from '../eventReports/reportDraft';
import { LiveRunHandle } from './useLiveRun';
import { DictationControl } from './useDictation';
import { VITAL_FIELDS, bandHasContent, vitalsForBand } from './vitalsFields';
import { AbcdeStatusPicker, VitalControl } from './VitalField';

/**
 * The microphone beside a text field.
 *
 * Absent — not disabled — where the browser has no Web Speech: a control that
 * cannot do anything is worse than no control, because a crew will tap it twice
 * and then stop trusting the screen. The keyboard is always there.
 */
const DictationButton = ({
  field,
  value,
  onChange,
  dictation,
}: {
  field: string;
  value: string;
  onChange: (text: string) => void;
  dictation: DictationControl;
}) => {
  const t = useT();
  if (!dictation.available) return null;
  const active = dictation.listening && dictation.activeField === field;

  return (
    <IconButton
      aria-label={active ? t('live.dictating') : t('live.dictate')}
      aria-pressed={active}
      color={active ? 'primary' : 'default'}
      onClick={() => dictation.start(field, { current: value, onChange })}
      sx={{ minWidth: 44, minHeight: 44 }}
    >
      {active ? <MicIcon /> : <MicNoneIcon />}
    </IconButton>
  );
};

export interface AssessmentEditorProps {
  form: LiveRunHandle;
  dictation: DictationControl;
}

/**
 * The ABCDE grid and CHAMU, as one scrolling column with a sticky chip rail.
 *
 * All five bands plus CHAMU are in **one column**, and the rail is a scroll-spy
 * that jumps to them — with a completion dot per band, so "what have I not done"
 * is answerable at a glance without scrolling.
 *
 * Not tabs (which hide four of five, making a vital you took thirty seconds ago
 * a tap away instead of a glance), not an accordion (which collapses exactly
 * what the crew wants to re-read, and adds open/close state to manage
 * one-handed), and not a `Stepper` (linear, which is what a real assessment
 * never is).
 */
export const AssessmentEditor = ({ form, dictation }: AssessmentEditorProps) => {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<string>(AbcdeBand.A);
  const sections = useRef(new Map<string, HTMLElement>());

  const assessments = form.assessments;
  const current = assessments[index] as AssessmentInput | undefined;
  const findings = (form.run.capture?.abcde ?? {}) as AbcdeFindings;

  // The pager never points past the end — removing the last assessment must not
  // leave a blank screen.
  useEffect(() => {
    if (index > 0 && index >= assessments.length) setIndex(assessments.length - 1);
  }, [assessments.length, index]);

  const register = useCallback((key: string, node: HTMLElement | null) => {
    if (node) sections.current.set(key, node);
    else sections.current.delete(key);
  }, []);

  /**
   * The rail follows the column.
   *
   * Where `IntersectionObserver` is absent — an old Android WebView — the rail
   * simply keeps whatever was last tapped, which is also the real behaviour
   * there rather than a broken one.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = visible?.target.getAttribute('data-band');
        if (key) setActive(key);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: [0.1, 0.5, 1] },
    );

    for (const node of sections.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [assessments.length]);

  const jump = (key: string) => {
    setActive(key);
    // jsdom has no `scrollIntoView`, and neither do some WebViews — the rail
    // still highlights, which is the half that matters.
    sections.current.get(key)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const bands = useMemo(() => ABCDE_BANDS, []);

  const setFindings = (next: AbcdeFindings) => form.patchCapture({ abcde: next });

  const setChamu = (field: ChamuField, text: string) =>
    form.patchCaptureLater({ [field]: text } as Record<ChamuField, string>);

  return (
    <Box>
      {/* ── The rail ── */}
      <Box
        sx={{
          position: 'sticky',
          top: 96,
          zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          mx: -2,
          px: 2,
          py: 1,
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
        }}
        role="tablist"
        aria-label={t('live.abcde')}
      >
        {bands.map((band) => (
          <Chip
            key={band}
            role="tab"
            aria-selected={active === band}
            label={band}
            onClick={() => jump(band)}
            color={active === band ? 'primary' : 'default'}
            variant={active === band ? 'filled' : 'outlined'}
            icon={
              bandHasContent(band, current, findings) ? (
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: active === band ? '#fff' : 'primary.main',
                    ml: 1,
                  }}
                />
              ) : undefined
            }
            sx={{ minWidth: 56, minHeight: 44, fontWeight: 800, borderRadius: 1.5 }}
          />
        ))}
        <Chip
          role="tab"
          aria-selected={active === 'CHAMU'}
          label={t('live.chamu')}
          onClick={() => jump('CHAMU')}
          color={active === 'CHAMU' ? 'primary' : 'default'}
          variant={active === 'CHAMU' ? 'filled' : 'outlined'}
          sx={{ minHeight: 44, fontWeight: 800, borderRadius: 1.5 }}
        />
      </Box>

      <Stack spacing={2.5} sx={{ pt: 2 }}>
        {/* ── Which set of observations ── */}
        {assessments.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              {t('live.noAssessments')}
            </Typography>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIndex(form.addAssessment())}
              sx={{ minHeight: 56, fontWeight: 700 }}
            >
              {t('live.addAssessment')}
            </Button>
          </Paper>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton
              disabled={index === 0}
              aria-label={t('action.back')}
              onClick={() => setIndex((at) => Math.max(0, at - 1))}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 700 }}>
                {t('live.assessmentPager')} {index + 1} {t('step.of')} {assessments.length}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {timeOfDay(current?.takenAt)}
              </Typography>
            </Box>
            <IconButton
              disabled={index >= assessments.length - 1}
              aria-label={t('action.next')}
              onClick={() => setIndex((at) => Math.min(assessments.length - 1, at + 1))}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <ChevronRightIcon />
            </IconButton>
            <IconButton
              aria-label={t('live.addAssessment')}
              onClick={() => setIndex(form.addAssessment())}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <AddIcon />
            </IconButton>
          </Stack>
        )}

        {/* ── The bands ── */}
        {current &&
          bands.map((band) => (
            <Paper
              key={band}
              variant="outlined"
              data-band={band}
              ref={(node: HTMLElement | null) => register(band, node)}
              sx={{ p: 2, scrollMarginTop: 152 }}
            >
              <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{abcdeBandLabel(t, band)}</Typography>
              <Stack spacing={2}>
                <AbcdeStatusPicker
                  band={band}
                  findings={findings}
                  onChange={setFindings}
                  noteAdornment={(note, setNote) => (
                    <DictationButton
                      field={`abcde-${band}`}
                      value={note}
                      onChange={setNote}
                      dictation={dictation}
                    />
                  )}
                />
                {vitalsForBand(band).map((field) => (
                  <VitalControl
                    key={field.key}
                    field={field}
                    assessment={current}
                    onChange={(changes) => form.editAssessment(index, changes)}
                  />
                ))}
              </Stack>
            </Paper>
          ))}

        {current && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <TextField
              fullWidth
              label={t('field.bodyPosition')}
              value={current.bodyPosition ?? ''}
              onChange={(event) =>
                form.editAssessment(index, { bodyPosition: event.target.value })
              }
              inputProps={{ maxLength: MAX_ASSESSMENT_POSITION_LENGTH }}
            />
            {assessments.length > 1 && (
              <Button
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => form.removeAssessment(index)}
                sx={{ mt: 1.5, minHeight: 48 }}
              >
                {t('live.removeAssessment')}
              </Button>
            )}
          </Paper>
        )}

        {/* ── CHAMU ── */}
        <Paper
          variant="outlined"
          data-band="CHAMU"
          ref={(node: HTMLElement | null) => register('CHAMU', node)}
          sx={{ p: 2, scrollMarginTop: 152 }}
        >
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{t('live.chamu')}</Typography>
          <Stack spacing={2}>
            {CHAMU_FIELDS.map((field) => (
              <ChamuInput
                key={field}
                field={field}
                value={form.run.capture?.[field] ?? ''}
                onChange={(text) => setChamu(field, text)}
                dictation={dictation}
              />
            ))}
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
};

/**
 * One CHAMU field.
 *
 * Plain text with a microphone, and deliberately **not** the rich text editor:
 * nobody applies a bullet list one-handed at 3am, and a `contenteditable` is the
 * worst possible target for inserting a dictated transcript. The rich narrative
 * stays on the report, after the run.
 */
const ChamuInput = ({
  field,
  value,
  onChange,
  dictation,
}: {
  field: ChamuField;
  value: string;
  onChange: (text: string) => void;
  dictation: DictationControl;
}) => {
  const t = useT();
  const [text, setText] = useState(value);
  const lastValue = useRef(value);

  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      setText(value);
    }
  }, [value]);

  const write = (next: string) => {
    setText(next);
    onChange(next);
  };

  return (
    <TextField
      fullWidth
      multiline
      minRows={2}
      label={chamuLabel(t, field)}
      value={text}
      onChange={(event) => write(event.target.value)}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>
            <DictationButton
              field={field}
              value={text}
              onChange={write}
              dictation={dictation}
            />
          </InputAdornment>
        ),
      }}
    />
  );
};

/** Exported for the vitals table's own tests and for the report's clinical view. */
export { VITAL_FIELDS };

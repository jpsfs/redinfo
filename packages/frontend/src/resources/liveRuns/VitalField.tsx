import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  ABCDE_STATUSES,
  AVDS_LEVELS,
  AbcdeBand,
  AbcdeFindings,
  AbcdeStatus,
  AssessmentInput,
  AvdsLevel,
} from '@redinfo/shared';
import { abcdeStatusLabel, avdsLevelLabel, vitalLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { VitalField, formatVital, isImplausible, isOutOfRange, parseVital } from './vitalsFields';

/**
 * One vital, with the control its value's shape deserves.
 *
 * Its own file because two screens render it: the live assessment grid, and the
 * report's clinical section where a coordinator corrects what the crew captured.
 * One component means a fix to the comma handling reaches both.
 *
 * `type="text"` with `inputMode`, **never** `type="number"` — a pt-PT keyboard
 * produces `36,8`, which `type="number"` silently turns into an empty
 * `valueAsNumber`: the crew types a temperature, looks away, and the field is
 * blank.
 *
 * Out of range and implausible are two different captions, and neither blocks. A
 * real SpO₂ of 71 has to be recordable — the whole point of writing a vital down
 * is that it is abnormal.
 */
export const VitalControl = ({
  field,
  assessment,
  onChange,
}: {
  field: VitalField;
  assessment: AssessmentInput;
  onChange: (changes: Partial<AssessmentInput>) => void;
}) => {
  const t = useT();
  const stored = assessment[field.key] ?? null;
  const [text, setText] = useState(() => formatVital(stored, field.decimals));

  /**
   * Re-seeded only when the stored value changed *underneath* — a sync merge, or
   * the pager moving to another set of observations.
   *
   * Compared against what the field's own text parses to, not against the
   * previous stored value: a crew typing `36,` has already written 36, so
   * re-seeding on that change would replace the half-typed number with `36,0`
   * and eat the digit they were about to press. The trailing separator is
   * exactly the moment this matters, and it is the one a pt-PT keyboard makes
   * unavoidable.
   */
  const typed = useRef(text);
  typed.current = text;
  useEffect(() => {
    if (stored !== parseVital(typed.current)) {
      setText(formatVital(stored, field.decimals));
    }
    // Deliberately not on `text`: this reacts to the stored value moving, and
    // depending on the text would make every keystroke re-seed itself.
  }, [stored, field.decimals]);

  const value = parseVital(text);
  const outOfRange = isOutOfRange(field.key, value);
  const implausible = !outOfRange && isImplausible(field.key, value);

  const write = (raw: string) => {
    setText(raw);
    onChange({ [field.key]: parseVital(raw) } as Partial<AssessmentInput>);
  };

  if (field.control === 'stepper') {
    // A bounded scale nobody types. Starting from the top of the range on the
    // first tap, because 15 is the answer for most patients and counting down
    // from it is fewer taps than counting up from 3.
    const step = (delta: number) => {
      const base = stored ?? field.max;
      const next = Math.min(field.max, Math.max(field.min, base + delta));
      setText(formatVital(next, field.decimals));
      onChange({ [field.key]: next } as Partial<AssessmentInput>);
    };

    return (
      <Box>
        <Typography
          sx={{ fontWeight: 600, fontSize: '0.8125rem', color: 'text.secondary', mb: 0.5 }}
        >
          {vitalLabel(t, field.key)}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton
            onClick={() => step(-1)}
            aria-label={`${vitalLabel(t, field.key)} −1`}
            sx={{ minWidth: 60, minHeight: 60, border: 1, borderColor: 'divider' }}
          >
            <RemoveIcon />
          </IconButton>
          <Typography
            sx={{
              flex: 1,
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {stored ?? '—'}
          </Typography>
          <IconButton
            onClick={() => step(1)}
            aria-label={`${vitalLabel(t, field.key)} +1`}
            sx={{ minWidth: 60, minHeight: 60, border: 1, borderColor: 'divider' }}
          >
            <AddIcon />
          </IconButton>
        </Stack>
      </Box>
    );
  }

  if (field.control === 'chips') {
    // Eleven taps rather than a keyboard: a pain score is a scale with a fixed
    // number of stops, and nobody types one.
    const scale = Array.from(
      { length: field.max - field.min + 1 },
      (_, index) => field.min + index,
    );
    return (
      <Box>
        <Typography
          sx={{ fontWeight: 600, fontSize: '0.8125rem', color: 'text.secondary', mb: 0.75 }}
        >
          {vitalLabel(t, field.key)}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {scale.map((score) => (
            <Chip
              key={score}
              label={score}
              onClick={() =>
                onChange({
                  [field.key]: stored === score ? null : score,
                } as Partial<AssessmentInput>)
              }
              color={stored === score ? 'primary' : 'default'}
              variant={stored === score ? 'filled' : 'outlined'}
              sx={{ minWidth: 44, minHeight: 44, borderRadius: 1.5, fontWeight: 700 }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <TextField
      fullWidth
      label={vitalLabel(t, field.key)}
      value={text}
      onChange={(event) => write(event.target.value)}
      error={outOfRange}
      helperText={
        outOfRange ? t('live.outOfRange') : implausible ? t('live.implausible') : undefined
      }
      inputProps={{
        inputMode: field.inputMode,
        'aria-label': vitalLabel(t, field.key),
        enterKeyHint: 'next',
      }}
      InputProps={{
        endAdornment: field.unit ? (
          <InputAdornment position="end">{field.unit}</InputAdornment>
        ) : undefined,
      }}
    />
  );
};

/**
 * One ABCDE band's finding.
 *
 * Three answers, and `NOT_ASSESSED` is a real one: "we looked and it was fine"
 * and "we never got to it" are different clinical facts, and a control that
 * offered only the first two would make a crew claim the second.
 */
export const AbcdeStatusPicker = ({
  band,
  findings,
  onChange,
  noteAdornment,
}: {
  band: AbcdeBand;
  findings: AbcdeFindings;
  onChange: (next: AbcdeFindings) => void;
  /** A microphone, on the screens that have one. */
  noteAdornment?: (value: string, onChangeNote: (text: string) => void) => React.ReactNode;
}) => {
  const t = useT();
  const finding = findings[band];
  const note = finding?.note ?? '';

  const setStatus = (status: AbcdeStatus | null) => {
    const next = { ...findings };
    if (status === null) delete next[band];
    else next[band] = { ...(finding ?? {}), status };
    onChange(next);
  };

  const setNote = (text: string) => {
    onChange({
      ...findings,
      // A note without a status still says something was looked at, so the band
      // is recorded as assessed rather than the note being dropped.
      [band]: { status: finding?.status ?? 'ALTERED', note: text },
    });
  };

  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={finding?.status ?? null}
        onChange={(_event, value) => setStatus(value as AbcdeStatus | null)}
        sx={{ '& .MuiToggleButton-root': { minHeight: 60, fontWeight: 700 } }}
      >
        {ABCDE_STATUSES.map((status) => (
          <ToggleButton key={status} value={status}>
            {abcdeStatusLabel(t, status)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {finding?.status === 'ALTERED' && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder={t('field.notes')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          InputProps={{
            endAdornment: noteAdornment ? (
              <InputAdornment position="end">{noteAdornment(note, setNote)}</InputAdornment>
            ) : undefined,
          }}
        />
      )}
    </Stack>
  );
};

/**
 * Level of consciousness on the AVDS scale — four chips, band D.
 *
 * An enum, not a number, so it is deliberately not a `VitalField` row and does
 * not go through `VitalControl` above. Each chip's visible label is the single
 * letter (readable at a glance on a 360px screen), and its accessible name is
 * the full Portuguese expansion — a screen reader must never announce a bare
 * "V".
 *
 * `ToggleButtonGroup`'s own `exclusive` behaviour already clears a re-tapped
 * selection back to `null` — the same "tap again to undo" the gender and
 * location-type controls elsewhere on the live screens rely on, so this needs
 * no special-casing here.
 *
 * A level other than `A` (fully alert) renders in the warning colour. This is
 * visual only: it does not add a blocker or a warning code of its own, it just
 * makes an altered level of consciousness catch the eye the way it should.
 */
export const AvdsPicker = ({
  value,
  onChange,
}: {
  value: AvdsLevel | null;
  onChange: (next: AvdsLevel | null) => void;
}) => {
  const t = useT();

  return (
    <Box>
      <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem', color: 'text.secondary', mb: 0.75 }}>
        {t('vital.avds')}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value ?? null}
        onChange={(_event, next) => onChange((next as AvdsLevel | null) ?? null)}
        sx={{ '& .MuiToggleButton-root': { minHeight: 48, minWidth: 44, fontWeight: 800 } }}
      >
        {AVDS_LEVELS.map((level) => (
          <ToggleButton
            key={level}
            value={level}
            aria-label={avdsLevelLabel(t, level)}
            sx={
              level !== AvdsLevel.A
                ? {
                    '&.Mui-selected': {
                      backgroundColor: 'warning.light',
                      color: 'warning.contrastText',
                      '&:hover': { backgroundColor: 'warning.light' },
                    },
                  }
                : undefined
            }
          >
            {level}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};

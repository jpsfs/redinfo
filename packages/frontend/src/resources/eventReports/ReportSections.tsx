import { useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import RemoveIcon from '@mui/icons-material/Remove';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventIcon from '@mui/icons-material/Event';
import {
  ABCDE_BANDS,
  AbcdeFindings,
  AssessmentInput,
  CHAMU_FIELDS,
  CrewSuggestionShift,
  EVENT_LOCATION_TYPES,
  EventLocationType,
  EventReportAttachment,
  EventReportAttachmentKind,
  EventReportInput,
  EventReportWarningCode,
  GENDERS,
  Gender,
  Locality,
  MAX_VICTIM_AGE,
  MIN_VICTIM_AGE,
  OCCURRENCE_TIME_FIELDS,
  OccurrenceTimeField,
  VictimDestinationKind,
  eventReportRules,
  formatEventReportCode,
  totalKilometres,
} from '@redinfo/shared';
import { apiDownload } from '../../api';
import { RichTextEditor } from '../../components/RichTextEditor';
import {
  abcdeBandLabel,
  chamuLabel,
  destinationLabel,
  genderLabel,
  locationTypeLabel,
  occurrenceTimeLabel,
  roleLabel,
  t,
  warningLabel,
} from '../../i18n/labels';
import { NowButton } from './NowButton';
import { AbcdeStatusPicker, VitalControl } from '../liveRuns/VitalField';
import { VITAL_FIELDS } from '../liveRuns/vitalsFields';
import { StepId, composeInstant, minutesBetween, timeOfDay } from './reportDraft';
import { ReportLookups, personName, vehicleLabel } from './useReportLookups';
import { LocalityPicker, localityLabel } from './LocalityPicker';
import { DestinationChoice, HospitalPicker } from './HospitalPicker';

/**
 * The report's fields, grouped the way the crew thinks about them.
 *
 * Each section is a self-contained group with no opinion about layout: the
 * phone wizard shows one at a time and the desktop form shows them all, and
 * neither has to know what a section contains. Everything here reads and writes
 * one `EventReportInput` through `patch`, so there is a single source of truth
 * for what the report says.
 */

export interface SectionProps {
  draft: EventReportInput;
  patch: (changes: Partial<EventReportInput>) => void;
  lookups: ReportLookups;
}

const LABEL_SX = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8125rem' } as const;

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ ...LABEL_SX, mb: 0.75 }}>{children}</Typography>
);

// ── When and where ────────────────────────────────────────────────────────────

export const WhenWhereSection = ({ draft, patch, lookups }: SectionProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rules = eventReportRules(draft.type);

  /** A time field writes an instant on the report's own day. */
  const setTime = (field: 'startedAt' | 'endedAt', value: string) => {
    const instant = composeInstant(draft.occurredOn, value, {
      // The end may only ever follow the start; typing "00:14" after a 22:31
      // start means the small hours of the next day, not yesterday.
      notBefore: field === 'endedAt' ? draft.startedAt : null,
    });
    patch({ [field]: instant } as Partial<EventReportInput>);
  };

  const stampNow = (field: 'startedAt' | 'endedAt') => {
    patch({ [field]: new Date().toISOString() } as Partial<EventReportInput>);
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <SectionLabel>
          {rules.requiresExternalReference ? t('field.coduReference') : t('field.reference')}
        </SectionLabel>
        <TextField
          fullWidth
          value={draft.externalReference ?? ''}
          onChange={(event) => patch({ externalReference: event.target.value })}
          inputProps={{ 'aria-label': t('field.reference'), inputMode: 'numeric' }}
        />
      </Box>

      <Box>
        <SectionLabel>{t('field.date')}</SectionLabel>
        <TextField
          fullWidth
          type="date"
          value={draft.occurredOn}
          onChange={(event) => patch({ occurredOn: event.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ 'aria-label': t('field.date') }}
        />
      </Box>

      <Box>
        <SectionLabel>{t('field.hours')}</SectionLabel>
        <Stack direction="row" spacing={1.5}>
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="time"
                value={timeOfDay(draft.startedAt)}
                onChange={(event) => setTime('startedAt', event.target.value)}
                inputProps={{ 'aria-label': t('field.start') }}
                sx={{ flex: 1 }}
              />
              <NowButton onClick={() => stampNow('startedAt')} label={t('action.now')} />
            </Stack>
            <Typography variant="caption" color="text.disabled">
              {t('field.start')}
            </Typography>
          </Stack>

          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="time"
                value={timeOfDay(draft.endedAt)}
                onChange={(event) => setTime('endedAt', event.target.value)}
                inputProps={{ 'aria-label': t('field.end') }}
                sx={{ flex: 1 }}
              />
              <NowButton onClick={() => stampNow('endedAt')} label={t('action.now')} />
            </Stack>
            <Typography variant="caption" color="text.disabled">
              {t('field.end')}
            </Typography>
          </Stack>
        </Stack>
      </Box>

      <Box>
        <SectionLabel>{t('field.locationType')}</SectionLabel>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={draft.locationType || null}
          onChange={(_event, value: EventLocationType | null) => {
            // A toggle group hands back null when the pressed button was
            // already on; keeping the current value stops a stray tap from
            // clearing an answer.
            if (value) patch({ locationType: value });
          }}
          sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 1 } }}
        >
          {EVENT_LOCATION_TYPES.map((value) => (
            <ToggleButton key={value} value={value} sx={{ minHeight: 60, flex: 1 }}>
              {locationTypeLabel(value)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <SectionLabel>{t('field.locality')}</SectionLabel>
        <Button
          fullWidth
          variant="outlined"
          color="secondary"
          onClick={() => setPickerOpen(true)}
          endIcon={<ChevronRightIcon />}
          sx={{ minHeight: 56, justifyContent: 'space-between', textAlign: 'left' }}
        >
          <Box component="span" sx={{ flex: 1 }}>
            {lookups.locality
              ? localityLabel(lookups.locality)
              : t('hint.searchLocality')}
          </Box>
        </Button>
      </Box>

      <LocalityPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(locality: Locality) => patch({ localityId: locality.id })}
      />
    </Stack>
  );
};

// ── The emergency chronology ──────────────────────────────────────────────────

export const TimesSection = ({ draft, patch }: SectionProps) => {
  const stamp = (field: OccurrenceTimeField) => {
    patch({ [field]: new Date().toISOString() } as Partial<EventReportInput>);
  };

  const setTime = (field: OccurrenceTimeField, value: string) => {
    patch({
      [field]: value ? composeInstant(draft.occurredOn, value) : null,
    } as Partial<EventReportInput>);
  };

  /**
   * The gap since the previous stamp that was actually filled in — not since
   * the previous field. A crew that marked activation and hospital arrival and
   * nothing between should see the real elapsed time, not a gap measured from
   * a blank.
   */
  const gapBefore = (index: number): number | null => {
    const current = draft[OCCURRENCE_TIME_FIELDS[index]];
    if (!current) return null;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const earlier = draft[OCCURRENCE_TIME_FIELDS[previous]];
      if (earlier) return minutesBetween(earlier, current);
    }
    return null;
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {t('hint.timesOptional')}
      </Typography>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {OCCURRENCE_TIME_FIELDS.map((field, index) => {
            const value = draft[field];
            const gap = gapBefore(index);
            return (
              <Stack
                key={field}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ pt: index === 0 ? 0 : 1.5 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                    {occurrenceTimeLabel(field)}
                    {gap !== null && (
                      <Typography
                        component="span"
                        sx={{ ml: 1, color: 'text.disabled', fontWeight: 500 }}
                      >
                        +{gap} min
                      </Typography>
                    )}
                  </Typography>
                  <TextField
                    type="time"
                    size="small"
                    value={timeOfDay(value)}
                    onChange={(event) => setTime(field, event.target.value)}
                    inputProps={{ 'aria-label': occurrenceTimeLabel(field) }}
                    sx={{ mt: 0.5, width: 140 }}
                  />
                </Box>
                <NowButton
                  onClick={() => stamp(field)}
                  label={value ? t('action.change') : t('action.now')}
                />
              </Stack>
            );
          })}
        </Stack>
      </Paper>

      <Typography variant="caption" color="text.disabled">
        {t('hint.emergencyTimesOnly')}
      </Typography>
    </Stack>
  );
};

// ── Crew ──────────────────────────────────────────────────────────────────────

/** One recent shift, as the "change shift" list offers it. */
const ShiftRow = ({
  shift,
  selected,
  onPick,
}: {
  shift: CrewSuggestionShift;
  selected: boolean;
  onPick: () => void;
}) => (
  <Paper
    variant="outlined"
    onClick={onPick}
    sx={{
      p: 1.5,
      cursor: 'pointer',
      borderColor: selected ? 'primary.main' : 'divider',
      borderWidth: selected ? 2 : 1,
      bgcolor: selected ? 'rgba(237, 27, 36, 0.06)' : 'background.paper',
    }}
  >
    <Typography sx={{ fontWeight: 700 }}>
      {shift.date} · {shift.label}
    </Typography>
    <Typography variant="body2" color="text.secondary" noWrap>
      {/* Named, because a crew recognises a shift by who was on it. */}
      {shift.crew.map((member) => `${member.firstName} ${member.lastName}`).join(' · ')}
    </Typography>
  </Paper>
);

export const CrewSection = ({ draft, patch, lookups }: SectionProps) => {
  const [showShifts, setShowShifts] = useState(false);
  const suggestion = lookups.crewSuggestion;

  const applyShift = (shift: CrewSuggestionShift) => {
    patch({
      shift: { scheduleId: shift.scheduleId, date: shift.date, slot: shift.slot },
      crew: shift.crew.map((member) => ({
        userId: member.userId,
        roleName: member.roleName ?? null,
      })),
    });
    setShowShifts(false);
  };

  const removeMember = (userId: string) => {
    patch({ crew: draft.crew.filter((member) => member.userId !== userId) });
  };

  const alreadyOn = new Set(draft.crew.map((member) => member.userId));
  const addable = lookups.candidates.filter((person) => !alreadyOn.has(person.id));

  return (
    <Stack spacing={2}>
      {suggestion?.suggested && (
        <Alert
          severity="success"
          action={
            <Button size="small" onClick={() => setShowShifts((open) => !open)}>
              {t('action.changeShift')}
            </Button>
          }
        >
          <strong>{suggestion.suggested.label}</strong> · {suggestion.suggested.windowLabel}
        </Alert>
      )}

      {suggestion?.suggested && draft.crew.length === 0 && (
        <Button variant="outlined" onClick={() => applyShift(suggestion.suggested!)}>
          {t('action.continueDraft')} — {suggestion.suggested.crew.length}
        </Button>
      )}

      {showShifts && (
        <Stack spacing={1}>
          <Typography sx={LABEL_SX}>{t('hint.chooseShift')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('hint.recogniseCrew')}
          </Typography>
          {[...(suggestion?.suggested ? [suggestion.suggested] : []), ...(suggestion?.recent ?? [])].map(
            (shift) => (
              <ShiftRow
                key={`${shift.scheduleId}-${shift.date}-${shift.slot}`}
                shift={shift}
                selected={
                  draft.shift?.scheduleId === shift.scheduleId &&
                  draft.shift?.date === shift.date &&
                  draft.shift?.slot === shift.slot
                }
                onPick={() => applyShift(shift)}
              />
            ),
          )}
        </Stack>
      )}

      <Stack spacing={1}>
        {draft.crew.map((member) => (
          <Paper
            key={member.userId}
            variant="outlined"
            sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {member.roleName && (
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                  {roleLabel(member.roleName).toUpperCase()}
                </Typography>
              )}
              <Typography sx={{ fontWeight: 600 }}>
                {personName(lookups, member.userId) || member.userId}
              </Typography>
            </Box>
            <IconButton
              onClick={() => removeMember(member.userId)}
              aria-label={`${t('action.remove')} ${personName(lookups, member.userId)}`}
            >
              <CloseIcon />
            </IconButton>
          </Paper>
        ))}
      </Stack>

      <Autocomplete
        options={addable}
        getOptionLabel={(person) => `${person.firstName} ${person.lastName}`}
        value={null}
        blurOnSelect
        onChange={(_event, person) => {
          if (person) patch({ crew: [...draft.crew, { userId: person.id, roleName: null }] });
        }}
        renderInput={(params) => (
          <TextField {...params} label={t('action.addPerson')} placeholder={t('action.search')} />
        )}
      />

      <Typography variant="caption" color="text.disabled">
        {t('hint.crewFromSchedule')}
      </Typography>
    </Stack>
  );
};

// ── Vehicles and kilometres ───────────────────────────────────────────────────

export const VehiclesSection = ({ draft, patch, lookups }: SectionProps) => {
  const rules = eventReportRules(draft.type);
  const single = rules.maxVehicles === 1;

  const setLine = (index: number, changes: Partial<EventReportInput['vehicles'][number]>) => {
    patch({
      vehicles: draft.vehicles.map((line, at) =>
        at === index ? { ...line, ...changes } : line,
      ),
    });
  };

  const chosen = new Set(draft.vehicles.map((line) => line.vehicleId));
  const options = lookups.vehicles.filter((vehicle) => !chosen.has(vehicle.id));

  return (
    <Stack spacing={2}>
      <SectionLabel>{single ? t('field.vehicle') : t('field.vehiclesUsed')}</SectionLabel>

      {draft.vehicles.map((line, index) => (
        <Paper key={`${line.vehicleId}-${index}`} variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography sx={{ flex: 1, fontWeight: 700, letterSpacing: '0.04em' }}>
              {vehicleLabel(lookups, line.vehicleId) || line.vehicleId}
            </Typography>
            <IconButton
              onClick={() =>
                patch({ vehicles: draft.vehicles.filter((_, at) => at !== index) })
              }
              aria-label={t('action.remove')}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
          <TextField
            fullWidth
            type="number"
            value={line.kilometres}
            onChange={(event) =>
              setLine(index, {
                // Whole kilometres, never negative: a fat-fingered minus must
                // not reach the API and come back as a validation error.
                kilometres: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
              })
            }
            inputProps={{ min: 0, inputMode: 'numeric', 'aria-label': t('field.kilometres') }}
            InputProps={{ endAdornment: <span>{t('field.kilometresShort')}</span> }}
          />
        </Paper>
      ))}

      {draft.vehicles.length < rules.maxVehicles && (
        <Autocomplete
          options={options}
          getOptionLabel={(vehicle) => `${vehicle.licensePlate} · ${vehicle.numeroCauda}`}
          value={null}
          blurOnSelect
          onChange={(_event, vehicle) => {
            if (vehicle) {
              patch({
                vehicles: [...draft.vehicles, { vehicleId: vehicle.id, kilometres: 0 }],
              });
            }
          }}
          renderInput={(params) => (
            <TextField {...params} label={t('action.addVehicle')} />
          )}
        />
      )}

      {!single && draft.vehicles.length > 1 && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ flex: 1, fontWeight: 600, color: 'text.secondary' }}>
            {t('field.total')}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
            {totalKilometres(draft.vehicles)} {t('field.kilometresShort')}
          </Typography>
        </Paper>
      )}

      <Typography variant="caption" color="text.disabled">
        {single ? t('hint.oneVehicleEmergency') : t('hint.kilometresTotal')}
      </Typography>
    </Stack>
  );
};

// ── Victims and transport ─────────────────────────────────────────────────────

const VictimEditor = ({
  victim,
  locality,
  hospitalName,
  onChange,
  onRemove,
}: {
  victim: EventReportInput['victims'][number];
  locality: Locality | null;
  hospitalName?: string;
  onChange: (changes: Partial<EventReportInput['victims'][number]>) => void;
  onRemove?: () => void;
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  const destinationText =
    victim.destinationKind === VictimDestinationKind.HOSPITAL
      ? hospitalName ?? destinationLabel(victim.destinationKind)
      : destinationLabel(victim.destinationKind);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {onRemove && (
          <Stack direction="row" alignItems="center">
            <Box sx={{ flex: 1 }} />
            <IconButton onClick={onRemove} aria-label={t('action.remove')}>
              <CloseIcon />
            </IconButton>
          </Stack>
        )}

        <Box>
          <SectionLabel>{t('field.gender')}</SectionLabel>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={victim.gender}
            onChange={(_event, value: Gender | null) => {
              if (value) onChange({ gender: value });
            }}
            sx={{ gap: 1, '& .MuiToggleButton-root': { borderRadius: 1 } }}
          >
            {GENDERS.map((value) => (
              <ToggleButton key={value} value={value} sx={{ minHeight: 56, flex: 1 }}>
                {genderLabel(value)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Box>
          <SectionLabel>{t('field.age')}</SectionLabel>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              onClick={() => onChange({ age: Math.max(MIN_VICTIM_AGE, victim.age - 1) })}
              aria-label="-1"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 56, height: 56 }}
            >
              <RemoveIcon />
            </IconButton>
            <TextField
              type="number"
              value={victim.age}
              onChange={(event) =>
                onChange({
                  age: Math.min(
                    MAX_VICTIM_AGE,
                    Math.max(MIN_VICTIM_AGE, Math.trunc(Number(event.target.value) || 0)),
                  ),
                })
              }
              inputProps={{
                min: MIN_VICTIM_AGE,
                max: MAX_VICTIM_AGE,
                inputMode: 'numeric',
                'aria-label': t('field.age'),
                style: { textAlign: 'center', fontSize: '1.5rem', fontWeight: 700 },
              }}
              sx={{ flex: 1 }}
            />
            <IconButton
              onClick={() => onChange({ age: Math.min(MAX_VICTIM_AGE, victim.age + 1) })}
              aria-label="+1"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 56, height: 56 }}
            >
              <AddIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            {t('hint.ageApproximate')}
          </Typography>
        </Box>

        <Box>
          <SectionLabel>{t('field.destination')}</SectionLabel>
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            onClick={() => setPickerOpen(true)}
            endIcon={<ChevronRightIcon />}
            sx={{ minHeight: 56, justifyContent: 'space-between', textAlign: 'left' }}
          >
            <Box component="span" sx={{ flex: 1 }}>
              {destinationText}
            </Box>
          </Button>
        </Box>
      </Stack>

      <HospitalPicker
        open={pickerOpen}
        locality={locality}
        onClose={() => setPickerOpen(false)}
        onPick={(choice: DestinationChoice) => {
          onChange({
            destinationKind: choice.destinationKind,
            destinationHospitalId: choice.destinationHospitalId,
          });
          setPickerOpen(false);
        }}
      />
    </Paper>
  );
};

/** A new victim starts unanswered rather than guessed — except the destination,
 *  which has a truthful default: nobody was taken anywhere until someone says so. */
const blankVictim = (): EventReportInput['victims'][number] => ({
  gender: Gender.UNKNOWN,
  age: 0,
  destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
  destinationHospitalId: null,
});

export const VictimsSection = ({ draft, patch, lookups }: SectionProps) => {
  const rules = eventReportRules(draft.type);
  const single = rules.maxVictims === 1;

  const setVictim = (
    index: number,
    changes: Partial<EventReportInput['victims'][number]>,
  ) => {
    patch({
      victims: draft.victims.map((victim, at) =>
        at === index ? { ...victim, ...changes } : victim,
      ),
    });
  };

  const hospitalName = (id?: string | null) =>
    id ? lookups.hospitalsById[id]?.name : undefined;

  // One victim is the ordinary case for an emergency, so the editor is shown
  // straight away rather than behind an "add" button.
  if (single) {
    const victim = draft.victims[0];
    return (
      <Stack spacing={2}>
        {victim ? (
          <VictimEditor
            victim={victim}
            locality={lookups.locality}
            hospitalName={hospitalName(victim.destinationHospitalId)}
            onChange={(changes) => setVictim(0, changes)}
          />
        ) : (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => patch({ victims: [blankVictim()] })}
            sx={{ minHeight: 56 }}
          >
            {t('action.addVictim')}
          </Button>
        )}

        {victim && (
          <Button color="secondary" onClick={() => patch({ victims: [] })}>
            {t('hint.noVictim')}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="baseline">
        <SectionLabel>{t('field.victims')}</SectionLabel>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
          {draft.victims.length}
        </Typography>
      </Stack>

      {draft.victims.map((victim, index) => (
        <VictimEditor
          key={index}
          victim={victim}
          locality={lookups.locality}
          hospitalName={hospitalName(victim.destinationHospitalId)}
          onChange={(changes) => setVictim(index, changes)}
          onRemove={() =>
            patch({ victims: draft.victims.filter((_, at) => at !== index) })
          }
        />
      ))}

      {draft.victims.length < rules.maxVictims && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => patch({ victims: [...draft.victims, blankVictim()] })}
          sx={{ minHeight: 56, borderStyle: 'dashed' }}
        >
          {t('action.addVictim')}
        </Button>
      )}

      <Typography variant="caption" color="text.disabled">
        {t('hint.victimEach')}
      </Typography>
    </Stack>
  );
};

// ── Narrative and attachments ─────────────────────────────────────────────────

export interface NarrativeSectionProps extends SectionProps {
  /** Files chosen but not yet uploaded — a report has to exist first. */
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemovePendingFile: (index: number) => void;
  /** Already uploaded, when editing a filed report. */
  attachments?: EventReportAttachment[];
  onRemoveAttachment?: (id: string) => void;
  /**
   * The CODU verbete, staged before the report exists — uploaded on save, the
   * same way `pendingFiles` is, but kept apart because it is one slot, not a
   * list.
   */
  pendingVerbete?: File | null;
  onChooseVerbete?: (file: File) => void;
  /** Needed to build the "Abrir" link once the report — and the file — exist. */
  reportId?: string | null;
}

export const NarrativeSection = ({
  draft,
  patch,
  pendingFiles,
  onAddFiles,
  onRemovePendingFile,
  attachments = [],
  onRemoveAttachment,
  pendingVerbete = null,
  onChooseVerbete,
  reportId = null,
}: NarrativeSectionProps) => {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const verbeteInput = useRef<HTMLInputElement>(null);

  // A dedicated slot only on the type it applies to — same rule the backend
  // enforces (`assertVerbeteSlotFree`), read off the one table both trust.
  const showVerbete = eventReportRules(draft.type).hasVerbete && Boolean(onChooseVerbete);
  const verbete = attachments.find(
    (attachment) => attachment.kind === EventReportAttachmentKind.VERBETE,
  );

  const takeFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    if (chosen.length) onAddFiles(chosen);
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = '';
  };

  return (
    <Stack spacing={2}>
      <Box>
        <SectionLabel>{t('field.narrative')}</SectionLabel>
        <RichTextEditor
          value={draft.operationalReport}
          onChange={(html) => patch({ operationalReport: html })}
        />
      </Box>

      <Divider />

      <Box>
        <SectionLabel>{t('field.attachments')}</SectionLabel>

        <Stack spacing={1}>
          <Button
            variant="contained"
            startIcon={<PhotoCameraIcon />}
            onClick={() => cameraInput.current?.click()}
            sx={{ minHeight: 60 }}
          >
            {t('action.takePhoto')}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<AttachFileIcon />}
            onClick={() => fileInput.current?.click()}
          >
            {t('action.attachFile')}
          </Button>
        </Stack>

        {/* `capture` asks the phone for the camera rather than the gallery;
            a desktop browser ignores it and shows a file dialog. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={takeFiles}
          data-testid="camera-input"
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={takeFiles}
          data-testid="file-input"
        />

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {/* The Verbete has its own named slot below; it does not also
              belong in this general, unordered list. */}
          {attachments
            .filter((attachment) => attachment.kind !== EventReportAttachmentKind.VERBETE)
            .map((attachment) => (
              <Chip
                key={attachment.id}
                label={attachment.filename}
                onDelete={onRemoveAttachment ? () => onRemoveAttachment(attachment.id) : undefined}
              />
            ))}
          {pendingFiles.map((pending, index) => (
            <Chip
              key={`${pending.name}-${index}`}
              label={pending.name}
              color="warning"
              variant="outlined"
              onDelete={() => onRemovePendingFile(index)}
            />
          ))}
        </Stack>
      </Box>

      {showVerbete && (
        <>
          <Divider />

          <Box>
            <SectionLabel>{t('field.verbete')}</SectionLabel>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('field.verbeteHint')}
            </Typography>

            {verbete ? (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip icon={<DescriptionIcon />} label={verbete.filename} />
                <Button
                  size="small"
                  onClick={() =>
                    reportId &&
                    void apiDownload(
                      `/event-reports/${reportId}/attachments/${verbete.id}`,
                      verbete.filename,
                    )
                  }
                >
                  {t('field.verbeteOpen')}
                </Button>
                <Button size="small" onClick={() => verbeteInput.current?.click()}>
                  {t('field.verbeteReplace')}
                </Button>
              </Stack>
            ) : pendingVerbete ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  icon={<DescriptionIcon />}
                  label={pendingVerbete.name}
                  color="warning"
                  variant="outlined"
                />
                <Button size="small" onClick={() => verbeteInput.current?.click()}>
                  {t('field.verbeteReplace')}
                </Button>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                startIcon={<DescriptionIcon />}
                onClick={() => verbeteInput.current?.click()}
                sx={{ minHeight: 56, fontWeight: 700 }}
              >
                {t('field.verbeteAdd')}
              </Button>
            )}

            <input
              ref={verbeteInput}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onChooseVerbete?.(file);
                event.target.value = '';
              }}
              data-testid="verbete-input"
            />
          </Box>
        </>
      )}
    </Stack>
  );
};

// ── Review ────────────────────────────────────────────────────────────────────

export interface ReviewSectionProps extends SectionProps {
  warnings: EventReportWarningCode[];
  onEditStep: (step: StepId) => void;
  pendingFileCount: number;
}

export const ReviewSection = ({
  draft,
  lookups,
  warnings,
  onEditStep,
  pendingFileCount,
}: ReviewSectionProps) => {
  const rules = eventReportRules(draft.type);

  const rows: Array<{ step: StepId; label: string; value: string }> = [
    {
      step: 'whenWhere',
      label: t('field.date'),
      value: [
        draft.occurredOn,
        `${timeOfDay(draft.startedAt) || '--:--'} → ${timeOfDay(draft.endedAt) || '--:--'}`,
        draft.locationType ? locationTypeLabel(draft.locationType) : '',
        lookups.locality?.name ?? '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...(rules.hasOccurrenceTimes
      ? [
          {
            step: 'times' as StepId,
            label: t('step.times'),
            value: `${
              OCCURRENCE_TIME_FIELDS.filter((field) => draft[field]).length
            } / ${OCCURRENCE_TIME_FIELDS.length}`,
          },
        ]
      : []),
    {
      step: 'crew',
      label: t('field.crew'),
      value:
        draft.crew
          .map((member) => personName(lookups, member.userId))
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      step: 'vehicles',
      label: rules.maxVehicles === 1 ? t('field.vehicle') : t('field.vehiclesUsed'),
      value:
        draft.vehicles.length === 0
          ? '—'
          : `${draft.vehicles
              .map((line) => vehicleLabel(lookups, line.vehicleId))
              .filter(Boolean)
              .join(' · ')} · ${totalKilometres(draft.vehicles)} km`,
    },
    {
      step: 'victims',
      label: rules.maxVictims === 1 ? t('step.victims') : t('step.victimsPlural'),
      value:
        draft.victims.length === 0
          ? '—'
          : draft.victims
              .map((victim) => {
                const where =
                  victim.destinationKind === VictimDestinationKind.HOSPITAL
                    ? lookups.hospitalsById[victim.destinationHospitalId ?? '']?.name ??
                      destinationLabel(victim.destinationKind)
                    : destinationLabel(victim.destinationKind);
                return `${genderLabel(victim.gender)}, ${victim.age} → ${where}`;
              })
              .join(' | '),
    },
    {
      step: 'narrative',
      label: t('step.narrative'),
      value: `${draft.operationalReport ? '✓' : '—'} · ${pendingFileCount}`,
    },
  ];

  return (
    <Stack spacing={2}>
      {warnings.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.25}>
            {warnings.map((warning) => (
              <span key={warning}>{warningLabel(warning)}</span>
            ))}
            <strong>{t('hint.canSaveIncomplete')}</strong>
          </Stack>
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack divider={<Divider />}>
          {rows.map((row) => (
            <Stack
              key={row.step + row.label}
              direction="row"
              spacing={1.5}
              alignItems="center"
              onClick={() => onEditStep(row.step)}
              sx={{ p: 1.75, cursor: 'pointer', minHeight: 58 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                  {row.label.toUpperCase()}
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>{row.value}</Typography>
              </Box>
              <ChevronRightIcon sx={{ color: 'text.disabled' }} />
            </Stack>
          ))}
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.disabled' }}>
        <EventIcon fontSize="small" />
        <Typography variant="caption">{t('hint.numberOnSave')}</Typography>
      </Stack>
    </Stack>
  );
};

// ── The clinical record ───────────────────────────────────────────────────────

/**
 * CHAMU, ABCDE and the sets of vital signs, on the report itself.
 *
 * The same controls the live screens use, over the report's own draft rather
 * than a run — extracted into `VitalField.tsx` precisely so a coordinator
 * correcting a temperature at a desk and a crew taking one at 3am cannot be
 * looking at two different fields.
 *
 * Present only where the type has a clinical record. A support report never
 * reaches this section, and `retypeDraft` clears it if the type changes.
 */
export const ClinicalSection = ({ draft, patch }: SectionProps) => {
  const [index, setIndex] = useState(0);
  const assessments = draft.assessments ?? [];
  const findings = (draft.abcde ?? {}) as AbcdeFindings;
  const current = assessments[index];

  const setAssessment = (at: number, changes: Partial<AssessmentInput>) =>
    patch({
      assessments: assessments.map((entry, position) =>
        position === at ? { ...entry, ...changes } : entry,
      ),
    });

  const add = () => {
    patch({ assessments: [...assessments, { takenAt: new Date().toISOString() }] });
    setIndex(assessments.length);
  };

  const remove = (at: number) => {
    patch({ assessments: assessments.filter((_, position) => position !== at) });
    setIndex((position) => Math.max(0, Math.min(position, assessments.length - 2)));
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <SectionLabel>{t('live.chamu')}</SectionLabel>
        <Stack spacing={2}>
          {CHAMU_FIELDS.map((field) => (
            <TextField
              key={field}
              fullWidth
              multiline
              minRows={2}
              label={chamuLabel(field)}
              value={draft[field] ?? ''}
              onChange={(event) =>
                patch({ [field]: event.target.value } as Partial<EventReportInput>)
              }
            />
          ))}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <SectionLabel>{t('live.abcde')}</SectionLabel>
        <Stack spacing={2.5}>
          {ABCDE_BANDS.map((band) => (
            <Box key={band}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{abcdeBandLabel(band)}</Typography>
              <AbcdeStatusPicker
                band={band}
                findings={findings}
                onChange={(next) => patch({ abcde: next })}
              />
            </Box>
          ))}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <SectionLabel>{t('live.vitals')}</SectionLabel>

        {assessments.length === 0 ? (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={add}
            sx={{ minHeight: 56, fontWeight: 700 }}
          >
            {t('live.addAssessment')}
          </Button>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <IconButton
                disabled={index === 0}
                aria-label={t('action.back')}
                onClick={() => setIndex((at) => Math.max(0, at - 1))}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>
                {t('live.assessmentPager')} {index + 1} {t('step.of')} {assessments.length}
              </Typography>
              <IconButton
                disabled={index >= assessments.length - 1}
                aria-label={t('action.next')}
                onClick={() => setIndex((at) => Math.min(assessments.length - 1, at + 1))}
              >
                <ChevronRightIcon />
              </IconButton>
              <IconButton aria-label={t('live.addAssessment')} onClick={add}>
                <AddIcon />
              </IconButton>
            </Stack>

            {current && (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="flex-end">
                  <TextField
                    fullWidth
                    type="time"
                    label={t('field.takenAt')}
                    value={timeOfDay(current.takenAt)}
                    onChange={(event) => {
                      const instant = composeInstant(draft.occurredOn, event.target.value);
                      if (instant) setAssessment(index, { takenAt: instant });
                    }}
                  />
                  <NowButton
                    label={t('action.now')}
                    onClick={() =>
                      setAssessment(index, { takenAt: new Date().toISOString() })
                    }
                  />
                </Stack>

                {VITAL_FIELDS.map((field) => (
                  <VitalControl
                    key={field.key}
                    field={field}
                    assessment={current}
                    onChange={(changes) => setAssessment(index, changes)}
                  />
                ))}

                <TextField
                  fullWidth
                  label={t('field.bodyPosition')}
                  value={current.bodyPosition ?? ''}
                  onChange={(event) =>
                    setAssessment(index, { bodyPosition: event.target.value })
                  }
                />

                <Button
                  color="error"
                  startIcon={<CloseIcon />}
                  onClick={() => remove(index)}
                  sx={{ minHeight: 48 }}
                >
                  {t('live.removeAssessment')}
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
};

/** The code a filed report is known by, for the confirmation screen. */
export const reportCode = formatEventReportCode;


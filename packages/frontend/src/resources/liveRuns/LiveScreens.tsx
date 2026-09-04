import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocaleState } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MicIcon from '@mui/icons-material/Mic';
import MicNoneIcon from '@mui/icons-material/MicNone';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PlaceIcon from '@mui/icons-material/Place';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import {
  EVENT_LOCATION_TYPES,
  EventLocationType,
  EventReportType,
  GENDERS,
  Gender,
  Locale,
  Locality,
  MAX_LIVE_RUN_ADDRESS_LENGTH,
  MAX_LIVE_RUN_COMPLAINT_LENGTH,
  MAX_VICTIM_AGE,
  MIN_VICTIM_AGE,
  MaterialItem,
  OCCURRENCE_TIME_FIELDS,
  SNS_NUMBER_REGEX,
  VehicleType,
  VictimDestinationKind,
  materialItemDisplayName,
} from '@redinfo/shared';
import {
  destinationLabel,
  genderLabel,
  liveBlockerLabel,
  liveWarningLabel,
  locationTypeLabel,
  occurrenceTimeLabel,
} from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { useOnline } from '../../hooks/useOnline';
import { ReportLookups, personName, vehicleLabel } from '../eventReports/useReportLookups';
import { LocalityPicker, localityLabel, rememberLocality } from '../eventReports/LocalityPicker';
import { DestinationChoice, HospitalPicker } from '../eventReports/HospitalPicker';
import { timeOfDay } from '../eventReports/reportDraft';
import {
  BarcodeScanErrorKind,
  BarcodeScanner,
  isCameraScanSupported,
} from '../../components/MaterialPicker/BarcodeScanner';
import { PhotoQueueHandle } from './usePhotoQueue';
import { LiveRunHandle } from './useLiveRun';
import { DictationControl } from './useDictation';
import { useLiveMaterialsCatalogue } from './useLiveMaterialsCatalogue';
import { AssessmentEditor } from './AssessmentEditor';
import { HandoverSheet } from './HandoverSheet';
import { PhotoTray } from './PhotoTray';

/**
 * The six live screens, over one shared prop bag.
 *
 * Directly analogous to `ReportSections.tsx`: each screen is a self-contained
 * group with no opinion about layout or navigation, so the shell can move
 * between them and none of them has to know what the others contain.
 *
 * Every screen is one scrolling column. There is deliberately **no responsive
 * branch** — the report editor has two layouts because coordinators use it at a
 * desk, and nobody runs a live emergency at a desk.
 */
export interface LiveScreenProps {
  form: LiveRunHandle;
  lookups: ReportLookups;
  photos: PhotoQueueHandle;
  dictation: DictationControl;
  /** The locality resolved for display, from the picker or from the lookups. */
  locality: Locality | null;
  onPickLocality: (locality: Locality) => void;
  /**
   * Where the victim lives, resolved for display — asked only when the scene
   * itself is not the home, and never sent anywhere but the verbete.
   */
  homeLocality: Locality | null;
  onPickHomeLocality: (locality: Locality) => void;
  /** Opens the assessment screen, which is reached rather than walked into. */
  onOpenAssessment: () => void;
  onRefusedFiles?: (messages: string[]) => void;
  /**
   * The assessment screen's own way back to `scene`, once vitals are done.
   * Only ever set when the screen actually on display is `assessment` — see
   * `LiveRunPage`.
   */
  onDone?: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8125rem', mb: 0.75 }}>
    {children}
  </Typography>
);

/** The locality control, shared by intake and scene — and, with its own label, by the victim's home. */
const LocalityField = ({
  label,
  locality,
  onPick,
}: {
  label?: string;
  locality: Locality | null;
  onPick: (locality: Locality) => void;
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const resolvedLabel = label ?? t('field.locality');

  return (
    <Box>
      <Label>{resolvedLabel}</Label>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<PlaceIcon />}
        endIcon={<ChevronRightIcon />}
        onClick={() => setOpen(true)}
        sx={{ minHeight: 56, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 600 }}
      >
        <Box sx={{ flex: 1 }}>{locality ? localityLabel(locality) : t('action.search')}</Box>
      </Button>
      <LocalityPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          rememberLocality(picked);
          onPick(picked);
          setOpen(false);
        }}
      />
    </Box>
  );
};

// ── Intake ────────────────────────────────────────────────────────────────────

/**
 * What CODU said, taken while still on the call.
 *
 * The most fields of any live screen, and the only screen where that is right:
 * the crew is stationary, on the phone, writing down what they are being told.
 * Everything after this is captured in motion.
 */
export const IntakeScreen = ({ form, lookups, locality, onPickLocality }: LiveScreenProps) => {
  const t = useT();
  const { run } = form;

  return (
    <Stack spacing={2.5}>
      <Box>
        <Label>{t('field.coduReference')}</Label>
        <TextField
          fullWidth
          value={run.externalReference ?? ''}
          onChange={(event) => form.patchLater({ externalReference: event.target.value })}
          inputProps={{
            inputMode: 'numeric',
            'aria-label': t('field.coduReference'),
            autoFocus: true,
          }}
        />
      </Box>

      <Box>
        <Label>{t('field.chiefComplaint')}</Label>
        <TextField
          fullWidth
          value={run.chiefComplaint ?? ''}
          onChange={(event) => form.patchLater({ chiefComplaint: event.target.value })}
          inputProps={{
            maxLength: MAX_LIVE_RUN_COMPLAINT_LENGTH,
            'aria-label': t('field.chiefComplaint'),
          }}
        />
      </Box>

      <Box>
        <Label>{t('field.occurrenceAddress')}</Label>
        <TextField
          fullWidth
          value={run.identity?.occurrenceAddress ?? ''}
          onChange={(event) =>
            form.patchIdentityLater({ occurrenceAddress: event.target.value })
          }
          inputProps={{
            maxLength: MAX_LIVE_RUN_ADDRESS_LENGTH,
            'aria-label': t('field.occurrenceAddress'),
          }}
        />
      </Box>

      <LocalityField locality={locality} onPick={onPickLocality} />

      <Box>
        <Label>{t('field.referencePoints')}</Label>
        <TextField
          fullWidth
          value={run.identity?.referencePoints ?? ''}
          onChange={(event) => form.patchIdentityLater({ referencePoints: event.target.value })}
          inputProps={{
            maxLength: MAX_LIVE_RUN_ADDRESS_LENGTH,
            'aria-label': t('field.referencePoints'),
          }}
        />
      </Box>

      <Divider />

      <Box>
        <Label>{t('field.gender')}</Label>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={run.victimGender ?? null}
          onChange={(_event, value) => form.patch({ victimGender: (value as Gender) ?? null })}
          sx={{ '& .MuiToggleButton-root': { minHeight: 60, fontWeight: 700 } }}
        >
          {GENDERS.map((gender) => (
            <ToggleButton key={gender} value={gender}>
              {genderLabel(t, gender)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Label>{t('field.age')}</Label>
        <TextField
          fullWidth
          value={run.victimAge ?? ''}
          onChange={(event) => {
            const parsed = Number(event.target.value.replace(/\D/g, ''));
            form.patchLater({
              victimAge: Number.isFinite(parsed) && event.target.value !== '' ? parsed : null,
            });
          }}
          inputProps={{
            inputMode: 'numeric',
            'aria-label': t('field.age'),
            min: MIN_VICTIM_AGE,
            max: MAX_VICTIM_AGE,
          }}
        />
      </Box>

      <Box>
        <Label>{t('field.vehicle')}</Label>
        <Autocomplete
          // A transport vehicle must never be selectable on a live run — this is
          // always an emergency, so the offered list is emergency vehicles only.
          // `value` still reads off the unfiltered `lookups.vehicles`, though: a
          // run that already points at a transport vehicle (set some other way,
          // or before this rule existed) must still render its name here rather
          // than silently going blank because it fell out of `options`.
          options={lookups.vehicles.filter((vehicle) => vehicle.vehicleType === VehicleType.EMERGENCY)}
          value={lookups.vehicles.find((vehicle) => vehicle.id === run.vehicleId) ?? null}
          getOptionLabel={(vehicle) => vehicleLabel(lookups, vehicle.id)}
          onChange={(_event, vehicle) => form.patch({ vehicleId: vehicle?.id ?? null })}
          renderInput={(params) => <TextField {...params} />}
        />
      </Box>

      <Box>
        <Label>{t('step.crew')}</Label>
        <Autocomplete
          multiple
          options={lookups.candidates}
          value={lookups.candidates.filter((person) =>
            (run.crew ?? []).some((member) => member.userId === person.id),
          )}
          getOptionLabel={(person) => personName(lookups, person.id)}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_event, people) =>
            form.patch({
              // The role is not asked for here. On a live run the crew is who is
              // in the vehicle; posts come from the shift, and typing one at 3am
              // is a field nobody would fill in.
              crew: people.map((person) => ({ userId: person.id, roleName: null })),
            })
          }
          renderInput={(params) => <TextField {...params} />}
        />
      </Box>
    </Stack>
  );
};

// ── En route ──────────────────────────────────────────────────────────────────

/**
 * Deliberately near-empty.
 *
 * Nobody types in a moving ambulance. What the passenger needs on the way is the
 * destination and the reason for the call, in type large enough to read while
 * being thrown around — and one enormous button when they arrive.
 */
export const EnRouteScreen = ({ form, locality }: LiveScreenProps) => {
  const t = useT();
  const { run } = form;
  const address = run.identity?.occurrenceAddress?.trim();

  return (
    <Stack spacing={3} sx={{ pt: 2 }}>
      <Box>
        <Label>{t('field.occurrenceAddress')}</Label>
        <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.25 }}>
          {address || (locality ? locality.name : '—')}
        </Typography>
        {locality && address && (
          <Typography color="text.secondary">{localityLabel(locality)}</Typography>
        )}
      </Box>

      {run.identity?.referencePoints && (
        <Box>
          <Label>{t('field.referencePoints')}</Label>
          <Typography sx={{ fontSize: '1.125rem' }}>{run.identity.referencePoints}</Typography>
        </Box>
      )}

      <Divider />

      <Box>
        <Label>{t('field.chiefComplaint')}</Label>
        <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.3 }}>
          {run.chiefComplaint || '—'}
        </Typography>
      </Box>

      {(run.victimGender || run.victimAge !== null) && (
        <Stack direction="row" spacing={1}>
          {run.victimGender && (
            <Chip label={genderLabel(t, run.victimGender)} sx={{ minHeight: 44, fontWeight: 700 }} />
          )}
          {run.victimAge !== null && run.victimAge !== undefined && (
            <Chip
              label={`${run.victimAge} ${t('field.age').toLowerCase()}`}
              sx={{ minHeight: 44, fontWeight: 700 }}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
};

// ── On scene ──────────────────────────────────────────────────────────────────

/**
 * The identifying details, and the paperwork.
 *
 * Confirmed on arrival rather than taken from the call: "type of location"
 * moved here from intake because it is only really known once the crew can
 * see it. When it turns out not to be the victim's own home, a second
 * locality and a second address appear — the home address, kept only for the
 * verbete and purged with the rest of identity, never carried onto the
 * report.
 */
export const SceneScreen = ({
  form,
  locality,
  onPickLocality,
  homeLocality,
  onPickHomeLocality,
  photos,
  onOpenAssessment,
  onRefusedFiles,
}: LiveScreenProps) => {
  const t = useT();
  const { run } = form;
  const sns = run.identity?.victimSnsNumber ?? '';
  const snsInvalid = sns.trim() !== '' && !SNS_NUMBER_REGEX.test(sns.trim());
  // Not asked until the crew is actually there to see it — the CODU call
  // reports what was said, not what is confirmed.
  const notHome = Boolean(run.locationType) && run.locationType !== EventLocationType.HOME;

  // Age is captured earlier, on intake — DOB is only asked once the crew is at
  // the scene. Pre-filling January 1st of the birth year the age implies opens
  // the native date picker on roughly the right year instead of on today,
  // saving a lot of scrolling. Guarded so it fires at most once per mount: a
  // crew that deliberately clears the field afterwards must not be fought.
  const dobAutoFilled = useRef(false);
  useEffect(() => {
    if (dobAutoFilled.current) return;
    if (run.identity?.victimDateOfBirth) {
      dobAutoFilled.current = true;
      return;
    }
    if (!Number.isFinite(run.victimAge)) return;
    dobAutoFilled.current = true;
    const birthYear = new Date().getFullYear() - (run.victimAge as number);
    form.patchIdentity({ victimDateOfBirth: `${birthYear}-01-01` });
    // Runs once per mount only — see the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack spacing={2.5}>
      <Button
        fullWidth
        variant="contained"
        color="secondary"
        startIcon={<MonitorHeartIcon />}
        onClick={onOpenAssessment}
        sx={{ minHeight: 64, fontWeight: 800, borderRadius: 2 }}
      >
        {t('live.assessmentOpen')}
      </Button>

      <Box>
        <Label>{t('field.locationType')}</Label>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={run.locationType ?? null}
          onChange={(_event, value) =>
            form.patch({ locationType: (value as EventLocationType) ?? null })
          }
          sx={{
            flexWrap: 'wrap',
            gap: 1,
            '& .MuiToggleButton-root': { minHeight: 60, fontWeight: 700 },
          }}
        >
          {EVENT_LOCATION_TYPES.map((type) => (
            <ToggleButton key={type} value={type}>
              {locationTypeLabel(t, type)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Label>{t('field.victimName')}</Label>
        <TextField
          fullWidth
          value={run.identity?.victimName ?? ''}
          onChange={(event) => form.patchIdentityLater({ victimName: event.target.value })}
          inputProps={{ 'aria-label': t('field.victimName') }}
        />
      </Box>

      <Box>
        <Label>{t('field.victimDateOfBirth')}</Label>
        <TextField
          fullWidth
          type="date"
          value={run.identity?.victimDateOfBirth ?? ''}
          onChange={(event) =>
            form.patchIdentity({ victimDateOfBirth: event.target.value || null })
          }
          inputProps={{ 'aria-label': t('field.victimDateOfBirth') }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('field.victimDateOfBirthFromAgeHint')}
        </Typography>
      </Box>

      <Box>
        <Label>{t('field.victimSnsNumber')}</Label>
        <TextField
          fullWidth
          value={sns}
          error={snsInvalid}
          helperText={snsInvalid ? t('problem.LIVE_RUN_INVALID_SNS') : undefined}
          onChange={(event) => form.patchIdentityLater({ victimSnsNumber: event.target.value })}
          inputProps={{
            inputMode: 'numeric',
            maxLength: 12,
            'aria-label': t('field.victimSnsNumber'),
          }}
        />
      </Box>

      <Box>
        <Label>{t('field.occurrenceAddress')}</Label>
        <TextField
          fullWidth
          value={run.identity?.occurrenceAddress ?? ''}
          onChange={(event) =>
            form.patchIdentityLater({ occurrenceAddress: event.target.value })
          }
          inputProps={{
            maxLength: MAX_LIVE_RUN_ADDRESS_LENGTH,
            'aria-label': t('field.occurrenceAddress'),
          }}
        />
      </Box>

      <LocalityField locality={locality} onPick={onPickLocality} />

      {notHome && (
        <>
          {/*
            Two locations on one run: where the occurrence is, and where the
            victim lives. The home address is captured for the verbete alone —
            it never reaches the report, exactly like the rest of identity.
          */}
          <Box>
            <Label>{t('field.victimHomeAddress')}</Label>
            <TextField
              fullWidth
              value={run.identity?.victimHomeAddress ?? ''}
              onChange={(event) =>
                form.patchIdentityLater({ victimHomeAddress: event.target.value })
              }
              inputProps={{
                maxLength: MAX_LIVE_RUN_ADDRESS_LENGTH,
                'aria-label': t('field.victimHomeAddress'),
              }}
            />
          </Box>

          <LocalityField
            label={t('field.victimHomeLocality')}
            locality={homeLocality}
            onPick={onPickHomeLocality}
          />
        </>
      )}

      <Divider />

      <PhotoTray queue={photos} onRefused={onRefusedFiles} />
    </Stack>
  );
};

// ── Assessment ────────────────────────────────────────────────────────────────

export const AssessmentScreen = ({ form, dictation, onDone }: LiveScreenProps) => (
  <AssessmentEditor form={form} dictation={dictation} onDone={onDone} />
);

// ── Transport ─────────────────────────────────────────────────────────────────

/**
 * Where the victim went, or why nobody went anywhere.
 *
 * `HospitalPicker` reused whole, including the no-transport outcomes — they are
 * one question, and splitting them would make "recusou transporte" feel like a
 * failure to answer. A live run is always an emergency, so the picker is told
 * that explicitly and never offers "treated on scene".
 */
export const TransportScreen = ({ form, lookups, locality }: LiveScreenProps) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { run } = form;

  const hospitalName = run.destinationHospitalId
    ? lookups.hospitalsById[run.destinationHospitalId]?.name
    : undefined;

  const choose = (choice: DestinationChoice) => {
    form.patch({
      destinationKind: choice.destinationKind,
      destinationHospitalId: choice.destinationHospitalId,
    });
    setOpen(false);
  };

  return (
    <Stack spacing={2.5} sx={{ pt: 1 }}>
      <Box>
        <Label>{t('field.destination')}</Label>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LocalHospitalIcon />}
          endIcon={<ChevronRightIcon />}
          onClick={() => setOpen(true)}
          sx={{ minHeight: 64, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 700 }}
        >
          <Box sx={{ flex: 1 }}>
            {run.destinationKind
              ? hospitalName ?? destinationLabel(t, run.destinationKind)
              : t('action.search')}
          </Box>
        </Button>
      </Box>

      {run.destinationKind === VictimDestinationKind.HOSPITAL && hospitalName && (
        <Typography color="text.secondary">{destinationLabel(t, run.destinationKind)}</Typography>
      )}

      <HospitalPicker
        open={open}
        locality={locality}
        reportType={EventReportType.EMERGENCY}
        onClose={() => setOpen(false)}
        onPick={choose}
      />
    </Stack>
  );
};

// ── Closing ───────────────────────────────────────────────────────────────────

/**
 * The chronology, what is missing, and what is still to be sent.
 *
 * Warnings and blockers are shown apart, and that separation is the screen's
 * whole job: a blocker is something a report cannot exist without, and a warning
 * is something the crew will finish on the report page. Mixing them would make
 * "no vital signs" look like it stops an ambulance going back into service.
 */
export const ClosingScreen = ({ form, lookups, photos, locality, dictation }: LiveScreenProps) => {
  const t = useT();
  const { run } = form;
  const [handoverOpen, setHandoverOpen] = useState(false);

  return (
    <Stack spacing={2.5}>
      {/*
        At the top, above everything else on the closing screen: at the
        hospital the crew has to read data out loud to the front desk and to
        triage, and that happens before the narrative gets written, not after.
      */}
      <Button
        fullWidth
        variant="contained"
        color="secondary"
        startIcon={<LocalHospitalIcon />}
        onClick={() => setHandoverOpen(true)}
        sx={{ minHeight: 64, fontWeight: 800, borderRadius: 2 }}
      >
        {t('live.handover.open')}
      </Button>

      <HandoverSheet
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        form={form}
        lookups={lookups}
      />

      {/*
        The account of the call, plain text, with a microphone.
        Deliberately not the rich editor: nobody applies a bullet list one-handed
        at 3am, and a `contenteditable` is the worst possible target for
        inserting a dictated transcript. It arrives on the report as a paragraph
        and is finished there, where a keyboard exists.
      */}
      <Box>
        <Label>{t('field.narrative')}</Label>
        <TextField
          fullWidth
          multiline
          minRows={4}
          value={run.capture?.notes ?? ''}
          onChange={(event) => form.patchCaptureLater({ notes: event.target.value })}
          inputProps={{ 'aria-label': t('field.narrative') }}
          InputProps={{
            endAdornment: dictation.available ? (
              <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>
                <IconButton
                  aria-label={
                    dictation.listening && dictation.activeField === 'notes'
                      ? t('live.dictating')
                      : t('live.dictate')
                  }
                  aria-pressed={dictation.listening && dictation.activeField === 'notes'}
                  color={
                    dictation.listening && dictation.activeField === 'notes'
                      ? 'primary'
                      : 'default'
                  }
                  onClick={() =>
                    dictation.start('notes', {
                      current: run.capture?.notes ?? '',
                      onChange: (text) => form.patchCaptureLater({ notes: text }),
                    })
                  }
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  {dictation.listening && dictation.activeField === 'notes' ? (
                    <MicIcon />
                  ) : (
                    <MicNoneIcon />
                  )}
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{t('live.chronology')}</Typography>
        <Stack spacing={1}>
          {OCCURRENCE_TIME_FIELDS.map((field) => (
            <Stack key={field} direction="row" alignItems="baseline" spacing={1}>
              <Typography sx={{ flex: 1, color: 'text.secondary' }}>
                {occurrenceTimeLabel(t, field)}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: run[field] ? 'text.primary' : 'text.disabled',
                }}
              >
                {run[field] ? timeOfDay(run[field]) : t('live.notMarked')}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {form.blockers.length > 0 && (
        <Alert severity="warning">
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('live.closeBlocked')}</Typography>
          <Stack spacing={0.25}>
            {form.blockers.map((code) => (
              <span key={code}>{liveBlockerLabel(t, code)}</span>
            ))}
          </Stack>
        </Alert>
      )}

      {form.warnings.length > 0 && (
        <Alert severity="info">
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('live.closeWarnings')}</Typography>
          <Stack spacing={0.25}>
            {form.warnings.map((code) => (
              <span key={code}>{liveWarningLabel(t, code)}</span>
            ))}
          </Stack>
        </Alert>
      )}

      {photos.pending.length > 0 && (
        <Alert
          severity="info"
          action={
            <Button size="small" onClick={photos.flush} sx={{ fontWeight: 700 }}>
              {t('sync.retry')}
            </Button>
          }
        >
          {photos.pending.length === 1
            ? t('live.photoPending')
            : `${photos.pending.length} ${t('live.photosPending')}`}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <Typography sx={{ flex: 1, color: 'text.secondary' }}>
              {t('field.locality')}
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>
              {locality ? localityLabel(locality) : '—'}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Typography sx={{ flex: 1, color: 'text.secondary' }}>
              {t('field.destination')}
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>
              {run.destinationKind ? destinationLabel(t, run.destinationKind) : '—'}
            </Typography>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
};

// ── Materials (#209) ────────────────────────────────────────────────────────

/**
 * The live material log — a favourites grid and a barcode scanner, both
 * appending taps to `form.materials` rather than editing a quantity.
 *
 * Opened from the bottom bar's badge rather than walked into: logging what is
 * spent happens throughout a run, on whichever screen the crew is on, not on
 * one screen of it — so this is a sheet over the shell, not one of the six.
 *
 * The favourites grid is the offline-safe half of `MaterialPicker` (#207):
 * `useLiveMaterialsCatalogue` reads the device's own cached copy first, so a
 * dead spot never empties the grid, and refreshes it whenever the connection
 * allows. Full-text search is deliberately not offered here — a favourite
 * tile and a barcode are the two ways #209 promises to reach an item
 * one-handed; the long tail is the report editor's job, once the crew is back
 * at a desk.
 */
export const MaterialsSheet = ({
  open,
  onClose,
  form,
}: {
  open: boolean;
  onClose: () => void;
  form: LiveRunHandle;
}) => {
  const t = useT();
  const [locale] = useLocaleState();
  const online = useOnline();
  const catalogue = useLiveMaterialsCatalogue();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  // Items resolved off a barcode scan, kept only so a scanned item's name
  // still shows in the log below even when it is not one of the favourites.
  const [scannedItems, setScannedItems] = useState<Record<string, MaterialItem>>({});
  const cameraSupported = useRef(isCameraScanSupported()).current;

  const itemsById = useMemo(() => {
    const map: Record<string, MaterialItem> = { ...scannedItems };
    for (const item of catalogue.favourites) map[item.id] = item;
    return map;
  }, [catalogue.favourites, scannedItems]);

  const name = (item: MaterialItem) => materialItemDisplayName(item, locale as Locale);
  const countOf = (materialItemId: string) =>
    form.materials.filter((entry) => entry.materialItemId === materialItemId).length;

  const tap = (item: MaterialItem) => {
    form.recordMaterialTap(item.id);
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId((current) => (current === item.id ? null : current)), 600);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
  };

  const handleDetect = (code: string) => {
    catalogue
      .findByBarcode(code)
      .then((item) => {
        setScanMessage(null);
        setScannedItems((current) => ({ ...current, [item.id]: item }));
        tap(item);
        // The scanner stays open — a crew scanning a shelf of boxes should
        // not have to reopen it after every item.
      })
      .catch(() => {
        setScannerOpen(false);
        setScanMessage(online ? t('materialPicker.barcodeNotFound') : t('live.materials.scanOffline'));
      });
  };

  const handleScanError = (kind: BarcodeScanErrorKind) => {
    setScannerOpen(false);
    setScanMessage(
      kind === 'denied' ? t('materialPicker.cameraDenied') : t('materialPicker.cameraUnsupported'),
    );
  };

  const entries = form.materials;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>{t('live.materials.title')}</Box>
        <IconButton onClick={onClose} aria-label={t('live.materials.close')}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {catalogue.favourites.length === 0 && !catalogue.loading && (
            <Typography variant="body2" color="text.secondary">
              {t('live.materials.noFavourites')}
            </Typography>
          )}

          {catalogue.favourites.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: 1,
              }}
            >
              {catalogue.favourites.map((item) => {
                const count = countOf(item.id);
                return (
                  <Paper
                    key={item.id}
                    component="button"
                    type="button"
                    onClick={() => tap(item)}
                    elevation={0}
                    sx={{
                      minHeight: 72,
                      p: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.5,
                      border: 2,
                      borderColor: count > 0 ? 'primary.main' : 'divider',
                      backgroundColor: count > 0 ? 'primary.50' : 'background.paper',
                      color: 'text.primary',
                      cursor: 'pointer',
                      font: 'inherit',
                      transform: justAddedId === item.id ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 150ms ease, background-color 150ms ease',
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', textAlign: 'center' }}>
                      {name(item)}
                    </Typography>
                    {count > 0 && <Chip size="small" color="primary" label={count} />}
                  </Paper>
                );
              })}
            </Box>
          )}

          {cameraSupported && (
            <Button
              fullWidth
              variant="outlined"
              startIcon={<QrCodeScannerIcon />}
              onClick={() => {
                setScanMessage(null);
                setScannerOpen(true);
              }}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              {t('materialPicker.scanButton')}
            </Button>
          )}

          {scanMessage && <Alert severity="warning">{scanMessage}</Alert>}

          <Divider />

          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>
              {t('materialPicker.linesTitle')}
            </Typography>
            {entries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('materialPicker.linesEmpty')}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {entries
                  .map((entry, index) => ({ entry, index }))
                  .reverse()
                  .map(({ entry, index }) => {
                    const item = itemsById[entry.materialItemId];
                    const label = item ? name(item) : t('live.materials.unknownItem');
                    return (
                      <Stack
                        key={`${entry.materialItemId}-${entry.at}-${index}`}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }} noWrap>
                            {label}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {timeOfDay(entry.at)}
                        </Typography>
                        <IconButton
                          size="small"
                          aria-label={`${t('action.remove')} — ${label}`}
                          onClick={() => form.removeMaterialTap(index)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    );
                  })}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1 }}>{t('materialPicker.scanTitle')}</Box>
          <IconButton onClick={() => setScannerOpen(false)} aria-label={t('materialPicker.closeScan')}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {scannerOpen && <BarcodeScanner onDetect={handleDetect} onError={handleScanError} />}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('materialPicker.scanHint')}
          </Typography>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

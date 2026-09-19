import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import {
  CERTIFICATION_LABEL,
  CERTIFICATION_TYPES,
  CertificationType,
  TransportPlanningLane,
  TripCrewCandidate,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

export interface CrewDialogTarget {
  lane: TransportPlanningLane;
  /** The journey's number within its vehicle's day — what the lane calls
   * itself, so the dialog names the same thing the planner clicked. */
  journeyNumber: number;
  /** ISO date the board is showing. */
  date: string;
}

const candidateName = (candidate: TripCrewCandidate) => `${candidate.firstName} ${candidate.lastName}`.trim();

/**
 * Who crews one journey (#235).
 *
 * The same crew normally works the same vehicle all day, so "apply to every
 * journey of this vehicle" is on by default — but crew is still stored per
 * `Trip`, because the afternoon round genuinely does change hands and the
 * board has to be able to say so. See `AddTripCrewMemberInput.applyToVehicleDay`.
 *
 * Nobody is hidden from the picker. An absent person, or one already committed
 * to another journey, is listed and flagged; adding them anyway takes a
 * recorded reason, the same override precedent as the roster and vehicle
 * occupancy. Certification is likewise shown, never enforced here — crew
 * composition is ranked on read by `checkTripCrew`, since a journey is crewed
 * one person at a time and cannot satisfy "two TAT" on the first click.
 */
export const CrewDialog = ({
  target,
  onClose,
  onSaved,
}: {
  target: CrewDialogTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [candidates, setCandidates] = useState<TripCrewCandidate[]>([]);
  const [candidate, setCandidate] = useState<TripCrewCandidate | null>(null);
  const [role, setRole] = useState<CertificationType>(CertificationType.TAT);
  const [overrideReason, setOverrideReason] = useState('');
  const [applyToVehicleDay, setApplyToVehicleDay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const date = target?.date;
  useEffect(() => {
    if (!date) return;
    setError(null);
    apiFetch<TripCrewCandidate[]>(`/trips/crew-candidates?date=${date}`)
      .then(setCandidates)
      .catch((cause) =>
        setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.crewCandidatesFailed')),
      );
  }, [date, t]);

  const lane = target?.lane;
  const alreadyOnThisJourney = useMemo(
    () => new Set((lane?.crewMembers ?? []).map((member) => member.userId)),
    [lane],
  );
  const options = useMemo(
    () => candidates.filter((c) => !alreadyOnThisJourney.has(c.userId)),
    [candidates, alreadyOnThisJourney],
  );

  const reset = useCallback(() => {
    setCandidate(null);
    setOverrideReason('');
    setError(null);
    setSaving(false);
  }, []);

  if (!target || !lane) return null;

  const requirement = lane.crewRequirement;
  const requirementLabel = `${requirement.minimumCrew}× ${CERTIFICATION_LABEL[requirement.minimumCertification]}`;
  const crewIssues = lane.issues.filter(
    (issue) => issue.code.startsWith('CREW_') || issue.code === 'VEHICLE_NOT_EMERGENCY',
  );
  // Only an absence needs a reason on file. Being short of the certification
  // bar is a ranked finding, not a write-time refusal, so it must never gate
  // the button — that is what would force a planner to fake a reason.
  const needsOverrideReason = !!candidate?.absent;

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = async () => {
    if (!candidate) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/trips/${lane.trip.id}/crew`, {
        method: 'POST',
        body: {
          userId: candidate.userId,
          role,
          overrideReason: overrideReason.trim() || undefined,
          applyToVehicleDay,
        },
      });
      reset();
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.crewAddFailed'));
      setSaving(false);
    }
  };

  const handleRemove = async (crewMemberId: string) => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/trips/${lane.trip.id}/crew/${crewMemberId}`, { method: 'DELETE' });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.crewRemoveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('transportPlanning.crewDialogTitle', { number: target.journeyNumber })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity={crewIssues.length ? 'error' : 'info'} icon={false}>
            <Typography variant="body2" fontWeight={600}>
              {t('transportPlanning.crewRequirementHint', { requirement: requirementLabel })}
            </Typography>
            {requirement.requiresEmergencyVehicle && (
              <Typography variant="body2">{t('transportPlanning.crewRequiresEmergencyVehicle')}</Typography>
            )}
            {crewIssues.map((issue, index) => (
              <Typography key={index} variant="body2">
                {issue.message}
              </Typography>
            ))}
          </Alert>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t('transportPlanning.crewCurrentTitle')}
            </Typography>
            {lane.crewMembers.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('transportPlanning.noCrew')}
              </Typography>
            )}
            <Stack spacing={0.5}>
              {lane.crewMembers.map((member) => (
                <Stack key={member.id} direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ minWidth: 0 }} noWrap>
                    {`${member.firstName} ${member.lastName}`.trim() || member.userId}
                  </Typography>
                  <Chip size="small" variant="outlined" label={CERTIFICATION_LABEL[member.role]} sx={{ height: 20 }} />
                  {member.certifications.length === 0 && (
                    <Chip size="small" color="warning" label={t('transportPlanning.crewNoCertifications')} sx={{ height: 20 }} />
                  )}
                  {member.overrideReason && (
                    <Tooltip title={member.overrideReason}>
                      <EventBusyIcon fontSize="small" color="warning" />
                    </Tooltip>
                  )}
                  <IconButton
                    size="small"
                    sx={{ ml: 'auto' }}
                    disabled={saving}
                    aria-label={t('transportPlanning.crewRemoveButton')}
                    onClick={() => handleRemove(member.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Typography variant="subtitle2">{t('transportPlanning.crewAddTitle')}</Typography>
          <Autocomplete
            options={options}
            value={candidate}
            getOptionLabel={candidateName}
            isOptionEqualToValue={(option, value) => option.userId === value.userId}
            groupBy={(option) =>
              option.onRoster ? t('transportPlanning.crewOnRoster') : t('transportPlanning.crewOffRoster')
            }
            onChange={(_event, value) => {
              setCandidate(value);
              // Pre-select the strongest certification they actually hold, so
              // the common case is one click and the role recorded is never a
              // rank they cannot fill.
              const best = [...CERTIFICATION_TYPES]
                .reverse()
                .find((type) => value?.certifications.includes(type));
              if (best) setRole(best);
            }}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.userId}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                    {candidateName(option)}
                  </Typography>
                  {option.certifications.map((type) => (
                    <Chip key={type} size="small" variant="outlined" label={CERTIFICATION_LABEL[type]} sx={{ height: 18 }} />
                  ))}
                  {option.absent && (
                    <Chip size="small" color="warning" label={t('transportPlanning.crewAbsent')} sx={{ height: 18 }} />
                  )}
                  {option.crewingTripIds.length > 0 && (
                    <Chip
                      size="small"
                      color="default"
                      label={t('transportPlanning.crewAlreadyCrewing', { count: option.crewingTripIds.length })}
                      sx={{ height: 18, ml: 'auto' }}
                    />
                  )}
                </Stack>
              </Box>
            )}
            renderInput={(params) => <TextField {...params} label={t('transportPlanning.crewPersonLabel')} />}
          />

          <TextField
            select
            label={t('transportPlanning.crewRoleLabel')}
            value={role}
            onChange={(e) => setRole(e.target.value as CertificationType)}
          >
            {CERTIFICATION_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {CERTIFICATION_LABEL[type]}
              </MenuItem>
            ))}
          </TextField>

          {needsOverrideReason && (
            <TextField
              label={t('transportPlanning.assignDialogOverrideReasonLabel')}
              helperText={t('transportPlanning.crewAbsentHint')}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          )}

          <FormControlLabel
            control={
              <Checkbox checked={applyToVehicleDay} onChange={(e) => setApplyToVehicleDay(e.target.checked)} />
            }
            label={t('transportPlanning.crewApplyToVehicleDay')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t('transportPlanning.crewDialogClose')}</Button>
        <Button
          variant="contained"
          disabled={!candidate || saving || (needsOverrideReason && !overrideReason.trim())}
          onClick={handleAdd}
        >
          {t('transportPlanning.crewAddButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

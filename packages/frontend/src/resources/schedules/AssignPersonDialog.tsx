import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  AvailabilityWindowRole,
  CERTIFICATION_LABEL,
  formatRoleCapacity,
  holdsCertification,
  ScheduleCandidate,
  ScheduleCandidatesResponse,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { formatDayLabel, toIsoDate } from '../../utils/dates';

export interface AssignTarget {
  date: string;
  slot: number;
  shiftLabel: string;
  /** Null when the window defines no roles. */
  role: AvailabilityWindowRole | null;
}

const fullName = (person: ScheduleCandidate) => `${person.firstName} ${person.lastName}`;

const matches = (person: ScheduleCandidate, search: string) =>
  fullName(person).toLowerCase().includes(search.trim().toLowerCase());

/** Whether this person holds the target role's requirement, if it has one. */
const meetsRequirement = (person: ScheduleCandidate, role: AvailabilityWindowRole | null): boolean =>
  !role?.requiredCertification ||
  holdsCertification(person.certifications, role.requiredCertification, toIsoDate(new Date()));

/** Why this person is not the obvious pick, in one line, or nothing. */
const candidateNote = (person: ScheduleCandidate): string | null => {
  if (person.alreadyOnShift) {
    return person.currentRoleName
      ? `Already on ${person.currentRoleName} for this shift — one person cannot hold two places`
      : 'Already on this shift';
  }
  if (person.conflictLabel) return person.conflictLabel;
  if (person.availability === 'declined') {
    return 'Declared no availability this window — agree it with them before assigning';
  }
  if (person.availability === 'pending') return 'Has not responded to this window';
  return person.dutyCount > 0
    ? `${person.dutyCount} ${person.dutyCount === 1 ? 'duty' : 'duties'} already this window`
    : null;
};

const CandidateRow = ({
  person,
  role,
  override,
  onAssign,
  busy,
}: {
  person: ScheduleCandidate;
  role: AvailabilityWindowRole | null;
  override: boolean;
  onAssign: () => void;
  busy: boolean;
}) => {
  const note = candidateNote(person);
  const needsException = !meetsRequirement(person, role);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {fullName(person)}
          </Typography>
          {person.isDriver && (
            <Chip
              size="small"
              variant="outlined"
              color="success"
              icon={<DirectionsCarIcon fontSize="small" />}
              label="Driver"
            />
          )}
          {person.availability === 'declined' && (
            <Chip size="small" variant="outlined" color="warning" label="Declined" />
          )}
          {needsException && role?.requiredCertification && (
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              icon={<WarningAmberIcon fontSize="small" />}
              label={`No ${CERTIFICATION_LABEL[role.requiredCertification]}`}
            />
          )}
        </Stack>
        {note && (
          <Typography variant="caption" color="text.secondary">
            {note}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="outlined"
        color={needsException ? 'warning' : 'primary'}
        disabled={person.alreadyOnShift || busy}
        startIcon={needsException ? <SwapHorizIcon /> : override ? <SwapHorizIcon /> : undefined}
        onClick={onAssign}
      >
        {person.alreadyOnShift
          ? 'Assigned'
          : needsException
            ? 'Assign by exception'
            : override
              ? 'Assign as override'
              : 'Assign'}
      </Button>
    </Box>
  );
};

/**
 * Who to put on a shift.
 *
 * The people who submitted availability for exactly this shift come first and
 * assign in one action — the ordinary case stays two clicks. Everyone else is
 * behind a disclosure, plainly labelled: cover is often agreed by phone, so the
 * platform must not block it, but it must not pretend it was a submission
 * either.
 *
 * A role's `requiredCertification` is enforceable but not absolute — someone
 * who lacks it is listed and flagged rather than hidden, and assigning them
 * needs a typed reason, confirmed in a second step below.
 */
export const AssignPersonDialog = ({
  scheduleId,
  target,
  onClose,
  onAssigned,
}: {
  scheduleId: string;
  target: AssignTarget | null;
  onClose: () => void;
  onAssigned: () => void;
}) => {
  const [candidates, setCandidates] = useState<ScheduleCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<ScheduleCandidate | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        date: target.date,
        slot: String(target.slot),
        ...(target.role ? { roleId: target.role.id } : {}),
      });
      setCandidates(
        await apiFetch<ScheduleCandidatesResponse>(
          `/schedules/${scheduleId}/candidates?${query.toString()}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load who is available.');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, target]);

  useEffect(() => {
    setSearch('');
    setShowOthers(false);
    setCandidates(null);
    setPendingOverride(null);
    setOverrideReason('');
    void load();
  }, [load]);

  const assign = async (person: ScheduleCandidate, reason?: string) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/schedules/${scheduleId}/assignments`, {
        method: 'POST',
        body: {
          date: target.date,
          slot: target.slot,
          userId: person.id,
          ...(target.role ? { roleId: target.role.id } : {}),
          ...(reason ? { overrideReason: reason } : {}),
        },
      });
      setPendingOverride(null);
      setOverrideReason('');
      onAssigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign that person.');
    } finally {
      setBusy(false);
    }
  };

  const requestAssign = (person: ScheduleCandidate) => {
    if (!meetsRequirement(person, target?.role ?? null)) {
      setError(null);
      setOverrideReason('');
      setPendingOverride(person);
      return;
    }
    void assign(person);
  };

  const available = useMemo(
    () => (candidates?.available ?? []).filter((person) => matches(person, search)),
    [candidates, search],
  );
  const others = useMemo(
    () => (candidates?.others ?? []).filter((person) => matches(person, search)),
    [candidates, search],
  );

  if (!target) return null;

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <span>Assign · {target.role?.name ?? 'Crew'}</span>
            {target.role && (
              <Chip size="small" variant="outlined" label={formatRoleCapacity(target.role.maxPeople)} />
            )}
            {target.role?.requiredCertification && (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={`Requires ${CERTIFICATION_LABEL[target.role.requiredCertification]}`}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {formatDayLabel(target.date)} · {target.shiftLabel}
          </Typography>
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            size="small"
            label="Search personnel"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ mb: 2 }}
          />

          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2">Available for this shift</Typography>
                <Chip size="small" variant="outlined" color="success" label={available.length} />
              </Stack>
              {available.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Nobody submitted availability for this shift.
                </Typography>
              ) : (
                <Box sx={{ mb: 2 }}>
                  {available.map((person) => (
                    <CandidateRow
                      key={person.id}
                      person={person}
                      role={target.role}
                      override={false}
                      busy={busy}
                      onAssign={() => requestAssign(person)}
                    />
                  ))}
                </Box>
              )}

              <Divider sx={{ mb: 1 }} />

              <Button
                size="small"
                onClick={() => setShowOthers((value) => !value)}
                startIcon={showOthers ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ px: 0 }}
              >
                {showOthers ? 'Hide everyone else' : `Show everyone else (${others.length})`}
              </Button>

              <Collapse in={showOthers} unmountOnExit>
                <Alert severity="warning" sx={{ my: 1 }}>
                  Nobody here submitted availability for this shift. Assigning them is
                  recorded as an override, stamped with your name and the time.
                </Alert>
                {others.map((person) => (
                  <CandidateRow
                    key={person.id}
                    person={person}
                    role={target.role}
                    override
                    busy={busy}
                    onAssign={() => requestAssign(person)}
                  />
                ))}
              </Collapse>

              {target.role?.requiredCertification && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 2 }} alignItems="flex-start">
                  <WarningAmberIcon fontSize="small" sx={{ color: 'warning.dark' }} />
                  <Typography variant="caption" color="text.secondary">
                    People who do not hold the {CERTIFICATION_LABEL[target.role.requiredCertification]}{' '}
                    certification are listed rather than hidden — assigning one of them needs a reason,
                    recorded against the assignment.
                  </Typography>
                </Stack>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingOverride !== null} onClose={() => setPendingOverride(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Assign without the required certification?
        </DialogTitle>
        <DialogContent>
          {pendingOverride && target.role?.requiredCertification && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>
                {target.role.name} requires {CERTIFICATION_LABEL[target.role.requiredCertification]}.
              </strong>{' '}
              {fullName(pendingOverride)} does not hold it. Assigning them is recorded as an exception
              against this shift, stamped with your name and the time.
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            required
            label="Reason"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            helperText="Shown on the board and on the published schedule."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingOverride(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!overrideReason.trim() || busy}
            onClick={() => pendingOverride && void assign(pendingOverride, overrideReason.trim())}
          >
            Assign by exception
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

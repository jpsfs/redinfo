import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { AssignmentCompensationKind, ScheduleAssignment, ScheduleShiftBoard } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDayLabel } from '../../utils/dates';

export interface CompensationTarget {
  date: string;
  slot: number;
  shift: ScheduleShiftBoard;
}

const personName = (assignment: ScheduleAssignment) => `${assignment.user.firstName} ${assignment.user.lastName}`;

/**
 * A coordinator's classification for a whole shift's crew, in one pass
 * (`Action.MANAGE_COMPENSATION`) — the edit path #223/#245 never had.
 * Modelled on `AdjustShiftDialog`: same shape, same "resolve everything
 * client-side, then one save".
 *
 * `SALARY` rows are read-only — D2's absolute veto. On-contract-clock time
 * always resolves `SALARY`, and the coordinator cannot override it here: the
 * three-way control this dialog's name promises is really only ever
 * Volunteer/Paid, offered per person, with the on-clock rows shown but not
 * touchable. Left out of the save payload entirely, matching what
 * `PUT .../compensation` itself accepts (`SetShiftCompensationRequest`
 * rejects `SALARY` as an explicit choice).
 */
export const CompensationDialog = ({
  scheduleId,
  target,
  onClose,
  onSaved,
}: {
  scheduleId: string;
  target: CompensationTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [values, setValues] = useState<Record<string, AssignmentCompensationKind>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const initial: Record<string, AssignmentCompensationKind> = {};
    for (const assignment of target.shift.assignments) {
      initial[assignment.id] = assignment.compensation ?? AssignmentCompensationKind.VOLUNTEER;
    }
    setValues(initial);
    setError(null);
  }, [target]);

  if (!target) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/schedules/${scheduleId}/shifts/${target.date}/${target.slot}/compensation`, {
        method: 'PUT',
        body: {
          assignments: target.shift.assignments
            .filter((assignment) => assignment.compensation !== AssignmentCompensationKind.SALARY)
            .map((assignment) => ({
              assignmentId: assignment.id,
              compensation: values[assignment.id] ?? AssignmentCompensationKind.VOLUNTEER,
            })),
        },
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('compensationDialog.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {t('compensationDialog.title')}
        <Typography variant="body2" color="text.secondary">
          {formatDayLabel(t, target.date)} · {target.shift.label}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {t('compensationDialog.hint')}
        </Typography>

        <Stack spacing={1.5}>
          {target.shift.assignments.map((assignment) => {
            const isSalary = assignment.compensation === AssignmentCompensationKind.SALARY;
            const value = values[assignment.id] ?? AssignmentCompensationKind.VOLUNTEER;
            return (
              <Stack
                key={assignment.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {personName(assignment)}
                </Typography>
                {isSalary ? (
                  <Chip size="small" variant="outlined" label={t('compensationDialog.onContractClock')} />
                ) : (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={value}
                    disabled={busy}
                    onChange={(_event, next: AssignmentCompensationKind | null) => {
                      if (!next) return;
                      setValues((current) => ({ ...current, [assignment.id]: next }));
                    }}
                    aria-label={personName(assignment)}
                  >
                    <ToggleButton value={AssignmentCompensationKind.VOLUNTEER}>
                      {t('compensationDialog.optionVolunteer')}
                    </ToggleButton>
                    <ToggleButton value={AssignmentCompensationKind.PAID}>
                      {t('compensationDialog.optionPaid')}
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
            );
          })}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          {t('action.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('compensationDialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

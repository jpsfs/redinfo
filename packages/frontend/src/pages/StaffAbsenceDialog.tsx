import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { isValidStaffAbsenceTimeRange, StaffAbsence, StaffAbsenceKind } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';

const kindLabel = (t: (key: string) => string, kind: StaffAbsenceKind) => {
  switch (kind) {
    case StaffAbsenceKind.VACATION:
      return t('staffAbsences.kindVacation');
    case StaffAbsenceKind.SICK_LEAVE:
      return t('staffAbsences.kindSickLeave');
    case StaffAbsenceKind.OTHER_PAID_LEAVE:
    default:
      return t('staffAbsences.kindOtherPaidLeave');
  }
};

export interface StaffAbsenceDialogPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Kind + date range + notes for one absence block. Three ways in: selecting a
 * range on the grid or tapping a person's "+" on mobile (`person` preset,
 * `existing` absent), editing an existing block (`person` and `existing` both
 * set, from `existing.userId` — reassigning the person is not offered), or
 * the page-level "Add absence" button (`person` absent — a picker over
 * `people` decides who it's for). `startDate`/`endDate` are always re-editable
 * here regardless of how the dialog was opened, since a grid selection only
 * proposes a range. Full day is the default; a partial day (a medical
 * appointment, say) is opted into with the checkbox, only offered for other
 * paid leave on a single-day range — vacation and sick leave are always
 * whole days.
 */
export const StaffAbsenceDialog = ({
  open,
  person,
  people,
  startDate: initialStartDate,
  endDate: initialEndDate,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Preset when known (a grid selection, or editing). Omit to show a picker over `people`. */
  person?: StaffAbsenceDialogPerson | null;
  people: StaffAbsenceDialogPerson[];
  startDate: string;
  endDate: string;
  existing?: StaffAbsence | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const notify = useNotify();

  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<StaffAbsenceKind>(StaffAbsenceKind.VACATION);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [partialDay, setPartialDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPersonId(existing?.userId ?? person?.id ?? people[0]?.id ?? '');
    setKind(existing?.kind ?? StaffAbsenceKind.VACATION);
    setStartDate(existing?.startDate ?? initialStartDate);
    setEndDate(existing?.endDate ?? initialEndDate);
    setPartialDay(!!(existing?.startTime && existing?.endTime));
    setStartTime(existing?.startTime ?? '09:00');
    setEndTime(existing?.endTime ?? '10:00');
    setNotes(existing?.notes ?? '');
    // `people`/`person` intentionally excluded: they identify *who* opened the
    // dialog for, which never changes while it's open, so re-running this
    // every time the roster reference changes would stomp on a picker choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, initialStartDate, initialEndDate]);

  // A partial day only means something for a single date, and only for other
  // paid leave (vacation/sick leave are always whole days) — clearing it
  // lives in these change handlers, not a `useEffect` keyed on
  // startDate/endDate/kind: that effect would also fire on the initial
  // mount, before the load effect above's own `setPartialDay(true)` for an
  // existing partial-day absence has actually landed (both run against the
  // same stale first-render `kind`/dates), silently clobbering it back to
  // `false` right after it was set.
  const changeKind = (value: StaffAbsenceKind) => {
    setKind(value);
    if (value !== StaffAbsenceKind.OTHER_PAID_LEAVE) setPartialDay(false);
  };
  const changeStartDate = (value: string) => {
    setStartDate(value);
    if (value !== endDate) setPartialDay(false);
  };
  const changeEndDate = (value: string) => {
    setEndDate(value);
    if (value !== startDate) setPartialDay(false);
  };

  const timesValid = isValidStaffAbsenceTimeRange(
    kind,
    startDate,
    endDate,
    partialDay ? startTime : undefined,
    partialDay ? endTime : undefined,
  );

  const handleSave = async () => {
    if (!personId || !timesValid) return;
    setSaving(true);
    try {
      const times = partialDay ? { startTime, endTime } : { startTime: undefined, endTime: undefined };
      if (existing) {
        await apiFetch(`/staff-absences/${existing.id}`, {
          method: 'PATCH',
          body: { kind, startDate, endDate, ...times, notes: notes || undefined },
        });
      } else {
        await apiFetch('/staff-absences', {
          method: 'POST',
          body: { userId: personId, kind, startDate, endDate, ...times, notes: notes || undefined },
        });
      }
      notify(t('staffAbsences.saved'), { type: 'success' });
      onSaved();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('staffAbsences.saveFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await apiFetch(`/staff-absences/${existing.id}`, { method: 'DELETE' });
      notify(t('staffAbsences.deleted'), { type: 'info' });
      onSaved();
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('staffAbsences.deleteFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {existing ? t('staffAbsences.dialogTitleEdit') : t('staffAbsences.dialogTitleCreate')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {person ? (
            <Typography variant="body2" color="text.secondary">
              {t('staffAbsences.personLabel')}: {person.firstName} {person.lastName}
            </Typography>
          ) : (
            <TextField
              select
              size="small"
              label={t('staffAbsences.personLabel')}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              {people.map((candidate) => (
                <MenuItem key={candidate.id} value={candidate.id}>
                  {candidate.firstName} {candidate.lastName}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label={t('staffAbsences.kindLabel')}
            value={kind}
            onChange={(e) => changeKind(e.target.value as StaffAbsenceKind)}
          >
            {Object.values(StaffAbsenceKind).map((value) => (
              <MenuItem key={value} value={value}>
                {kindLabel(t, value)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            size="small"
            label={t('staffAbsences.startDateLabel')}
            value={startDate}
            onChange={(e) => changeStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size="small"
            label={t('staffAbsences.endDateLabel')}
            value={endDate}
            onChange={(e) => changeEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {kind === StaffAbsenceKind.OTHER_PAID_LEAVE && (
            <>
              <div>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={partialDay}
                      disabled={startDate !== endDate}
                      onChange={(e) => setPartialDay(e.target.checked)}
                    />
                  }
                  label={t('staffAbsences.partialDayLabel')}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  {t('staffAbsences.partialDayHint')}
                </Typography>
              </div>
              {partialDay && (
                <Stack direction="row" spacing={2}>
                  <TextField
                    type="time"
                    size="small"
                    fullWidth
                    label={t('staffAbsences.startTimeLabel')}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    error={!timesValid}
                  />
                  <TextField
                    type="time"
                    size="small"
                    fullWidth
                    label={t('staffAbsences.endTimeLabel')}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    error={!timesValid}
                  />
                </Stack>
              )}
            </>
          )}
          <TextField
            multiline
            minRows={2}
            size="small"
            label={t('staffAbsences.notesLabel')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: existing ? 'space-between' : 'flex-end', px: 3, pb: 2 }}>
        {existing && (
          <Button color="error" disabled={saving} onClick={() => void handleDelete()}>
            {t('staffAbsences.delete')}
          </Button>
        )}
        <Stack direction="row" spacing={1}>
          <Button disabled={saving} onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="contained" disabled={saving || !personId || !timesValid} onClick={() => void handleSave()}>
            {t('staffAbsences.save')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

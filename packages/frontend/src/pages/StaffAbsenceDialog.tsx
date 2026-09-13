import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { StaffAbsence, StaffAbsenceKind } from '@redinfo/shared';
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
 * Kind + date range + notes for one absence block — opened either by
 * dragging across a fresh range on the calendar (`existing` absent) or by
 * clicking an existing block (`existing` present, and deletable). A whole-row
 * save either way: `startDate`/`endDate` are re-editable here too, since the
 * drag only proposes a range, it doesn't have to be the final one.
 */
export const StaffAbsenceDialog = ({
  open,
  person,
  startDate: initialStartDate,
  endDate: initialEndDate,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  person: StaffAbsenceDialogPerson | null;
  startDate: string;
  endDate: string;
  existing?: StaffAbsence | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const notify = useNotify();

  const [kind, setKind] = useState<StaffAbsenceKind>(StaffAbsenceKind.VACATION);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(existing?.kind ?? StaffAbsenceKind.VACATION);
    setStartDate(existing?.startDate ?? initialStartDate);
    setEndDate(existing?.endDate ?? initialEndDate);
    setNotes(existing?.notes ?? '');
  }, [open, existing, initialStartDate, initialEndDate]);

  if (!person) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existing) {
        await apiFetch(`/staff-absences/${existing.id}`, {
          method: 'PATCH',
          body: { kind, startDate, endDate, notes: notes || undefined },
        });
      } else {
        await apiFetch('/staff-absences', {
          method: 'POST',
          body: { userId: person.id, kind, startDate, endDate, notes: notes || undefined },
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
          <Typography variant="body2" color="text.secondary">
            {t('staffAbsences.personLabel')}: {person.firstName} {person.lastName}
          </Typography>
          <TextField
            select
            size="small"
            label={t('staffAbsences.kindLabel')}
            value={kind}
            onChange={(e) => setKind(e.target.value as StaffAbsenceKind)}
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
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size="small"
            label={t('staffAbsences.endDateLabel')}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
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
          <Button variant="contained" disabled={saving} onClick={() => void handleSave()}>
            {t('staffAbsences.save')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

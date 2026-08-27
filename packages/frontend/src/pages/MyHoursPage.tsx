import { useCallback, useEffect, useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  CreateManualVolunteerHoursRequest,
  formatMinutes,
  MANUAL_VOLUNTEER_ACTIVITY_TYPES,
  MAX_MANUAL_HOURS_DESCRIPTION_LENGTH,
  MAX_MANUAL_HOURS_MINUTES,
  MyVolunteerHoursResponse,
  validateManualVolunteerHours,
  VolunteerActivityType,
  VolunteerHoursEntry,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { activityTypeLabel } from '../i18n/labels';
import { formatDayLabel } from '../utils/dates';

const emptyForm = (): CreateManualVolunteerHoursRequest => ({
  activityType: VolunteerActivityType.MEETING,
  date: new Date().toISOString().slice(0, 10),
  minutes: 60,
  description: '',
});

const EntryRow = ({ entry }: { entry: VolunteerHoursEntry }) => {
  const t = useT();
  return (
    <Stack
      component="li"
      direction="row"
      spacing={1.5}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, listStyle: 'none' }}
    >
      <Typography variant="body2" sx={{ minWidth: 90 }}>
        {formatDayLabel(t, entry.date)}
      </Typography>
      <Chip size="small" variant="outlined" label={activityTypeLabel(t, entry.activityType)} />
      {entry.source === 'MANUAL' && (
        <Chip size="small" color="secondary" variant="outlined" label={t('myHours.manualBadge')} />
      )}
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {formatMinutes(entry.minutes)}
      </Typography>
      {entry.flags.includes('RAN_OVER') && (
        <Chip size="small" color="info" variant="outlined" label={t('myHours.flagRanOver')} />
      )}
      {entry.flags.includes('POSSIBLY_LEFT_EARLY') && (
        <Chip size="small" color="warning" variant="outlined" label={t('myHours.flagPossiblyLeftEarly')} />
      )}
      {entry.correctionReason && (
        <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
          {t('myHours.correctedNotice', { reason: entry.correctionReason })}
        </Typography>
      )}
      {entry.description && (
        <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
          {entry.description}
        </Typography>
      )}
    </Stack>
  );
};

/**
 * Someone's own volunteer hours (#164): entries auto-generated from their
 * published duties, plus anything logged by hand for an activity that never
 * had a shift. The default is silent — a clean entry needs no action — so
 * this page is read-mostly, with logging the one thing a volunteer does here.
 */
export const MyHoursPage = () => {
  const t = useT();
  const [hours, setHours] = useState<MyVolunteerHoursResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateManualVolunteerHoursRequest>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHours(await apiFetch<MyVolunteerHoursResponse>('/volunteer-hours/me'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('myHours.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = () => {
    setForm(emptyForm());
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const validationError = validateManualVolunteerHours(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/volunteer-hours', { method: 'POST', body: form });
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('myHours.logFailed'));
    } finally {
      setSaving(false);
    }
  };

  const pending = hours?.entries.filter((e) => e.status === VolunteerHoursStatus.PENDING) ?? [];
  const approved = hours?.entries.filter((e) => e.status === VolunteerHoursStatus.APPROVED) ?? [];

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('myHours.pageTitle')} />
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h6">{t('myHours.heading')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 640 }}>
              {t('myHours.subheading')}
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            {t('myHours.logButton')}
          </Button>
        </Stack>

        {loading && <CircularProgress size={24} />}
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {hours && hours.entries.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('myHours.noneYet')}
          </Typography>
        )}

        {pending.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              {t('myHours.pendingHeading')} ({formatMinutes(hours!.totalPendingMinutes)})
            </Typography>
            <Stack component="ul" spacing={1} sx={{ p: 0, my: 1 }}>
              {pending.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </Stack>
          </>
        )}

        {approved.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              {t('myHours.approvedHeading')} ({formatMinutes(hours!.totalApprovedMinutes)})
            </Typography>
            <Stack component="ul" spacing={1} sx={{ p: 0, my: 1 }}>
              {approved.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </Stack>
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('myHours.logDialogTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              select
              label={t('myHours.activityTypeLabel')}
              value={form.activityType}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, activityType: e.target.value as VolunteerActivityType }))
              }
            >
              {MANUAL_VOLUNTEER_ACTIVITY_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {activityTypeLabel(t, type)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label={t('myHours.dateLabel')}
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="number"
              label={t('myHours.minutesLabel')}
              value={form.minutes}
              inputProps={{ min: 1, max: MAX_MANUAL_HOURS_MINUTES }}
              onChange={(e) => setForm((prev) => ({ ...prev, minutes: Number(e.target.value) }))}
            />
            <TextField
              label={t('myHours.descriptionLabel')}
              placeholder={t('myHours.descriptionPlaceholder')}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              multiline
              minRows={2}
              inputProps={{ maxLength: MAX_MANUAL_HOURS_DESCRIPTION_LENGTH }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            {t('myHours.logCancel')}
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {t('myHours.logSave')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

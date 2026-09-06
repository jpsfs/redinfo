import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  BulkVolunteerHoursEntryInput,
  CreateBulkVolunteerHoursRequest,
  CreateBulkVolunteerHoursResponse,
  MANUAL_VOLUNTEER_ACTIVITY_TYPES,
  MAX_MANUAL_HOURS_DESCRIPTION_LENGTH,
  minutesBetweenTimes,
  User,
  validateBulkVolunteerHours,
  VolunteerActivityType,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TimeRangeField } from '../../components/TimeRangeField';

const DEFAULT_START_MINUTE = 19 * 60;
const DEFAULT_END_MINUTE = 20 * 60;

const fullName = (person: User) => `${person.firstName} ${person.lastName}`;

interface RowOverride {
  startMinute: number;
  endMinute: number;
}

export interface BulkHoursDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: CreateBulkVolunteerHoursResponse) => void;
}

/**
 * A coordinator reporting the same activity (a meeting, a training session)
 * for several volunteers at once, via `POST /volunteer-hours/bulk` — see
 * that endpoint's own doc comment for why every resulting entry lands
 * APPROVED. One shared time span applies to everyone by default; ticking a
 * person open's a per-row `TimeRangeField` that overrides it for just them.
 */
export const BulkHoursDialog = ({ open, onClose, onSuccess }: BulkHoursDialogProps) => {
  const t = useT();
  const fullScreen = useIsMobile();

  const [activityType, setActivityType] = useState<VolunteerActivityType>(VolunteerActivityType.MEETING);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startMinute, setStartMinute] = useState(DEFAULT_START_MINUTE);
  const [endMinute, setEndMinute] = useState(DEFAULT_END_MINUTE);
  const [description, setDescription] = useState('');

  const [volunteers, setVolunteers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, RowOverride>>(new Map());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActivityType(VolunteerActivityType.MEETING);
    setDate(new Date().toISOString().slice(0, 10));
    setStartMinute(DEFAULT_START_MINUTE);
    setEndMinute(DEFAULT_END_MINUTE);
    setDescription('');
    setSearch('');
    setSelected(new Set());
    setOverrides(new Map());
    setError(null);
    setLoadError(null);

    setVolunteers(null);
    apiFetch<{ data: User[]; total: number }>('/users?isActive=true&perPage=500')
      .then((result) => setVolunteers(result.data))
      .catch((e) => setLoadError(e instanceof Error ? e.message : t('bulkHours.loadVolunteersFailed')));
  }, [open, t]);

  const filteredVolunteers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = volunteers ?? [];
    return needle ? rows.filter((person) => fullName(person).toLowerCase().includes(needle)) : rows;
  }, [volunteers, search]);

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => new Set([...prev, ...filteredVolunteers.map((person) => person.id)]));
  };

  const clearSelection = () => {
    setSelected(new Set());
    setOverrides(new Map());
  };

  const buildEntries = (): BulkVolunteerHoursEntryInput[] =>
    [...selected].map((userId) => {
      const override = overrides.get(userId);
      return override
        ? {
            userId,
            startMinute: override.startMinute,
            endMinute: override.endMinute,
            minutes: minutesBetweenTimes(override.startMinute, override.endMinute),
          }
        : { userId };
    });

  const handleSubmit = async () => {
    if (selected.size === 0) {
      setError(t('bulkHours.noneSelected'));
      return;
    }
    const request: CreateBulkVolunteerHoursRequest = {
      activityType,
      date,
      startMinute,
      endMinute,
      minutes: minutesBetweenTimes(startMinute, endMinute),
      description: description.trim() || undefined,
      entries: buildEntries(),
    };
    const validationError = validateBulkVolunteerHours(request);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<CreateBulkVolunteerHoursResponse>('/volunteer-hours/bulk', {
        method: 'POST',
        body: request,
      });
      onSuccess(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bulkHours.submitFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{t('bulkHours.dialogTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {t('bulkHours.dialogSubtitle')}
          </Typography>

          <TextField
            select
            label={t('bulkHours.activityTypeLabel')}
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as VolunteerActivityType)}
          >
            {MANUAL_VOLUNTEER_ACTIVITY_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {activityTypeLabel(t, type)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label={t('bulkHours.dateLabel')}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t('bulkHours.timeRangeLabel')}
            </Typography>
            <TimeRangeField
              startMinute={startMinute}
              endMinute={endMinute}
              onChange={(span) => {
                setStartMinute(span.startMinute);
                setEndMinute(span.endMinute);
              }}
            />
          </Stack>
          <TextField
            label={t(
              activityType === VolunteerActivityType.OTHER
                ? 'bulkHours.descriptionLabel'
                : 'bulkHours.descriptionLabelOptional',
            )}
            required={activityType === VolunteerActivityType.OTHER}
            placeholder={t('bulkHours.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            inputProps={{ maxLength: MAX_MANUAL_HOURS_DESCRIPTION_LENGTH }}
          />

          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2">
              {t('bulkHours.volunteersHeading')}
              {selected.size > 0 ? ` — ${t('bulkHours.selectedCount', { count: selected.size })}` : ''}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={selectAll} disabled={filteredVolunteers.length === 0}>
                {t('bulkHours.selectAll')}
              </Button>
              <Button size="small" onClick={clearSelection} disabled={selected.size === 0}>
                {t('bulkHours.clearSelection')}
              </Button>
            </Stack>
          </Stack>

          <TextField
            size="small"
            label={t('bulkHours.searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loadError && <Alert severity="warning">{loadError}</Alert>}
          {volunteers === null && !loadError && <CircularProgress size={24} />}

          {volunteers !== null && (
            <Stack
              component="ul"
              spacing={0.5}
              sx={{ p: 0, m: 0, maxHeight: 320, overflowY: 'auto', listStyle: 'none' }}
            >
              {filteredVolunteers.map((person) => {
                const isChecked = selected.has(person.id);
                const override = overrides.get(person.id);
                return (
                  <Stack
                    key={person.id}
                    component="li"
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Checkbox
                      size="small"
                      checked={isChecked}
                      onChange={() => toggle(person.id)}
                      inputProps={{ 'aria-label': fullName(person) }}
                    />
                    <Typography variant="body2" sx={{ minWidth: 160 }}>
                      {fullName(person)}
                    </Typography>
                    {isChecked && (
                      <>
                        <TimeRangeField
                          startMinute={override?.startMinute ?? startMinute}
                          endMinute={override?.endMinute ?? endMinute}
                          onChange={(span) =>
                            setOverrides((prev) => new Map(prev).set(person.id, span))
                          }
                        />
                        {override && (
                          <Tooltip title={t('bulkHours.resetRowTime')}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                setOverrides((prev) => {
                                  const next = new Map(prev);
                                  next.delete(person.id);
                                  return next;
                                })
                              }
                            >
                              <RestartAltIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('bulkHours.cancel')}
        </Button>
        <Button onClick={() => void handleSubmit()} variant="contained" disabled={saving}>
          {t('bulkHours.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

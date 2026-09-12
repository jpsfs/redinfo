import { useCallback, useEffect, useState } from 'react';
import { useNotify, usePermissions, useRecordContext } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Action,
  formatTimeOfDay,
  hasPermission,
  PaidStaffScheduleBlock,
  PaidStaffScheduleOverride,
  PaidStaffScheduleResponse,
  User,
  UserRole,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { weekdayAbbreviation } from '../../utils/dates';
import { TimeRangeField } from '../../components/TimeRangeField';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A paid staffer's on-the-clock hours (#245) — replaces #223's blanket
 * `isPaidStaff`-only gate for volunteer-hours generation. Shown only for a
 * paid-staff record, and only to a viewer who can `MANAGE_PERSONNEL`: this
 * page has no self-service reading path (that would be
 * `GET /paid-staff-schedule/me`, not built here), so there is nothing to show
 * anyone else.
 */
export const PaidStaffSchedulePanel = () => {
  const t = useT();
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole[]>();
  const notify = useNotify();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  const [schedule, setSchedule] = useState<PaidStaffScheduleResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addingBlock, setAddingBlock] = useState(false);
  const [blockDayOfWeek, setBlockDayOfWeek] = useState(1);
  const [blockStart, setBlockStart] = useState(8 * 60);
  const [blockEnd, setBlockEnd] = useState(16 * 60);
  const [blockEffectiveFrom, setBlockEffectiveFrom] = useState(today);

  const [addingOverride, setAddingOverride] = useState(false);
  const [overrideDate, setOverrideDate] = useState(today);
  const [overrideIsOff, setOverrideIsOff] = useState(true);
  const [overrideStart, setOverrideStart] = useState(8 * 60);
  const [overrideEnd, setOverrideEnd] = useState(16 * 60);
  const [overrideNotes, setOverrideNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const userId = record?.id;
  // Nothing to fetch, and nothing this viewer is entitled to see, unless
  // both hold — checked up front so an ordinary volunteer's own record (or
  // any record shown to a non-manager) never issues this request at all.
  const applicable = Boolean(userId && record?.isPaidStaff && canManage);

  const load = useCallback(async () => {
    if (!userId || !applicable) return;
    try {
      setSchedule(await apiFetch<PaidStaffScheduleResponse>(`/paid-staff-schedule/${userId}`));
    } catch (e) {
      setLoadError(e instanceof ApiError ? apiErrorLabel(t, e) : t('userShow.paidStaffScheduleLoadFailed'));
    }
  }, [userId, applicable, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!applicable) return null;

  const submitBlock = async () => {
    setSaving(true);
    try {
      await apiFetch(`/paid-staff-schedule/${userId}/blocks`, {
        method: 'POST',
        body: {
          dayOfWeek: blockDayOfWeek,
          startMinute: blockStart,
          endMinute: blockEnd,
          effectiveFrom: blockEffectiveFrom,
        },
      });
      notify(t('userShow.scheduleBlockSaved'), { type: 'success' });
      setAddingBlock(false);
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('userShow.scheduleBlockSaveFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (block: PaidStaffScheduleBlock) => {
    try {
      await apiFetch(`/paid-staff-schedule/${userId}/blocks/${block.id}`, { method: 'DELETE' });
      notify(t('userShow.scheduleBlockRemoved'), { type: 'info' });
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('userShow.scheduleBlockRemoveFailed'), {
        type: 'warning',
      });
    }
  };

  const submitOverride = async () => {
    setSaving(true);
    try {
      await apiFetch(`/paid-staff-schedule/${userId}/overrides`, {
        method: 'POST',
        body: {
          date: overrideDate,
          isOff: overrideIsOff,
          ...(overrideIsOff ? {} : { startMinute: overrideStart, endMinute: overrideEnd }),
          ...(overrideNotes.trim() ? { notes: overrideNotes.trim() } : {}),
        },
      });
      notify(t('userShow.scheduleOverrideSaved'), { type: 'success' });
      setAddingOverride(false);
      setOverrideNotes('');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('userShow.scheduleOverrideSaveFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (override: PaidStaffScheduleOverride) => {
    try {
      await apiFetch(`/paid-staff-schedule/${userId}/overrides/${override.id}`, { method: 'DELETE' });
      notify(t('userShow.scheduleOverrideRemoved'), { type: 'info' });
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('userShow.scheduleOverrideRemoveFailed'), {
        type: 'warning',
      });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6">{t('userShow.paidStaffScheduleHeading')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('userShow.paidStaffScheduleHint')}
      </Typography>

      {loadError && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{t('userShow.scheduleBlocksHeading')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingBlock((value) => !value)}>
          {t('userShow.addScheduleBlock')}
        </Button>
      </Stack>

      {(schedule?.blocks.length ?? 0) === 0 && !addingBlock && (
        <Typography variant="body2" color="text.secondary">
          {t('userShow.noScheduleBlocks')}
        </Typography>
      )}

      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {schedule?.blocks.map((block) => (
          <Stack
            key={block.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {weekdayAbbreviation(t, block.dayOfWeek)} · {formatTimeOfDay(block.startMinute)}–
                {formatTimeOfDay(block.endMinute)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('userShow.scheduleBlockEffectiveFrom')} {block.effectiveFrom}
                {block.effectiveTo ? ` – ${block.effectiveTo}` : ''}
              </Typography>
            </Box>
            <Tooltip title={t('action.remove')}>
              <IconButton size="small" onClick={() => void removeBlock(block)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>

      {addingBlock && (
        <Stack spacing={1.5} sx={{ mb: 2, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <TextField
            select
            size="small"
            label={t('userShow.scheduleBlockDayLabel')}
            value={blockDayOfWeek}
            onChange={(e) => setBlockDayOfWeek(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <MenuItem key={day} value={day}>
                {weekdayAbbreviation(t, day)}
              </MenuItem>
            ))}
          </TextField>
          <TimeRangeField
            startMinute={blockStart}
            endMinute={blockEnd}
            onChange={(span) => {
              setBlockStart(span.startMinute);
              setBlockEnd(span.endMinute);
            }}
          />
          <TextField
            type="date"
            size="small"
            label={t('userShow.scheduleBlockEffectiveFrom')}
            value={blockEffectiveFrom}
            onChange={(e) => setBlockEffectiveFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={saving} onClick={() => void submitBlock()}>
              {t('userShow.scheduleBlockSave')}
            </Button>
            <Button size="small" disabled={saving} onClick={() => setAddingBlock(false)}>
              {t('action.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{t('userShow.scheduleOverridesHeading')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingOverride((value) => !value)}>
          {t('userShow.addScheduleOverride')}
        </Button>
      </Stack>

      {(schedule?.overrides.length ?? 0) === 0 && !addingOverride && (
        <Typography variant="body2" color="text.secondary">
          {t('userShow.noScheduleOverrides')}
        </Typography>
      )}

      <Stack spacing={1}>
        {schedule?.overrides.map((override) => (
          <Stack
            key={override.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {override.date}
                </Typography>
                {override.isOff ? (
                  <Chip size="small" variant="outlined" label={t('userShow.scheduleOverrideDayOffChip')} />
                ) : (
                  <Typography variant="body2">
                    {formatTimeOfDay(override.startMinute ?? 0)}–{formatTimeOfDay(override.endMinute ?? 0)}
                  </Typography>
                )}
              </Stack>
              {override.notes && (
                <Typography variant="caption" color="text.secondary">
                  {override.notes}
                </Typography>
              )}
            </Box>
            <Tooltip title={t('action.remove')}>
              <IconButton size="small" onClick={() => void removeOverride(override)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>

      {addingOverride && (
        <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <TextField
            type="date"
            size="small"
            label={t('userShow.scheduleOverrideDateLabel')}
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={<Checkbox checked={overrideIsOff} onChange={(e) => setOverrideIsOff(e.target.checked)} />}
            label={t('userShow.scheduleOverrideDayOffLabel')}
          />
          {!overrideIsOff && (
            <TimeRangeField
              startMinute={overrideStart}
              endMinute={overrideEnd}
              onChange={(span) => {
                setOverrideStart(span.startMinute);
                setOverrideEnd(span.endMinute);
              }}
            />
          )}
          <TextField
            size="small"
            label={t('userShow.scheduleOverrideNotesLabel')}
            value={overrideNotes}
            onChange={(e) => setOverrideNotes(e.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={saving} onClick={() => void submitOverride()}>
              {t('userShow.scheduleOverrideSave')}
            </Button>
            <Button size="small" disabled={saving} onClick={() => setAddingOverride(false)}>
              {t('action.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
};

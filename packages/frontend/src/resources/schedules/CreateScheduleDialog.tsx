import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import {
  AvailabilityWindow,
  AvailabilityWindowStatus,
  Schedule,
  availabilityWindowLabel,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { WindowCategoryChip } from '../availability/WindowIdentity';

/**
 * Starting a schedule, from the windows that do not have one yet.
 *
 * Open windows are offered alongside closed ones on purpose: coordinators begin
 * arranging cover before submissions close, and refusing to start until then
 * would push that work off the platform.
 */
export const CreateScheduleDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const [windows, setWindows] = useState<AvailabilityWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [allWindows, schedules] = await Promise.all([
        apiFetch<{ data: AvailabilityWindow[] }>('/availability-windows?perPage=100'),
        apiFetch<{ data: Schedule[] }>('/schedules?perPage=100'),
      ]);
      const scheduled = new Set(schedules.data.map((schedule) => schedule.windowId));
      setWindows(allWindows.data.filter((window) => !scheduled.has(window.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('createScheduleDialog.loadFailed'));
      setWindows([]);
    }
  }, [t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const start = async (window: AvailabilityWindow) => {
    setBusy(true);
    setError(null);
    try {
      const schedule = await apiFetch<Schedule>('/schedules', {
        method: 'POST',
        body: { windowId: window.id },
      });
      onClose();
      navigate(`/schedules/${schedule.id}/show`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('createScheduleDialog.startFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('createScheduleDialog.title')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {windows === null ? (
          <CircularProgress size={24} />
        ) : windows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('createScheduleDialog.noneAvailable')}
          </Typography>
        ) : (
          <List disablePadding>
            {windows.map((window) => (
              <ListItemButton
                key={window.id}
                disabled={busy}
                onClick={() => void start(window)}
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <WindowCategoryChip category={window.category} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {availabilityWindowLabel(window)}
                      </Typography>
                      {window.status === AvailabilityWindowStatus.OPEN && (
                        <Typography variant="caption" color="text.secondary">
                          {t('createScheduleDialog.stillOpen')}
                        </Typography>
                      )}
                    </Stack>
                  }
                  secondary={formatDateRange(t, window.startDate, window.endDate)}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('action.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

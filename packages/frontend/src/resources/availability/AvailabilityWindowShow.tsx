import { useEffect, useState } from 'react';
import {
  DateField,
  FunctionField,
  Show,
  SimpleShowLayout,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import EventNoteIcon from '@mui/icons-material/EventNote';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';
import {
  Action,
  AvailabilityMatrixResponse,
  AvailabilityWindow,
  availabilityWindowLabel,
  AvailabilityWindowStatus,
  resolveCompensationOffer,
  Schedule,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { AvailabilityMatrix } from './AvailabilityMatrix';
import { CompensationOfferLine } from './CompensationOfferLine';
import { useScheduleForWindow } from './useScheduleForWindow';
import { WindowCompensationDialog } from './WindowCompensationDialog';
import { WindowIdentity, WindowRoleChips, WindowStatusChip } from './WindowIdentity';

/**
 * Closing a window is irreversible and immediately blocks submissions, so the
 * confirmation restates who has and hasn't answered — the count a coordinator
 * actually decides on.
 */
const CloseWindowButton = () => {
  const t = useT();
  const record = useRecordContext<AvailabilityWindow>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stats, setStats] = useState<AvailabilityMatrixResponse['responseStats'] | null>(null);

  useEffect(() => {
    if (!open || !record?.id) return;
    let cancelled = false;
    apiFetch<AvailabilityMatrixResponse>(
      `/availability/matrix?windowId=${encodeURIComponent(String(record.id))}`,
    )
      .then((matrix) => {
        if (!cancelled) setStats(matrix.responseStats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, record?.id]);

  if (!record || record.status !== AvailabilityWindowStatus.OPEN) return null;

  const handleClose = async () => {
    setClosing(true);
    try {
      await apiFetch(`/availability-windows/${record.id}/close`, { method: 'POST' });
      notify(t('windowShow.closed'), { type: 'success' });
      setOpen(false);
      refresh();
    } catch (e) {
      notify(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('windowShow.closeFailed'),
        { type: 'error' },
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        startIcon={<LockIcon />}
        onClick={() => setOpen(true)}
      >
        {t('windowShow.closeButton')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('windowShow.closeConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('windowShow.closeConfirmBody', {
              window: availabilityWindowLabel(record),
              dates: formatDateRange(t, record.startDate, record.endDate),
            })}
          </DialogContentText>
          {stats && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t('windowShow.closeStatsSummary', {
                submitted: stats.submitted,
                total: stats.total,
                declined: stats.declined,
                pending: stats.pending,
              })}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={closing}>
            {t('action.cancel')}
          </Button>
          <Button color="error" onClick={handleClose} disabled={closing}>
            {closing ? <CircularProgress size={18} /> : t('windowShow.closeButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const WindowHeader = () => {
  const t = useT();
  const record = useRecordContext<AvailabilityWindow>();
  const schedule = useScheduleForWindow(record?.id);
  if (!record) return null;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">
            {formatDateRange(t, record.startDate, record.endDate)}
          </Typography>
          <WindowStatusChip status={record.status} />
        </Box>
        <Box sx={{ mt: 0.5 }}>
          <WindowIdentity category={record.category} name={record.name} />
        </Box>
        <CompensationOfferSection record={record} schedule={schedule} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <ScheduleButton schedule={schedule} />
        <CloseWindowButton />
      </Box>
    </Box>
  );
};

/**
 * The window's own compensation offer (#246 Stage 2) — a discreet line,
 * shown only when one actually resolves, never a badge or a column. Every
 * viewer sees this (it is meant to be public, before submissions), but only
 * a coordinator holding `MANAGE_COMPENSATION` gets the edit affordance, and
 * only while the window is still `OPEN` — frozen once closed, per the
 * policy `AvailabilityWindowsService.setCompensation` enforces.
 */
const CompensationOfferSection = ({
  record,
  schedule,
}: {
  record: AvailabilityWindow;
  schedule: ReturnType<typeof useScheduleForWindow>;
}) => {
  const t = useT();
  const refresh = useRefresh();
  const capabilities = useCapabilities();
  const [dialogOpen, setDialogOpen] = useState(false);
  const offer = resolveCompensationOffer(schedule, record);
  const canEdit =
    capabilities.can([Action.MANAGE_COMPENSATION]) && record.status === AvailabilityWindowStatus.OPEN;

  if (!offer && !canEdit) return null;

  return (
    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <CompensationOfferLine offer={offer} />
      {canEdit && (
        <Button
          size="small"
          variant="text"
          startIcon={<AttachMoneyIcon fontSize="small" />}
          sx={{ textTransform: 'none' }}
          onClick={() => setDialogOpen(true)}
        >
          {offer ? t('windowShow.editCompensationOffer') : t('windowShow.setCompensationOffer')}
        </Button>
      )}
      {canEdit && (
        <WindowCompensationDialog
          window={record}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            refresh();
          }}
        />
      )}
    </Box>
  );
};

/**
 * Into the schedule for this window, starting it if there is none.
 *
 * Offered while the window is still open as well as after it closes:
 * coordinators begin arranging cover before submissions end, and the builder
 * says plainly that availability may still change.
 */
const ScheduleButton = ({ schedule }: { schedule: ReturnType<typeof useScheduleForWindow> }) => {
  const t = useT();
  const record = useRecordContext<AvailabilityWindow>();
  const notify = useNotify();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!record || schedule === undefined) return null;

  const open = async () => {
    if (schedule) {
      navigate(`/schedules/${schedule.id}/show`);
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<Schedule>('/schedules', {
        method: 'POST',
        body: { windowId: record.id },
      });
      navigate(`/schedules/${created.id}/show`);
    } catch (e) {
      notify(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('windowShow.startScheduleFailed'),
        { type: 'error' },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outlined"
      startIcon={busy ? <CircularProgress size={16} /> : <EventNoteIcon />}
      disabled={busy}
      onClick={() => void open()}
    >
      {schedule ? t('windowShow.openSchedule') : t('windowShow.buildSchedule')}
    </Button>
  );
};

const EmbeddedMatrix = () => {
  const record = useRecordContext<AvailabilityWindow>();
  if (!record?.id) return null;
  return <AvailabilityMatrix windowId={String(record.id)} />;
};

export const AvailabilityWindowShow = () => {
  const t = useT();
  return (
    <Show title={t('windowShow.pageTitle')}>
      <SimpleShowLayout>
        <WindowHeader />

        <FunctionField
          label={t('windowShow.rolesHeading')}
          render={(record: AvailabilityWindow) => <WindowRoleChips roles={record.roles} />}
        />

        <FunctionField
          source="openedBy"
          render={(record: AvailabilityWindow) =>
            record.openedBy ? `${record.openedBy.firstName} ${record.openedBy.lastName}` : '—'
          }
        />
        <DateField source="openedAt" showTime />
        <FunctionField
          source="closedBy"
          render={(record: AvailabilityWindow) =>
            record.closedBy ? `${record.closedBy.firstName} ${record.closedBy.lastName}` : '—'
          }
        />
        <DateField source="closedAt" showTime emptyText="—" />

        <Divider sx={{ my: 2 }} />

        <EmbeddedMatrix />
      </SimpleShowLayout>
    </Show>
  );
};

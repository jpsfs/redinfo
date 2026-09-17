import { Paper, Stack, Typography } from '@mui/material';
import { AvailabilityWindow, AvailabilityWindowActor, AvailabilityWindowStatus } from '@redinfo/shared';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { WindowIdentity, WindowStatusChip } from './WindowIdentity';

const actorName = (actor?: AvailabilityWindowActor | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';

/**
 * One availability window, as a stacked card — the mobile replacement for a
 * row of the desktop `Datagrid` on `/availability-windows`. Same fields as
 * the table, laid out for a thumb rather than a cursor.
 */
export const WindowListCard = ({
  window,
  onOpen,
}: {
  window: AvailabilityWindow;
  onOpen: () => void;
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const closed = window.status === AvailabilityWindowStatus.CLOSED;

  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
        >
          <WindowIdentity category={window.category} name={window.name} />
          <WindowStatusChip status={window.status} />
        </Stack>

        <Typography sx={{ fontWeight: 700 }}>
          {formatDateRange(t, window.startDate, window.endDate)}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {t('resources.availability-windows.fields.openedBy')}: {actorName(window.openedBy)} ·{' '}
          {new Date(window.openedAt).toLocaleString(intlLocale)}
        </Typography>

        {closed && (
          <Typography variant="caption" color="text.disabled">
            {t('resources.availability-windows.fields.closedBy')}: {actorName(window.closedBy)}
            {window.closedAt ? ` · ${new Date(window.closedAt).toLocaleString(intlLocale)}` : ''}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

import { Paper, Stack, Typography } from '@mui/material';
import { Schedule } from '@redinfo/shared';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { WindowCategoryChip } from '../availability/WindowIdentity';
import { actorName, FillBar, ScheduleFlags, ScheduleStatusChip } from './ScheduleIdentity';

/**
 * One schedule, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid` on `/schedules`. Same fields as the table, laid out for
 * a thumb rather than a cursor (mirrors `WindowListCard` on
 * `/availability-windows`).
 */
export const ScheduleListCard = ({
  schedule,
  onOpen,
}: {
  schedule: Schedule;
  onOpen: () => void;
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();

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
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <WindowCategoryChip category={schedule.window?.category} />
            <Typography variant="body2" color="text.secondary">
              {schedule.window?.name || '—'}
            </Typography>
          </Stack>
          <ScheduleStatusChip status={schedule.status} />
        </Stack>

        <Typography sx={{ fontWeight: 700 }}>
          {schedule.window
            ? formatDateRange(t, schedule.window.startDate, schedule.window.endDate)
            : '—'}
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FillBar schedule={schedule} />
          <ScheduleFlags schedule={schedule} />
        </Stack>

        {schedule.publishedAt && (
          <Typography variant="caption" color="text.secondary">
            {t('resources.schedules.fields.publishedBy')}: {actorName(schedule.publishedBy)} ·{' '}
            {new Date(schedule.publishedAt).toLocaleString(intlLocale)}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

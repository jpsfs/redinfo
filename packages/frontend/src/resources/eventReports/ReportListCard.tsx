import { Paper, Stack, Typography } from '@mui/material';
import { EventReport, formatEventReportCode } from '@redinfo/shared';
import { CategoryChip } from '../../components/CategoryChip';
import { reportTypeLabel, t } from '../../i18n/labels';
import { crewSummary, vehicleSummary } from './reportSummaries';
import { timeOfDay } from './reportDraft';

/**
 * One report, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid` on `/event-reports`. Same fields as the table (minus
 * victims/attachments, which neither surface shows), laid out for a thumb
 * rather than a cursor.
 */
export const ReportListCard = ({
  report,
  onOpen,
}: {
  report: EventReport;
  onOpen: () => void;
}) => (
  <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography
          sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatEventReportCode(report) ?? t('report.noNumberYet')}
        </Typography>
        <CategoryChip category={report.type} label={reportTypeLabel(report.type)} size="small" />
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {report.occurredOn} · {timeOfDay(report.startedAt) || '--:--'}–
        {timeOfDay(report.endedAt) || '--:--'}
        {report.locality ? ` · ${report.locality.name}` : ''}
      </Typography>

      <Typography variant="body2">{crewSummary(report)}</Typography>
      <Typography variant="caption" color="text.disabled">
        {vehicleSummary(report)}
      </Typography>
    </Stack>
  </Paper>
);

import { Chip, Stack, Typography } from '@mui/material';
import { EventReportType } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { reportTypeLabel } from '../../i18n/labels';
import { CategoryChip } from '../../components/CategoryChip';
import { STATISTICS_PERIOD_PRESETS, StatisticsPeriodPreset } from './statisticsPeriods';

export interface StatisticsFiltersProps {
  period: StatisticsPeriodPreset;
  onPeriodChange: (preset: StatisticsPeriodPreset) => void;
  /** Tabs 2 and 3 only. */
  showTypeFilter: boolean;
  type?: EventReportType;
  onTypeChange: (type: EventReportType | undefined) => void;
}

/** The one filter row above everything it scopes (§7) — period always, a type chip on tabs 2–3. */
export const StatisticsFilters = ({
  period,
  onPeriodChange,
  showTypeFilter,
  type,
  onTypeChange,
}: StatisticsFiltersProps) => {
  const t = useT();

  return (
    <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" sx={{ py: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {t('statistics.periodLabel')}
      </Typography>
      {STATISTICS_PERIOD_PRESETS.map((preset) => (
        <Chip
          key={preset}
          size="small"
          label={t(`statistics.period.${preset}`)}
          color={period === preset ? 'primary' : 'default'}
          variant={period === preset ? 'filled' : 'outlined'}
          onClick={() => onPeriodChange(preset)}
        />
      ))}
      {showTypeFilter && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 1 } }}>
            {t('statistics.typeLabel')}
          </Typography>
          <CategoryChip
            size="small"
            label={t('statistics.typeAll')}
            selected={!type}
            onClick={() => onTypeChange(undefined)}
          />
          {Object.values(EventReportType).map((value) => (
            <CategoryChip
              key={value}
              size="small"
              category={value}
              label={reportTypeLabel(t, value)}
              selected={type === value}
              onClick={() => onTypeChange(value)}
            />
          ))}
        </>
      )}
    </Stack>
  );
};

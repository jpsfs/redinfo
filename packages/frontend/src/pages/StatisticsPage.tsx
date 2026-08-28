import { useMemo, useState } from 'react';
import { Title, useGetIdentity } from 'react-admin';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { EventReportType } from '@redinfo/shared';
import { useT } from '../i18n/useT';
import { StatisticsFilters } from './statistics/StatisticsFilters';
import { StatisticsFilterState } from './statistics/useStatisticsTab';
import { DEFAULT_STATISTICS_PERIOD_PRESET, resolveStatisticsPeriod, StatisticsPeriodPreset } from './statistics/statisticsPeriods';
import { PeopleTab } from './statistics/PeopleTab';
import { ActivityTab } from './statistics/ActivityTab';
import { FleetTab } from './statistics/FleetTab';

type TabIndex = 0 | 1 | 2;

/**
 * `/statistics` — aggregate, organisation-wide numbers
 * (docs/plans/estatisticas-dashboards.md). Every authenticated member sees
 * all three tabs; there is no capability gate here or on the API routes
 * behind it, only the query range and an optional report-type filter.
 */
export const StatisticsPage = () => {
  const t = useT();
  const { identity } = useGetIdentity();
  const [tab, setTab] = useState<TabIndex>(0);
  const [period, setPeriod] = useState<StatisticsPeriodPreset>(DEFAULT_STATISTICS_PERIOD_PRESET);
  const [type, setType] = useState<EventReportType | undefined>(undefined);

  const { from, to } = useMemo(() => resolveStatisticsPeriod(period), [period]);
  const filters: StatisticsFilterState = useMemo(() => ({ from, to, type }), [from, to, type]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Title title={t('statistics.pageTitle')} />
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
        {t('statistics.pageTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('statistics.scope')}
      </Typography>

      <StatisticsFilters
        period={period}
        onPeriodChange={setPeriod}
        showTypeFilter={tab > 0}
        type={type}
        onTypeChange={setType}
      />

      <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" scrollButtons="auto">
        <Tab label={t('statistics.tabPeople')} />
        <Tab label={t('statistics.tabActivity')} />
        <Tab label={t('statistics.tabFleet')} />
      </Tabs>

      {tab === 0 && identity && <PeopleTab filters={filters} viewerId={String(identity.id)} />}
      {tab === 1 && <ActivityTab filters={filters} />}
      {tab === 2 && <FleetTab filters={filters} />}
    </Box>
  );
};

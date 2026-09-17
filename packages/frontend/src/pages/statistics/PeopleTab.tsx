import { Alert, CircularProgress } from '@mui/material';
import { PeopleStatistics, VolunteerActivityType } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import {
  colorCategoryEmergency,
  colorCategoryLocalSupport,
  colorCategoryMeeting,
  colorCategoryOther,
  colorCategoryCneSupport,
  colorCategoryTraining,
} from '../../layout/design-tokens';
import { HeroCard } from './HeroCard';
import { StatTile } from './StatTile';
import { ChartCard } from './ChartCard';
import { TableTwin } from './TableTwin';
import { StackedBar } from './StackedBar';
import { ChartLegend } from './ChartLegend';
import { MonthlyLineChart } from './MonthlyLineChart';
import { Sparkline } from './Sparkline';
import { Roster } from './Roster';
import { StatisticsGrid, GridItem } from './StatisticsGrid';
import { formatMonthLabel } from './monthLabel';
import { StatisticsFilterState, useStatisticsTab } from './useStatisticsTab';

const ACTIVITY_TYPE_COLOR: Record<VolunteerActivityType, string> = {
  [VolunteerActivityType.EMERGENCY]: colorCategoryEmergency,
  [VolunteerActivityType.LOCAL_SUPPORT]: colorCategoryLocalSupport,
  [VolunteerActivityType.CNE_SUPPORT]: colorCategoryCneSupport,
  [VolunteerActivityType.MEETING]: colorCategoryMeeting,
  [VolunteerActivityType.TRAINING]: colorCategoryTraining,
  [VolunteerActivityType.OTHER]: colorCategoryOther,
};

function fmt(value: number, locale: string, maximumFractionDigits = 0): string {
  return value.toLocaleString(locale, { maximumFractionDigits });
}

/** Tab 1 — Pessoas & Horas (docs/plans/estatisticas-dashboards.md §2). */
export const PeopleTab = ({ filters, viewerId }: { filters: StatisticsFilterState; viewerId: string }) => {
  const t = useT();
  const locale = useIntlLocale();
  const { data, loading, error } = useStatisticsTab<PeopleStatistics>('people', filters);

  if (loading && !data) return <CircularProgress size={24} sx={{ my: 4 }} />;
  if (error) return <Alert severity="error">{t('statistics.loadError')}</Alert>;
  if (!data) return null;

  const hoursDelta = data.viewer.hours - data.viewer.previousPeriodHours;
  const activeDelta = data.activeVolunteers - data.previousPeriodActiveVolunteers;
  const eventsPct = data.eventsWithParticipation > 0 ? Math.round((data.viewer.events / data.eventsWithParticipation) * 100) : 0;

  return (
    <StatisticsGrid>
      <GridItem span={12}>
        <HeroCard
          title={t('statistics.people.heroTitle')}
          subtitle={`${data.from} – ${data.to}`}
          value={fmt(data.totalApprovedHours, locale, 1)}
          unit="h"
          description={t('statistics.people.heroDescription', {
            volunteers: data.activeVolunteers,
            events: data.eventsWithParticipation,
            avg: fmt(data.averageHoursPerVolunteer, locale, 1),
          })}
        />
      </GridItem>

      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.people.yourHours')}
          value={fmt(data.viewer.hours, locale, 1)}
          unit="h"
          delta={`${hoursDelta >= 0 ? '+' : ''}${fmt(hoursDelta, locale, 1)} h ${t('statistics.vsPreviousPeriod')}`}
          deltaTone={hoursDelta >= 0 ? 'up' : 'neutral'}
        >
          <Sparkline data={data.viewer.monthlyHours.map((m) => ({ value: m.value }))} />
        </StatTile>
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.people.yourEvents')}
          value={String(data.viewer.events)}
          delta={
            data.viewer.rank
              ? t('statistics.people.yourEventsDelta', {
                  rank: data.viewer.rank,
                  total: data.viewer.totalVolunteers,
                  pct: eventsPct,
                })
              : t('statistics.people.yourEventsNoRank')
          }
        />
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.people.activeVolunteers')}
          value={String(data.activeVolunteers)}
          delta={`${activeDelta >= 0 ? '+' : ''}${activeDelta} ${t('statistics.vsPreviousPeriod')}`}
          deltaTone={activeDelta >= 0 ? 'up' : 'neutral'}
        />
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.people.averagePerVolunteer')}
          value={fmt(data.averageHoursPerVolunteer, locale, 1)}
          unit="h"
          delta={t('statistics.people.averagePerVolunteerDelta', {
            perMonth: fmt(data.averageHoursPerVolunteer / 12, locale, 1),
          })}
        />
      </GridItem>

      <GridItem span={7}>
        <ChartCard title={t('statistics.people.monthlyHoursTitle')}>
          <MonthlyLineChart data={data.monthlyHours} />
          <TableTwin
            headers={[t('statistics.monthColumn'), t('statistics.people.rosterColumnHours')]}
            rows={data.monthlyHours.map((m) => [formatMonthLabel(m.month, locale), fmt(m.value, locale, 1)])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={5}>
        <ChartCard
          title={t('statistics.people.byActivityTypeTitle')}
          subtitle={t('statistics.people.byActivityTypeSubtitle', { total: fmt(data.totalApprovedHours, locale, 1) })}
        >
          <StackedBar
            segments={data.hoursByActivityType.map((row) => ({
              key: row.activityType,
              value: row.hours,
              color: ACTIVITY_TYPE_COLOR[row.activityType],
            }))}
          />
          <ChartLegend
            items={data.hoursByActivityType
              .filter((row) => row.hours > 0)
              .map((row) => ({
                key: row.activityType,
                label: activityTypeLabel(t, row.activityType),
                color: ACTIVITY_TYPE_COLOR[row.activityType],
                value: `${fmt(row.hours, locale, 1)} h`,
              }))}
          />
          <TableTwin
            headers={[t('statistics.people.byActivityTypeTitle'), t('statistics.people.rosterColumnHours'), '%']}
            rows={data.hoursByActivityType.map((row) => [
              activityTypeLabel(t, row.activityType),
              fmt(row.hours, locale, 1),
              data.totalApprovedHours > 0 ? `${Math.round((row.hours / data.totalApprovedHours) * 100)}%` : '0%',
            ])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={12}>
        <ChartCard title={t('statistics.people.rosterTitle')} subtitle={t('statistics.people.rosterSubtitle')}>
          <Roster roster={data.roster} viewerId={viewerId} />
        </ChartCard>
      </GridItem>
    </StatisticsGrid>
  );
};

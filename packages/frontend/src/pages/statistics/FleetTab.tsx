import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { FleetStatistics, RESPONSE_LEG_KEYS } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { colorSequentialScale } from '../../layout/design-tokens';
import { HeroCard } from './HeroCard';
import { StatTile } from './StatTile';
import { ChartCard } from './ChartCard';
import { TableTwin } from './TableTwin';
import { StackedBar } from './StackedBar';
import { MonthlyLineChart } from './MonthlyLineChart';
import { ResponseLegsRangeChart } from './ResponseLegsRangeChart';
import { StatisticsGrid, GridItem } from './StatisticsGrid';
import { formatMonthLabel } from './monthLabel';
import { StatisticsFilterState, useStatisticsTab } from './useStatisticsTab';

const LEG_COLOR = [
  colorSequentialScale[2],
  colorSequentialScale[3],
  colorSequentialScale[4],
  colorSequentialScale[5],
];

function fmt(value: number, locale: string, maximumFractionDigits = 0): string {
  return value.toLocaleString(locale, { maximumFractionDigits });
}

/** Tab 3 — Frota & Resposta (docs/plans/estatisticas-dashboards.md §4). */
export const FleetTab = ({ filters }: { filters: StatisticsFilterState }) => {
  const t = useT();
  const locale = useIntlLocale();
  const { data, loading, error } = useStatisticsTab<FleetStatistics>('fleet', filters);

  if (loading && !data) return <CircularProgress size={24} sx={{ my: 4 }} />;
  if (error) return <Alert severity="error">{t('statistics.loadError')}</Alert>;
  if (!data) return null;

  const timeToSceneLeg = data.responseLegs.find((l) => l.leg === 'ACTIVATION_TO_SCENE');
  const timedPct = data.totalEmergencies > 0 ? Math.round((data.timedEmergencies / data.totalEmergencies) * 100) : 0;
  const sharedMax = Math.max(1, ...data.vehicles.flatMap((v) => v.monthlyKilometres.map((m) => m.value)));
  const legsSumMedian = data.responseLegs.reduce((s, l) => s + (l.medianMinutes ?? 0), 0);

  return (
    <StatisticsGrid>
      <GridItem span={12}>
        <HeroCard
          title={t('statistics.fleet.heroTitle')}
          subtitle={`${data.from} – ${data.to}`}
          value={fmt(data.totalKilometres, locale)}
          unit="km"
          description={t('statistics.fleet.heroDescription', {
            mean: fmt(data.kmPerEventMean, locale, 1),
            vehicles: data.vehicles.length,
          })}
        />
      </GridItem>

      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.fleet.kmPerEvent')}
          value={fmt(data.kmPerEventMean, locale, 1)}
          unit="km"
          delta={t('statistics.fleet.medianValue', { value: `${fmt(data.kmPerEventMedian, locale, 1)} km` })}
        />
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.fleet.timeToScene')}
          value={timeToSceneLeg?.medianMinutes != null ? fmt(timeToSceneLeg.medianMinutes, locale) : '—'}
          unit="min"
          delta={
            timeToSceneLeg?.p90Minutes != null
              ? t('statistics.fleet.medianAndP90', { p90: `${fmt(timeToSceneLeg.p90Minutes, locale)} min` })
              : undefined
          }
        />
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.fleet.totalDuration')}
          value={data.totalDurationMedianMinutes != null ? fmt(data.totalDurationMedianMinutes, locale) : '—'}
          unit="min"
          delta={t('statistics.fleet.totalDurationDelta')}
        />
      </GridItem>
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.fleet.timedEmergencies')}
          value={fmt(data.timedEmergencies, locale)}
          delta={t('statistics.fleet.timedEmergenciesDelta', { pct: timedPct, total: fmt(data.totalEmergencies, locale) })}
        />
      </GridItem>

      <GridItem span={12}>
        <ChartCard title={t('statistics.fleet.perVehicleTitle')} subtitle={t('statistics.fleet.perVehicleSubtitle')}>
          {data.vehicles.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('statistics.noData')}
            </Typography>
          ) : (
            data.vehicles.map((vehicle) => (
              <Box key={vehicle.vehicleId} sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {vehicle.numeroCauda}{' '}
                  <Typography component="span" variant="caption" color="text.secondary">
                    · {vehicle.licensePlate}
                  </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {t('statistics.fleet.totalInPeriod', { km: fmt(vehicle.totalKilometres, locale) })}
                </Typography>
                <MonthlyLineChart data={vehicle.monthlyKilometres} maxValue={sharedMax} height={140} />
              </Box>
            ))
          )}
          <TableTwin
            headers={[t('statistics.monthColumn'), ...data.vehicles.map((v) => v.numeroCauda)]}
            rows={
              data.vehicles[0]?.monthlyKilometres.map((m, i) => [
                formatMonthLabel(m.month, locale),
                ...data.vehicles.map((v) => v.monthlyKilometres[i]?.value ?? 0),
              ]) ?? []
            }
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard
          title={t('statistics.fleet.legsTitle')}
          subtitle={t('statistics.fleet.legsSubtitle')}
          footnote={
            data.totalDurationMedianMinutes != null
              ? t('statistics.fleet.legsFootnote', { sum: legsSumMedian, total: data.totalDurationMedianMinutes })
              : undefined
          }
        >
          <StackedBar
            segments={RESPONSE_LEG_KEYS.map((leg, i) => ({
              key: leg,
              value: data.responseLegs.find((l) => l.leg === leg)?.medianMinutes ?? 0,
              color: LEG_COLOR[i],
            }))}
          />
          <TableTwin
            headers={[t('statistics.fleet.legsTitle'), t('statistics.fleet.median'), t('statistics.fleet.p90')]}
            rows={RESPONSE_LEG_KEYS.map((leg) => {
              const row = data.responseLegs.find((l) => l.leg === leg);
              return [
                t(`statistics.fleet.leg.${leg}`),
                row?.medianMinutes != null ? `${fmt(row.medianMinutes, locale)} min` : '—',
                row?.p90Minutes != null ? `${fmt(row.p90Minutes, locale)} min` : '—',
              ];
            })}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard
          title={t('statistics.fleet.rangesTitle')}
          subtitle={t('statistics.fleet.rangesSubtitle')}
          footnote={t('statistics.fleet.rangesFootnote')}
        >
          {data.totalEmergencies === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('statistics.fleet.noTimedEmergencies')}
            </Typography>
          ) : (
            <ResponseLegsRangeChart
              medianLabel={t('statistics.fleet.median')}
              p90Label={t('statistics.fleet.p90')}
              data={RESPONSE_LEG_KEYS.map((leg) => {
                const row = data.responseLegs.find((l) => l.leg === leg);
                return {
                  legLabel: t(`statistics.fleet.leg.${leg}`),
                  medianMinutes: row?.medianMinutes ?? 0,
                  p90Minutes: row?.p90Minutes ?? 0,
                };
              })}
            />
          )}
        </ChartCard>
      </GridItem>
    </StatisticsGrid>
  );
};

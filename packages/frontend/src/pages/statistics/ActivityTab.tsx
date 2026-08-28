import { useState } from 'react';
import {
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ActivityStatistics, EventReportType, VictimDestinationKind } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { destinationLabel, inemUnitLabel, reportTypeLabel } from '../../i18n/labels';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { categoryColor } from '../../components/CategoryChip';
import { HeroCard } from './HeroCard';
import { StatTile } from './StatTile';
import { ChartCard } from './ChartCard';
import { TableTwin } from './TableTwin';
import { ChartLegend } from './ChartLegend';
import { MonthlyStackedBarChart } from './MonthlyStackedBarChart';
import { ActivationHeatmap } from './ActivationHeatmap';
import { RankedBarList } from './RankedBarList';
import { StatisticsGrid, GridItem } from './StatisticsGrid';
import { formatMonthLabel } from './monthLabel';
import { StatisticsFilterState, useStatisticsTab } from './useStatisticsTab';

function fmt(value: number, locale: string, maximumFractionDigits = 0): string {
  return value.toLocaleString(locale, { maximumFractionDigits });
}

/** Tab 2 — Atividade (docs/plans/estatisticas-dashboards.md §3). */
export const ActivityTab = ({ filters }: { filters: StatisticsFilterState }) => {
  const t = useT();
  const locale = useIntlLocale();
  const { data, loading, error } = useStatisticsTab<ActivityStatistics>('activity', filters);
  const [geographyLevel, setGeographyLevel] = useState<'locality' | 'municipality'>('locality');

  if (loading && !data) return <CircularProgress size={24} sx={{ my: 4 }} />;
  if (error) return <Alert severity="error">{t('statistics.loadError')}</Alert>;
  if (!data) return null;

  const eventsDeltaPct =
    data.previousPeriodEvents > 0
      ? Math.round(((data.totalEvents - data.previousPeriodEvents) / data.previousPeriodEvents) * 100)
      : 0;
  const emergencyCount = data.eventsByType.find((e) => e.type === EventReportType.EMERGENCY)?.count ?? 0;

  const monthlyData = data.eventsByMonth.map((m) => ({
    month: m.month,
    [EventReportType.EMERGENCY]: m.byType[EventReportType.EMERGENCY],
    [EventReportType.LOCAL_SUPPORT]: m.byType[EventReportType.LOCAL_SUPPORT],
    [EventReportType.SALOP_SUPPORT]: m.byType[EventReportType.SALOP_SUPPORT],
  }));
  const typeSeries = Object.values(EventReportType).map((type) => ({
    key: type,
    color: categoryColor(type),
    label: reportTypeLabel(t, type),
  }));

  const geography = geographyLevel === 'locality' ? data.eventsByLocality : data.eventsByMunicipality;
  const geographyOther = geographyLevel === 'locality' ? data.eventsByLocalityOther : data.eventsByMunicipalityOther;
  const geographyItems = [
    ...geography.map((g) => ({ key: g.id, label: g.name, value: g.count })),
    ...(geographyOther > 0 ? [{ key: 'other', label: t('statistics.activity.otherLocalities'), value: geographyOther, muted: true }] : []),
  ];

  return (
    <StatisticsGrid>
      <GridItem span={12}>
        <HeroCard
          title={t('statistics.activity.heroTitle')}
          subtitle={`${data.from} – ${data.to}`}
          value={fmt(data.totalEvents, locale)}
          description={t('statistics.activity.heroDescription', {
            pct: `${eventsDeltaPct >= 0 ? '+' : ''}${eventsDeltaPct}%`,
            prev: fmt(data.previousPeriodEvents, locale),
            victims: fmt(data.victimsAssisted, locale),
          })}
        />
      </GridItem>

      {Object.values(EventReportType).map((type) => {
        const count = data.eventsByType.find((e) => e.type === type)?.count ?? 0;
        const pct = data.totalEvents > 0 ? Math.round((count / data.totalEvents) * 100) : 0;
        return (
          <GridItem key={type} span={3} mobileSpan={1}>
            <StatTile
              label={reportTypeLabel(t, type)}
              value={fmt(count, locale)}
              delta={t('statistics.activity.percentOfActivity', { pct })}
            />
          </GridItem>
        );
      })}
      <GridItem span={3} mobileSpan={1}>
        <StatTile
          label={t('statistics.activity.victimsAssisted')}
          value={fmt(data.victimsAssisted, locale)}
          delta={
            emergencyCount > 0
              ? t('statistics.activity.victimsPerEmergency', {
                  ratio: fmt(data.victimsAssisted / emergencyCount, locale, 1),
                })
              : undefined
          }
        />
      </GridItem>

      <GridItem span={12}>
        <ChartCard title={t('statistics.activity.eventsByMonthTitle')}>
          <ChartLegend items={typeSeries} />
          <MonthlyStackedBarChart data={monthlyData} series={typeSeries} />
          <TableTwin
            headers={[t('statistics.monthColumn'), ...typeSeries.map((s) => s.label), t('statistics.people.rosterColumnEvents')]}
            rows={data.eventsByMonth.map((m) => [
              formatMonthLabel(m.month, locale),
              m.byType[EventReportType.EMERGENCY],
              m.byType[EventReportType.LOCAL_SUPPORT],
              m.byType[EventReportType.SALOP_SUPPORT],
              m.total,
            ])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard title={t('statistics.activity.heatmapTitle')} subtitle={t('statistics.activity.heatmapSubtitle')}>
          <ActivationHeatmap
            cells={data.activationHeatmap}
            lessLabel={t('statistics.activity.heatmapLess')}
            moreLabel={t('statistics.activity.heatmapMore')}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard
          title={geographyLevel === 'locality' ? t('statistics.activity.localityTitle') : t('statistics.activity.municipalityTitle')}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={geographyLevel}
            onChange={(_, next) => next && setGeographyLevel(next)}
            sx={{ mb: 1.5 }}
          >
            <ToggleButton value="locality" sx={{ py: 0.25, px: 1, fontSize: '0.75rem' }}>
              {t('statistics.activity.byLocality')}
            </ToggleButton>
            <ToggleButton value="municipality" sx={{ py: 0.25, px: 1, fontSize: '0.75rem' }}>
              {t('statistics.activity.byMunicipality')}
            </ToggleButton>
          </ToggleButtonGroup>
          <RankedBarList items={geographyItems} />
          <TableTwin
            headers={[
              geographyLevel === 'locality' ? t('statistics.activity.byLocality') : t('statistics.activity.byMunicipality'),
              t('statistics.people.rosterColumnEvents'),
            ]}
            rows={geographyItems.map((g) => [g.label, g.value])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard
          title={t('statistics.activity.hospitalTitle')}
          subtitle={t('statistics.activity.hospitalSubtitle', { count: fmt(data.destinationHospitals.reduce((s, h) => s + h.count, 0), locale) })}
        >
          <RankedBarList items={data.destinationHospitals.map((h) => ({ key: h.id, label: h.name, value: h.count }))} />
          <TableTwin
            headers={[t('statistics.activity.hospitalTitle'), t('statistics.activity.byMunicipality'), t('statistics.activity.victimsAssisted')]}
            rows={data.destinationHospitals.map((h) => [h.name, h.municipality, h.count])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard
          title={t('statistics.activity.outcomeTitle')}
          subtitle={t('statistics.activity.hospitalSubtitle', { count: fmt(data.victimsAssisted, locale) })}
        >
          <RankedBarList
            items={data.victimOutcomes.map((o) => ({ key: o.kind, label: destinationLabel(t, o.kind), value: o.count }))}
            formatValue={(v) => `${fmt(v, locale)}  ${data.victimsAssisted > 0 ? Math.round((v / data.victimsAssisted) * 100) : 0}%`}
          />
          <TableTwin
            headers={[t('statistics.activity.outcomeTitle'), t('statistics.activity.victimsAssisted'), '%']}
            rows={Object.values(VictimDestinationKind).map((kind) => {
              const count = data.victimOutcomes.find((o) => o.kind === kind)?.count ?? 0;
              return [
                destinationLabel(t, kind),
                count,
                data.victimsAssisted > 0 ? `${Math.round((count / data.victimsAssisted) * 100)}%` : '0%',
              ];
            })}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard title={t('statistics.activity.inemTitle')} subtitle={t('statistics.activity.inemSubtitle')} footnote={t('statistics.activity.inemFootnote')}>
          {data.inemUnits.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('statistics.noData')}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('statistics.activity.inemColumnUnit')}</TableCell>
                  <TableCell>{t('statistics.activity.inemColumnBase')}</TableCell>
                  <TableCell align="right">{t('statistics.activity.inemColumnCount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.inemUnits.map((unit) => (
                  <TableRow key={`${unit.unitType}-${unit.hospitalName}`}>
                    <TableCell sx={{ fontWeight: 600 }}>{inemUnitLabel(t, unit.unitType)}</TableCell>
                    <TableCell>{unit.hospitalName}</TableCell>
                    <TableCell align="right">{unit.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ChartCard>
      </GridItem>
    </StatisticsGrid>
  );
};

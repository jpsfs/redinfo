import {
  Alert,
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { INEMStatistics } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { inemReasonLabel } from '../../i18n/labels';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { colorChartSingleSeries, colorSequentialScale } from '../../layout/design-tokens';
import { HeroCard } from './HeroCard';
import { StatTile } from './StatTile';
import { ChartCard } from './ChartCard';
import { TableTwin } from './TableTwin';
import { StackedBar } from './StackedBar';
import { ChartLegend } from './ChartLegend';
import { StatisticsGrid, GridItem } from './StatisticsGrid';
import { StatisticsFilterState, useStatisticsTab } from './useStatisticsTab';

function fmt(value: number, locale: string, maximumFractionDigits = 0): string {
  return value.toLocaleString(locale, { maximumFractionDigits });
}

const toHours = (minutes: number) => minutes / 60;

/**
 * Tab 4 — INEM: how long each unit actually sat unavailable, and why.
 * Sourced from `INEMUnitStatusPeriod` (#post-#216) — the reconciler's
 * confirmed-state trail, not the desired-state toggle on the live status
 * screen. Ungated, org-wide, like every other tab here.
 */
export const INEMTab = ({ filters }: { filters: StatisticsFilterState }) => {
  const t = useT();
  const locale = useIntlLocale();
  const { data, loading, error } = useStatisticsTab<INEMStatistics>('inem', filters);

  if (loading && !data) return <CircularProgress size={24} sx={{ my: 4 }} />;
  if (error) return <Alert severity="error">{t('statistics.loadError')}</Alert>;
  if (!data) return null;

  const topReason = data.downtimeByReason[0];
  const maxUnitDowntime = Math.max(1, ...data.units.map((u) => u.totalDowntimeMinutes));

  return (
    <StatisticsGrid>
      <GridItem span={12}>
        <HeroCard
          title={t('statistics.inem.heroTitle')}
          subtitle={`${data.from} – ${data.to}`}
          value={fmt(toHours(data.totalDowntimeMinutes), locale, 1)}
          unit="h"
          description={t('statistics.inem.heroDescription', { units: data.units.length })}
        />
      </GridItem>

      <GridItem span={4} mobileSpan={1}>
        <StatTile
          label={t('statistics.inem.topReason')}
          value={topReason ? inemReasonLabel(t, topReason.inopCode, topReason.inopCode) : '—'}
          delta={topReason ? `${fmt(toHours(topReason.minutes), locale, 1)} h` : undefined}
        />
      </GridItem>
      <GridItem span={4} mobileSpan={1}>
        <StatTile label={t('statistics.inem.affectedUnits')} value={fmt(data.units.length, locale)} />
      </GridItem>
      <GridItem span={4} mobileSpan={2}>
        <StatTile
          label={t('statistics.inem.averagePerUnit')}
          value={data.units.length > 0 ? fmt(toHours(data.totalDowntimeMinutes) / data.units.length, locale, 1) : '0'}
          unit="h"
        />
      </GridItem>

      <GridItem span={6}>
        <ChartCard title={t('statistics.inem.byReasonTitle')} subtitle={t('statistics.inem.byReasonSubtitle')}>
          {data.downtimeByReason.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('statistics.noData')}
            </Typography>
          ) : (
            <>
              <StackedBar
                segments={data.downtimeByReason.map((row, i) => ({
                  key: row.inopCode,
                  value: row.minutes,
                  color: colorSequentialScale[i % colorSequentialScale.length],
                }))}
              />
              <ChartLegend
                items={data.downtimeByReason.map((row, i) => ({
                  key: row.inopCode,
                  label: inemReasonLabel(t, row.inopCode, row.inopCode),
                  color: colorSequentialScale[i % colorSequentialScale.length],
                  value: `${fmt(toHours(row.minutes), locale, 1)} h`,
                }))}
              />
            </>
          )}
          <TableTwin
            headers={[t('statistics.inem.byReasonTitle'), t('statistics.inem.hoursColumn'), '%']}
            rows={data.downtimeByReason.map((row) => [
              inemReasonLabel(t, row.inopCode, row.inopCode),
              fmt(toHours(row.minutes), locale, 1),
              data.totalDowntimeMinutes > 0 ? `${Math.round((row.minutes / data.totalDowntimeMinutes) * 100)}%` : '0%',
            ])}
          />
        </ChartCard>
      </GridItem>

      <GridItem span={6}>
        <ChartCard title={t('statistics.inem.perUnitTitle')} subtitle={t('statistics.inem.perUnitSubtitle')}>
          {data.units.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('statistics.noData')}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('statistics.inem.vehicleColumn')}</TableCell>
                    <TableCell align="right">{t('statistics.inem.hoursColumn')}</TableCell>
                    <TableCell sx={{ width: '25%' }} />
                    <TableCell>{t('statistics.inem.topReason')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.units.map((unit) => (
                    <TableRow key={unit.unitId}>
                      <TableCell>{unit.vehicle ? `${unit.vehicle.licensePlate} – ${unit.vehicle.numeroCauda}` : unit.unitId}</TableCell>
                      <TableCell align="right">{fmt(toHours(unit.totalDowntimeMinutes), locale, 1)} h</TableCell>
                      <TableCell>
                        <Box sx={{ height: 8, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
                          <Box
                            sx={{
                              width: `${Math.round((unit.totalDowntimeMinutes / maxUnitDowntime) * 100)}%`,
                              height: '100%',
                              bgcolor: colorChartSingleSeries,
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {unit.downtimeByReason[0] ? inemReasonLabel(t, unit.downtimeByReason[0].inopCode, unit.downtimeByReason[0].inopCode) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </ChartCard>
      </GridItem>
    </StatisticsGrid>
  );
};

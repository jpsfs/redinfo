import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorGrey200 } from '../../layout/design-tokens';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { formatMonthLabel } from './monthLabel';

export interface MonthlyStackedSeries {
  key: string;
  color: string;
  label: string;
}

export interface MonthlyStackedBarChartProps {
  data: Record<string, string | number>[];
  series: MonthlyStackedSeries[];
  height?: number;
}

/** Events per month, stacked by `EventReportType` — three series, adjacent-pair-safe colours. */
export const MonthlyStackedBarChart = ({ data, series, height = 240 }: MonthlyStackedBarChartProps) => {
  const isMobile = useIsMobile();
  const locale = useIntlLocale();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" vertical={false} stroke={colorGrey200} />
        <XAxis
          dataKey="month"
          tickFormatter={(m: string) => formatMonthLabel(m, locale)}
          interval={isMobile ? 1 : 0}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
        <Tooltip labelFormatter={(label) => formatMonthLabel(String(label), locale)} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="events" fill={s.color} radius={0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

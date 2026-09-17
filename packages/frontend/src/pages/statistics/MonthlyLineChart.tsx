import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorChartSingleSeries, colorGrey200 } from '../../layout/design-tokens';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { formatMonthLabel } from './monthLabel';

export interface MonthlyLineChartProps {
  data: { month: string; value: number }[];
  color?: string;
  /** A shared scale across small multiples (e.g. km per vehicle) — the design doc's §4 requirement. */
  maxValue?: number;
  height?: number;
}

/** A single-series monthly trend line — hours per month, kilometres per vehicle per month. */
export const MonthlyLineChart = ({ data, color = colorChartSingleSeries, maxValue, height = 220 }: MonthlyLineChartProps) => {
  const isMobile = useIsMobile();
  const locale = useIntlLocale();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" vertical={false} stroke={colorGrey200} />
        <XAxis
          dataKey="month"
          tickFormatter={(m: string) => formatMonthLabel(m, locale)}
          interval={isMobile ? 1 : 0}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <YAxis domain={[0, maxValue ?? 'auto']} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip labelFormatter={(label) => formatMonthLabel(String(label), locale)} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

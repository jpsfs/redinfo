import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { colorChartSingleSeries } from '../../layout/design-tokens';

/** A tiny trend line inside a stat tile — no axes, no tooltip, just shape. */
export const Sparkline = ({ data }: { data: { value: number }[] }) => (
  <ResponsiveContainer width="100%" height={32}>
    <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <Line type="monotone" dataKey="value" stroke={colorChartSingleSeries} strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

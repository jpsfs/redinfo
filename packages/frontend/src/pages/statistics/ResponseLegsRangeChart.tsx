import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorGrey200, colorSequentialScale } from '../../layout/design-tokens';

export interface ResponseLegsRangeChartProps {
  data: { legLabel: string; medianMinutes: number; p90Minutes: number }[];
  medianLabel: string;
  p90Label: string;
  height?: number;
}

/** Median vs. p90 per response leg — grouped, not stacked: the two numbers describe the same leg, not parts of it. */
export const ResponseLegsRangeChart = ({ data, medianLabel, p90Label, height = 240 }: ResponseLegsRangeChartProps) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="0" vertical={false} stroke={colorGrey200} />
      <XAxis dataKey="legLabel" tickLine={false} axisLine={false} fontSize={11} interval={0} />
      <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
      <Tooltip />
      <Bar dataKey="medianMinutes" name={medianLabel} fill={colorSequentialScale[5]} radius={[4, 4, 0, 0]} />
      <Bar dataKey="p90Minutes" name={p90Label} fill={colorSequentialScale[3]} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

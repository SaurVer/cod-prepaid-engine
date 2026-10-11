'use client';

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayLabel } from '@/lib/format';

const BLUE = '#305EFF';
const BLUE_SOFT = '#B9C9FF';
const NAVY = '#192839';
const GREEN = '#00875A';
const GRID = '#E8ECF1';
const AXIS = { fontSize: 11, fill: '#768EA7' };
const TIP = { fontSize: 12, borderRadius: 8, borderColor: '#DFE3E9', boxShadow: '0 8px 24px rgba(25,40,57,.12)' };

export function DailyChart({ data }: { data: { date: string; cod: number; prepaid: number; paid: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: dayLabel(d.date) }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
        <YAxis yAxisId="l" tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <YAxis yAxisId="r" orientation="right" tick={AXIS} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={TIP} formatter={(v: any, n: any) => [Number(v).toLocaleString('en-IN'), n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
        <Bar yAxisId="l" dataKey="cod" name="COD orders" stackId="o" fill={BLUE} maxBarSize={22} />
        <Bar yAxisId="l" dataKey="prepaid" name="Prepaid orders" stackId="o" fill={BLUE_SOFT} radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line yAxisId="r" dataKey="paid" name="Paid online after a message" stroke={GREEN} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PredActualChart({ data }: { data: { date: string; predicted: number | null; actual: number | null }[] }) {
  const rows = data.map((d) => ({
    label: dayLabel(d.date),
    predicted: d.predicted == null ? null : Math.round(d.predicted * 1000) / 10,
    actual: d.actual == null ? null : Math.round(d.actual * 1000) / 10,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} unit="%" width={44} />
        <Tooltip contentStyle={TIP} formatter={(v: any, n: any) => [`${v}%`, n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
        <Line dataKey="predicted" name="Predicted paid-online rate" stroke={NAVY} strokeDasharray="4 3" strokeWidth={1.6} dot={false} />
        <Line dataKey="actual" name="Actual paid-online rate" stroke={BLUE} strokeWidth={2.2} dot={{ r: 2.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CompareBars({ data }: { data: { metric: string; ai: number | null; control: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={4}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="metric" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} width={44} />
        <Tooltip contentStyle={TIP} formatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
        <Bar dataKey="ai" name="AI-picked orders" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={34} />
        <Bar dataKey="control" name="Control group" fill="#C5CEDA" radius={[3, 3, 0, 0]} maxBarSize={34} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

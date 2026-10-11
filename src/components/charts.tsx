'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { inr, simDate } from '@/lib/format';

const BRAND = '#2F6B4F';
const BRAND_LIGHT = '#97C4A9';
const INK = '#4A5650';
const GRID = '#E3E8E5';
const AXIS = { fontSize: 11, fill: '#7C8782' };

export function TrendChart({ data }: { data: { date: string; orders: number; cod_share: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: simDate(d.date), cod_pct: Math.round(d.cod_share * 1000) / 10 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} unit="%" width={40} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }}
          formatter={(v: any, name: any) => (name === 'COD share' ? [`${v}%`, name] : [v.toLocaleString('en-IN'), name])}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Bar yAxisId="l" dataKey="orders" name="Orders" fill={BRAND_LIGHT} radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line yAxisId="r" dataKey="cod_pct" name="COD share" stroke={BRAND} strokeWidth={2} dot={{ r: 2.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GroupBars({
  data,
  format = 'pct',
}: {
  data: { metric: string; model: number | null; holdout: number | null }[];
  format?: 'pct' | 'inr';
}) {
  const fmt = (v: number) => (format === 'pct' ? `${(v * 100).toFixed(1)}%` : inr(v));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barGap={4}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="metric" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(Number(v))} width={52} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} formatter={(v: any) => fmt(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Bar dataKey="model" name="Treated (model group)" fill={BRAND} radius={[3, 3, 0, 0]} maxBarSize={36} />
        <Bar dataKey="holdout" name="Holdout" fill="#C9D1CC" radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CumulativeChart({ data }: { data: { label: string; estimated: number; realised: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inr(Number(v))} width={64} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} formatter={(v: any) => inr(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Line dataKey="estimated" name="Cumulative estimated gain" stroke={INK} strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
        <Line dataKey="realised" name="Cumulative realised gain vs holdout" stroke={BRAND} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

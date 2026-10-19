'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartTheme } from './chart-card';
import { fmtDate } from '@/lib/format';

export interface CurvePoint { date: string; planned: number | null; actual: number | null }

/** Planned (dashed neutral) vs actual (filled blue) S-curve. Single axis, 0–100 %. */
export function ProgressCurve({ data, height = 260, dateStyle = 'short' }: { data: CurvePoint[]; height?: number; dateStyle?: 'short' | 'medium' }) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const fmt = (d: string) => (dateStyle === 'short' ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { month: 'short', year: '2-digit' }).format(new Date(d)) : fmtDate(d, locale));
  return (
    <div style={{ height }} role="img" aria-label={t('trend')}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartTheme.actual} stopOpacity={0.25} /><stop offset="100%" stopColor={chartTheme.actual} stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmt} tick={chartTheme.tick} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip contentStyle={chartTheme.tooltipStyle} labelFormatter={(l) => fmtDate(String(l), locale)} formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="actual" name={t('actual')} stroke={chartTheme.actual} strokeWidth={2} fill="url(#actualFill)" dot={false} activeDot={{ r: 4 }} connectNulls />
          <Line type="monotone" dataKey="planned" name={t('planned')} stroke={chartTheme.planned} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

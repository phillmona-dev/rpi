'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartTheme } from './chart-card';
import { money, moneyFull } from '@/lib/format';

export interface BudgetRow { label: string; allocated: number; disbursed: number; spent: number }

/** Horizontal grouped bars; sequential blue steps encode the funding stage (allocated → released → spent). */
export function BudgetBars({ data, height = 260 }: { data: BudgetRow[]; height?: number }) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  return (
    <div style={{ height }} role="img" aria-label={t('budget')}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={14} barGap={2}>
          <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
          <XAxis type="number" tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => money(v, locale).replace('ETB ', '')} />
          <YAxis type="category" dataKey="label" tick={chartTheme.tick} axisLine={false} tickLine={false} width={96} />
          <Tooltip contentStyle={chartTheme.tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} formatter={(v: number, name: string) => [moneyFull(v, locale), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="allocated" name={t('allocated')} fill={chartTheme.allocated} radius={[0, 4, 4, 0]} maxBarSize={14} />
          <Bar dataKey="disbursed" name={t('released')} fill={chartTheme.disbursed} radius={[0, 4, 4, 0]} maxBarSize={14} />
          <Bar dataKey="spent" name={t('spent')} fill={chartTheme.spent} radius={[0, 4, 4, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

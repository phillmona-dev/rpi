'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { chartTheme } from './chart-card';

export interface DonutSlice { key: string; label: string; value: number; color: string }

/** Part-to-whole with ≤ 6 slices; legend rendered as an accessible list with direct values. */
export function Donut({ data, total, centerLabel, height = 200, ariaLabel }: { data: DonutSlice[]; total?: number; centerLabel?: string; height?: number; ariaLabel: string }) {
  const sum = total ?? data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div style={{ height, width: height }} className="relative shrink-0" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="92%" paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2} startAngle={90} endAngle={-270}>
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: number, n: string) => [v, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular leading-none">{sum}</span>
          {centerLabel && <span className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">{centerLabel}</span>}
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="tabular font-medium">{d.value}</span>
            <span className="w-10 text-right text-xs text-muted-foreground tabular">{sum ? Math.round((d.value / sum) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

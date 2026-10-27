'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, Table2 } from 'lucide-react';
import { Section } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Chart container with an accessible table alternative toggle (WCAG 1.1.1 / 1.3.1). */
export function ChartCard({ title, hint, id, actions, table, children }: {
  title: React.ReactNode; hint?: React.ReactNode; id?: string; actions?: React.ReactNode; children: React.ReactNode;
  table?: { columns: string[]; rows: (string | number | null)[][] };
}) {
  const t = useTranslations('common');
  const [asTable, setAsTable] = React.useState(false);
  return (
    <Section id={id} title={title} hint={hint} actions={<>{actions}{table && (
      <Button variant="ghost" size="iconSm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} aria-label={asTable ? t('showAsChart') : t('showAsTable')}>
        {asTable ? <BarChart3 /> : <Table2 />}
      </Button>
    )}</>}>
      {asTable && table ? (
        <div className="max-h-[320px] overflow-auto">
          <Table>
            <TableHeader><TableRow>{table.columns.map((c, i) => <TableHead key={c} className={i > 0 ? 'text-right' : ''}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{table.rows.map((r, i) => <TableRow key={i}>{r.map((v, j) => <TableCell key={j} className={j > 0 ? 'text-right tabular' : ''}>{v ?? '—'}</TableCell>)}</TableRow>)}</TableBody>
          </Table>
        </div>
      ) : children}
    </Section>
  );
}

export const chartTheme = {
  grid: 'var(--chart-grid)', text: 'var(--chart-text)', planned: 'var(--series-planned)', actual: 'var(--seq-450)',
  allocated: 'var(--seq-250)', disbursed: 'var(--seq-450)', spent: 'var(--seq-650)',
  tooltipStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 13, color: 'hsl(var(--popover-foreground))' } as React.CSSProperties,
  tick: { fontSize: 12, fill: 'var(--chart-text)' },
};

'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { Report, ReportColumn, ReportSection } from '@/lib/api/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, fmtDateTime, moneyFull, num } from '@/lib/format';
import { cn } from '@/lib/utils';

function cell(v: unknown, c: ReportColumn, locale: string): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (c.format) {
    case 'money': return moneyFull(Number(v), locale);
    case 'int': return num(Number(v), locale);
    case 'num': return num(Number(v), locale, 1);
    case 'date': return fmtDate(String(v).slice(0, 10), locale, 'short');
    case 'datetime': return fmtDateTime(String(v), locale);
    default: return String(v).replace(/_/g, ' ');
  }
}

/** Renders the generic report model: print-optimised, one visual language for every report type. */
export function ReportView({ r }: { r: Report }) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const locale = useLocale();
  return (
    <article className="print-page space-y-6 rounded-lg border bg-card p-6 shadow-card print:border-0 print:p-0 print:shadow-none" aria-label={r.title}>
      <header className="border-b pb-4">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{r.classification}</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">{r.title}</h1>{r.subtitle && <p className="text-sm text-muted-foreground">{r.subtitle}</p>}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs text-muted-foreground">
            <dt>{t('periodCovered')}</dt><dd className="font-medium text-foreground tabular">{fmtDate(r.from, locale, 'short')} – {fmtDate(r.to, locale, 'short')}</dd>
            <dt>{tc('generatedAt', { time: '' }).replace(/\s+$/, '')}</dt><dd className="font-medium text-foreground tabular">{fmtDateTime(r.generatedAt, locale)}</dd>
            <dt>{t('preparedBy')}</dt><dd className="font-medium text-foreground">{r.generatedBy ?? '—'}</dd>
          </dl>
        </div>
      </header>
      {r.sections.map((s) => <Section key={s.id} s={s} locale={locale} />)}
      <footer className="border-t pt-3 text-2xs text-muted-foreground">{r.classification} · ReconstructTigray RPIS · {fmtDateTime(r.generatedAt, locale)}</footer>
    </article>
  );
}

function Section({ s, locale }: { s: ReportSection; locale: string }) {
  const tc = useTranslations('common');
  return (
    <section className="break-inside-avoid">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</h2>
      {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
      {s.kind === 'KPIS' && (
        <div className="mt-2 grid grid-cols-2 gap-3 tablet:grid-cols-4">{s.kpis?.map((k) => <div key={k.label} className="rounded-md border p-3"><div className="text-2xs uppercase tracking-wide text-muted-foreground">{k.label}</div><div className="text-xl font-semibold tabular">{k.value || '—'}</div>{k.hint && <div className="text-xs text-muted-foreground">{k.hint}</div>}</div>)}</div>
      )}
      {s.kind === 'TABLE' && (s.rows?.length ? (
        <div className="mt-2 rounded-md border"><Table>
          <TableHeader><TableRow>{s.columns?.map((c) => <TableHead key={c.key} className={cn(c.align === 'right' && 'text-right')}>{c.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{s.rows.map((row, i) => <TableRow key={i}>{s.columns?.map((c) => <TableCell key={c.key} className={cn('text-xs', c.align === 'right' && 'text-right tabular whitespace-nowrap')}>{cell(row[c.key], c, locale)}</TableCell>)}</TableRow>)}</TableBody>
        </Table></div>
      ) : <p className="mt-2 text-sm text-muted-foreground">{tc('noneRecorded')}</p>)}
      {s.kind === 'LIST' && (s.items?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{s.items.map((i, k) => <li key={k}>{i}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{tc('noneRecorded')}</p>)}
      {s.kind === 'TEXT' && <p className="mt-2 text-sm">{s.text}</p>}
    </section>
  );
}

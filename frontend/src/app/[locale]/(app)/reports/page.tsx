'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileText, Printer } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, type Column } from '@/components/common/data-table';
import { ReportView } from '@/components/reports/report-view';
import { useRecordReportRun, useReport, useReportCatalog, useReportRuns, useWeredas, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { canExportReports } from '@/lib/domain';
import { SECTORS, type ReportPeriod, type ReportRun, type ReportType, type Sector } from '@/lib/api/types';
import { fmtDateTime, localizedName } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PERIODS: ReportPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'CUSTOM'];

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const ts = useTranslations('scope');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const type = (get('type') as ReportType | null) ?? 'EXECUTIVE_SUMMARY';
  const period = (get('period') as ReportPeriod | null) ?? 'WEEKLY';
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const weredaId = get('weredaId') ? Number(get('weredaId')) : null;
  const from = get('from'), to = get('to');
  const query = { period, sector: sector ?? undefined, zoneId: zoneId ?? undefined, weredaId: weredaId ?? undefined, from: period === 'CUSTOM' ? from ?? undefined : undefined, to: period === 'CUSTOM' ? to ?? undefined : undefined };
  const { data: catalog } = useReportCatalog();
  const { data: report, isLoading, error, refetch, isFetching } = useReport(type, query);
  const { data: runs, isLoading: rl } = useReportRuns();
  const { data: zones } = useZones();
  const { data: weredas } = useWeredas();
  const record = useRecordReportRun();
  const [exporting, setExporting] = React.useState(false);
  const entry = catalog?.find((c) => c.type === type);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams(); qs.set('format', 'CSV'); Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, String(v)); });
      const res = await fetch(`/api/proxy/reports/${type}/export?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? `rpis-${type.toLowerCase()}.csv`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      record.mutate({ type, period, title: report?.title ?? type, scope: query as Record<string, unknown>, format: 'CSV' }, { onSuccess: undefined });
    } finally { setExporting(false); }
  };
  const print = () => { record.mutate({ type, period, title: report?.title ?? type, scope: query as Record<string, unknown>, format: 'JSON', rowCount: report?.sections.reduce((n, s) => n + (s.rows?.length ?? 0), 0) }); setTimeout(() => window.print(), 150); };

  const runCols: Column<ReportRun>[] = [
    { key: 'when', header: t('runColumns.when'), cell: (r) => <span className="tabular text-xs whitespace-nowrap">{fmtDateTime(r.generatedAt, locale)}</span> },
    { key: 'report', header: t('runColumns.report'), cell: (r) => <span className="font-medium">{t(`types.${r.reportType}`)}</span> },
    { key: 'period', header: t('runColumns.period'), cell: (r) => t(`periods.${r.period}`) },
    { key: 'scope', header: t('runColumns.scope'), cell: (r) => <span className="font-mono text-2xs text-muted-foreground">{r.scope && Object.keys(r.scope).length ? Object.entries(r.scope).map(([k, v]) => `${k}=${v}`).join(' ') : ts('region')}</span> },
    { key: 'format', header: t('runColumns.format'), cell: (r) => <span className="text-xs">{r.format === 'JSON' ? 'PDF / print' : r.format}</span> },
    { key: 'by', header: t('runColumns.by'), cell: (r) => r.generatedBy ?? '—' },
    { key: 'rows', header: t('runColumns.rows'), align: 'right', cell: (r) => r.rowCount ?? '—' },
    { key: 'digest', header: t('runColumns.digest'), cell: (r) => <span className="font-mono text-2xs text-muted-foreground" title={r.sha256 ?? ''}>{r.sha256?.slice(0, 12) ?? '—'}</span> },
  ];

  return (
    <>
      <PageHeader className="no-print" title={t('title')} subtitle={t('subtitle')} actions={<>
        <Button asChild variant="outline" size="sm"><Link href="/briefing"><FileText />{t('dailyBrief')}</Link></Button>
        {canExportReports(user.roles) && <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report || exporting}><Download />{exporting ? t('exporting') : t('export')}</Button>}
        <Button size="sm" onClick={print} disabled={!report}><Printer />{t('print')}</Button>
      </>} />
      <div className="grid gap-5 desktop:grid-cols-12">
        <aside className="no-print desktop:col-span-3 space-y-4">
          <Section id="type" title={t('type')}>
            {!catalog ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
              <ul className="space-y-1" role="radiogroup" aria-label={t('type')}>
                {catalog.map((c) => (
                  <li key={c.type}><button type="button" role="radio" aria-checked={type === c.type} onClick={() => set({ type: c.type })} className={cn('w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60', type === c.type && 'border-primary bg-primary/5')}>
                    <div className="text-sm font-medium">{t(`types.${c.type}`)}</div><div className="line-clamp-2 text-2xs text-muted-foreground">{c.description}</div></button></li>
                ))}
              </ul>
            )}
          </Section>
          <Section id="scope" title={t('scope')}>
            <div className="space-y-3 text-sm">
              <div className="space-y-1"><Label htmlFor="period">{t('period')}</Label><Select value={period} onValueChange={(v) => set({ period: v })}><SelectTrigger id="period"><SelectValue /></SelectTrigger><SelectContent>{PERIODS.map((p) => <SelectItem key={p} value={p}>{t(`periods.${p}`)}</SelectItem>)}</SelectContent></Select></div>
              {period === 'CUSTOM' && <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="from">{t('from')}</Label><Input id="from" type="date" value={from ?? ''} onChange={(e) => set({ from: e.target.value || null })} /></div><div className="space-y-1"><Label htmlFor="to">{t('to')}</Label><Input id="to" type="date" value={to ?? ''} onChange={(e) => set({ to: e.target.value || null })} /></div></div>}
              {!user.sectorScope && entry?.scopes.includes('sector') && <div className="space-y-1"><Label>{ts('sector')}</Label><Select value={sector ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger aria-label={ts('sector')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent></Select></div>}
              {entry?.scopes.includes('zone') && <div className="space-y-1"><Label>{ts('zone')}</Label><Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v, weredaId: null })}><SelectTrigger aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select></div>}
              {entry?.scopes.includes('wereda') && <div className="space-y-1"><Label>{ts('wereda')}</Label><Select value={weredaId ? String(weredaId) : 'ALL'} onValueChange={(v) => set({ weredaId: v === 'ALL' ? null : v })}><SelectTrigger aria-label={ts('wereda')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{tc('all')}</SelectItem>{weredas?.filter((w) => !zoneId || w.zoneId === zoneId).map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)}</SelectItem>)}</SelectContent></Select></div>}
              <p className="text-2xs text-muted-foreground">{t('federalNote')}</p>
            </div>
          </Section>
        </aside>
        <div className="desktop:col-span-9 space-y-5">
          <div aria-busy={isFetching}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!report} emptyTitle={t('empty')} skeleton={<div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
              {report && <ReportView r={report} />}
            </DataState>
          </div>
          <Section id="runs" title={t('runs')} hint={t('runsHint')} className="no-print">
            <DataState isLoading={rl} isEmpty={!runs?.length} skeleton={<TableSkeleton cols={8} rows={5} />}><DataTable columns={runCols} rows={runs ?? []} rowKey={(r) => r.id} dense /></DataState>
          </Section>
        </div>
      </div>
    </>
  );
}

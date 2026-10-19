'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { PageHeader, Stat } from '@/components/common/page-header';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { useAlertCounts, useAlerts } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { AlertSeverityBadge, AlertStatusBadge, SectorDot } from '@/components/common/badges';
import { AlertDrawer } from '@/components/alerts/alert-drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AlertSummary } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { useUser } from '@/providers/session';
import { toneVar } from '@/lib/domain';

export default function AlertsPage() {
  const t = useTranslations('alerts');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const user = useUser();
  const { get, getAll, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const [open, setOpen] = React.useState<number | null>(get('id') ? Number(get('id')) : null);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const statuses = getAll('status');
  const query = { page, size, sort: 'severity,asc', status: statuses.length ? statuses : ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED'], severity: getAll('severity'), sector: user.sectorScope ?? get('sector'), entityType: get('entityType'), decisionRequired: get('decisionRequired'), zoneId: get('zoneId'), weredaId: get('weredaId') };
  const { data, isLoading, error, refetch } = useAlerts(query);
  const { data: counts } = useAlertCounts(user.sectorScope);
  const cols: Column<AlertSummary>[] = [
    { key: 'severity', header: t('columns.severity'), cell: (a) => <AlertSeverityBadge value={a.severity} /> },
    { key: 'title', header: t('columns.title'), cell: (a) => <div className="min-w-[260px]"><div className="font-medium">{a.title}</div><div className="text-2xs text-muted-foreground">{te(`rule.${a.rule}`)}{a.decisionRequired && <Badge variant="outline" className="ml-2 text-2xs">{t('decisionBadge')}</Badge>}</div></div> },
    { key: 'entity', header: t('columns.entity'), cell: (a) => <div className="flex items-center gap-1.5 text-sm">{a.sector && <SectorDot sector={a.sector} />}<span className="truncate max-w-[260px]">{a.entityName ?? a.entityCode}</span><span className="text-2xs text-muted-foreground">{te(`entityType.${a.entityType}`)}</span></div> },
    { key: 'wereda', header: t('columns.wereda'), cell: (a) => a.weredaName ?? '—' },
    { key: 'age', header: t('columns.age'), align: 'right', cell: (a) => <span className="tabular" style={{ color: a.ageHours > 72 && a.status === 'OPEN' ? toneVar.serious : undefined }}>{a.ageHours < 48 ? `${a.ageHours} h` : `${Math.floor(a.ageHours / 24)} d`}</span> },
    { key: 'status', header: t('columns.status'), cell: (a) => <AlertStatusBadge value={a.status} /> },
    { key: 'assignee', header: t('columns.assignee'), cell: (a) => a.assignedToName ?? '—' },
  ];
  const sel = (k: string, label: string, opts: string[], ns: string, w = 'w-[160px]') => (
    <Select value={get(k) ?? 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v })}><SelectTrigger className={w} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="ALL">{label}: {tc('all')}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{te(`${ns}.${o}` as 'alertStatus.OPEN')}</SelectItem>)}</SelectContent></Select>
  );
  const hasAny = ['status', 'severity', 'sector', 'entityType', 'decisionRequired'].some((k) => get(k));
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {counts && (
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-5">
          <button onClick={() => set({ status: null, severity: null, decisionRequired: null })} className="text-left"><Stat label={t('counts.open')} value={counts.open} /></button>
          <button onClick={() => set({ severity: 'CRITICAL', status: null })} className="text-left"><Stat label={t('counts.critical')} value={<span style={{ color: counts.critical ? toneVar.critical : undefined }}>{counts.critical}</span>} /></button>
          <button onClick={() => set({ severity: 'HIGH', status: null })} className="text-left"><Stat label={t('counts.high')} value={<span style={{ color: counts.high ? toneVar.serious : undefined }}>{counts.high}</span>} /></button>
          <button onClick={() => set({ decisionRequired: 'true', status: null })} className="text-left"><Stat label={t('counts.decision')} value={counts.decisionRequired} /></button>
          <button onClick={() => set({ status: 'RESOLVED', severity: null, decisionRequired: null })} className="text-left"><Stat label={t('counts.resolved7')} value={counts.resolvedLast7Days} /></button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {sel('status', t('filters.status'), ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED', 'DISMISSED'], 'alertStatus')}
        {sel('severity', t('filters.severity'), ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], 'alertSeverity')}
        {!user.sectorScope && sel('sector', t('filters.sector'), SECTORS, 'sector')}
        {sel('entityType', t('filters.entityType'), ['PROJECT', 'FACILITY', 'WEREDA'], 'entityType')}
        <Select value={get('decisionRequired') ?? 'ALL'} onValueChange={(v) => set({ decisionRequired: v === 'ALL' ? null : v })}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.decision')}: {tc('all')}</SelectItem><SelectItem value="true">{tc('yes')}</SelectItem><SelectItem value="false">{tc('no')}</SelectItem></SelectContent></Select>
        {hasAny && <Button variant="ghost" size="sm" onClick={() => set({ status: null, severity: null, sector: null, entityType: null, decisionRequired: null })}><X />{tc('clearFilters')}</Button>}
      </div>
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={t('empty')} skeleton={<div className="p-4"><TableSkeleton cols={7} rows={10} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} onRowClick={(a) => setOpen(a.id)} dense caption={t('title')} />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
      <AlertDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

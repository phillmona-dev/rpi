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
import { cn } from '@/lib/utils';

const UNRESOLVED = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED'];
/** Unresolved critical alerts older than 72 h are escalated visually so leadership cannot overlook them. */
const overdueCritical = (a: AlertSummary) => a.severity === 'CRITICAL' && UNRESOLVED.includes(a.status) && a.ageHours > 72;

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
    { key: 'title', header: t('columns.title'), cell: (a) => <div className="min-w-[260px]"><div className="font-medium">{a.title}</div>{(a.decisionRequired || overdueCritical(a)) && <div className="mt-0.5 flex flex-wrap gap-1">{overdueCritical(a) && <Badge variant="outline" className="text-2xs" style={{ color: toneVar.critical, borderColor: toneVar.critical }}>{t('overdue')}</Badge>}{a.decisionRequired && <Badge variant="outline" className="text-2xs">{t('decisionBadge')}</Badge>}</div>}</div> },
    { key: 'rule', header: t('columns.rule'), cell: (a) => <span className="whitespace-nowrap text-xs text-muted-foreground">{te(`rule.${a.rule}`)}</span> },
    { key: 'entity', header: t('columns.entity'), cell: (a) => <div className="flex items-center gap-1.5 text-sm">{a.sector && <SectorDot sector={a.sector} />}<span className="truncate max-w-[260px]">{a.entityName ?? a.entityCode}</span><span className="text-2xs text-muted-foreground">{te(`entityType.${a.entityType}`)}</span></div> },
    { key: 'wereda', header: t('columns.wereda'), cell: (a) => a.weredaName ?? '—' },
    { key: 'age', header: t('columns.age'), align: 'right', cell: (a) => <span className={cn('tabular', overdueCritical(a) && 'font-semibold')} style={{ color: overdueCritical(a) ? toneVar.critical : a.ageHours > 72 && UNRESOLVED.includes(a.status) ? toneVar.serious : undefined }}>{a.ageHours < 48 ? `${a.ageHours} h` : `${Math.floor(a.ageHours / 24)} d`}</span> },
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
          {([
            ['open', counts.open, undefined, !hasAny, { status: null, severity: null, decisionRequired: null }],
            ['critical', counts.critical, counts.critical ? toneVar.critical : undefined, get('severity') === 'CRITICAL', { severity: 'CRITICAL', status: null, decisionRequired: null }],
            ['high', counts.high, counts.high ? toneVar.serious : undefined, get('severity') === 'HIGH', { severity: 'HIGH', status: null, decisionRequired: null }],
            ['decision', counts.decisionRequired, undefined, get('decisionRequired') === 'true', { decisionRequired: 'true', status: null, severity: null }],
            ['resolved7', counts.resolvedLast7Days, undefined, get('status') === 'RESOLVED', { status: 'RESOLVED', severity: null, decisionRequired: null }],
          ] as const).map(([k, v, color, active, filter]) => (
            <button key={k} type="button" aria-pressed={active} onClick={() => set({ ...filter, page: null })} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Stat label={t(`counts.${k}`)} value={<span style={{ color }}>{v}</span>} className={cn('transition-colors hover:border-ring/60', active && 'border-ring bg-accent/40')} />
            </button>
          ))}
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
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={t('empty')} skeleton={<div className="p-4"><TableSkeleton cols={8} rows={10} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} onRowClick={(a) => setOpen(a.id)} dense caption={t('title')} rowClassName={(a) => overdueCritical(a) ? 'bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] shadow-[inset_3px_0_0_var(--status-critical)] hover:bg-[color-mix(in_srgb,var(--status-critical)_16%,transparent)]' : undefined} />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
      <AlertDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAudit } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { useQueryParams } from '@/lib/use-query-params';
import type { AuditEntry } from '@/lib/api/types';
import { fmtDateTime } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'ACCOUNT_LOCKED', 'REFRESH_REUSE_DETECTED', 'ALERT_ACTION', 'PROGRESS_LOG', 'ASSESSMENT_CREATE', 'USER_CREATE', 'USER_UPDATE', 'USER_UNLOCK', 'FEDERAL_READ'];

export default function AuditPage() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const [actor, setActor] = React.useState(get('actor') ?? '');
  React.useEffect(() => { const id = setTimeout(() => { if ((get('actor') ?? '') !== actor) set({ actor: actor || null }); }, 350); return () => clearTimeout(id); }, [actor, get, set]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 50);
  const { data, isLoading, error, refetch } = useAudit({ page, size, actor: get('actor'), action: get('action'), entityType: get('entityType'), entityId: get('entityId') });
  const cols: Column<AuditEntry>[] = [
    { key: 'time', header: t('columns.time'), cell: (a) => <span className="tabular text-xs whitespace-nowrap">{fmtDateTime(a.occurredAt, locale)}</span> },
    { key: 'actor', header: t('columns.actor'), cell: (a) => <div><div className="font-medium">{a.actor ?? 'system'}</div><div className="text-2xs text-muted-foreground">{a.roles}</div></div> },
    { key: 'action', header: t('columns.action'), cell: (a) => <span className="font-mono text-xs">{a.action}</span> },
    { key: 'entity', header: t('columns.entity'), cell: (a) => <span className="text-xs">{a.entityType}{a.entityId ? ` #${a.entityId}` : ''}</span> },
    { key: 'path', header: t('columns.path'), cell: (a) => <span className="font-mono text-2xs text-muted-foreground">{a.httpMethod} {a.path}</span> },
    { key: 'ip', header: t('columns.ip'), cell: (a) => <span className="font-mono text-2xs">{a.ip}</span> },
    { key: 'correlation', header: t('columns.correlation'), cell: (a) => <span className="font-mono text-2xs text-muted-foreground" title={a.correlationId ?? ''}>{a.correlationId?.slice(0, 8)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder={t('filters.actor')} className="w-[200px]" aria-label={t('filters.actor')} />
        <Select value={get('action') ?? 'ALL'} onValueChange={(v) => set({ action: v === 'ALL' ? null : v })}><SelectTrigger className="w-[220px]" aria-label={t('filters.action')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.action')}: {tc('all')}</SelectItem>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
      </>} />
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} skeleton={<div className="p-4"><TableSkeleton cols={7} rows={12} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} dense />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}

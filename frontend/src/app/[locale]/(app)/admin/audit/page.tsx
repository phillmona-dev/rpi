'use client';
import * as React from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useAudit } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { useQueryParams } from '@/lib/use-query-params';
import type { AuditEntry } from '@/lib/api/types';
import { fmtDateTime } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** The actions people look for most often; every recorded action still shows in the list. */
const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PROJECT_CREATE', 'PROJECT_APPROVAL_DECISION', 'STAGE_TRANSITION', 'ASSESSMENT_CREATE', 'ASSESSMENT_REVIEW', 'PROGRESS_LOG', 'INSPECTION_VERIFY', 'ALERT_ACTION', 'FIELD_AGENT_REGISTER', 'ASSIGNMENT_CREATE', 'REPORT_EXPORT', 'USER_CREATE', 'USER_UPDATE', 'USER_UNLOCK'];

export default function AuditPage() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const messages = useMessages() as { admin?: { audit?: { action?: Record<string, string>; entity?: Record<string, string> } } };
  const locale = useLocale();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const [actor, setActor] = React.useState(get('actor') ?? '');
  const [technical, setTechnical] = React.useState(false);
  React.useEffect(() => { const id = setTimeout(() => { if ((get('actor') ?? '') !== actor) set({ actor: actor || null }); }, 350); return () => clearTimeout(id); }, [actor, get, set]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 50);
  const { data, isLoading, error, refetch } = useAudit({ page, size, actor: get('actor'), action: get('action'), entityType: get('entityType'), entityId: get('entityId') });
  const actionName = (a: string) => messages.admin?.audit?.action?.[a] ?? a.replace(/_/g, ' ').toLowerCase();
  const entityName = (e: string) => messages.admin?.audit?.entity?.[e] ?? e.replace(/_/g, ' ').toLowerCase();
  const cols: Column<AuditEntry>[] = [
    { key: 'time', header: t('columns.time'), cell: (a) => <span className="tabular text-xs whitespace-nowrap">{fmtDateTime(a.occurredAt, locale)}</span> },
    { key: 'actor', header: t('columns.actor'), cell: (a) => <div className="font-medium">{a.actor ?? t('system')}</div> },
    { key: 'action', header: t('columns.action'), cell: (a) => <span className="text-sm">{actionName(a.action)}</span> },
    { key: 'entity', header: t('columns.entity'), cell: (a) => a.entityType ? <span className="text-xs">{entityName(a.entityType)}{a.entityId ? ` #${a.entityId}` : ''}</span> : <span className="text-muted-foreground">—</span> },
    ...(technical ? [
      { key: 'path', header: t('columns.path'), cell: (a: AuditEntry) => <span className="font-mono text-2xs text-muted-foreground">{a.httpMethod} {a.path}</span> },
      { key: 'ip', header: t('columns.ip'), cell: (a: AuditEntry) => <span className="font-mono text-2xs">{a.ip}</span> },
      { key: 'correlation', header: t('columns.correlation'), cell: (a: AuditEntry) => <span className="font-mono text-2xs text-muted-foreground" title={a.correlationId ?? ''}>{a.correlationId?.slice(0, 8)}</span> },
    ] as Column<AuditEntry>[] : []),
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-wrap items-center gap-2">
        <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder={t('filters.actor')} className="w-[220px]" aria-label={t('filters.actor')} />
        <Select value={get('action') ?? 'ALL'} onValueChange={(v) => set({ action: v === 'ALL' ? null : v, page: null })}><SelectTrigger className="w-[260px]" aria-label={t('filters.action')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.action')}: {tc('all')}</SelectItem>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{actionName(a)}</SelectItem>)}</SelectContent></Select>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={technical} onCheckedChange={setTechnical} />{t('technical')}</label>
      </div>
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} skeleton={<div className="p-4"><TableSkeleton cols={4} rows={12} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} dense />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}

'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useUsers } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { ToneBadge } from '@/components/common/badges';
import { useQueryParams } from '@/lib/use-query-params';
import type { UserSummary } from '@/lib/api/types';
import { fmtDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

export default function UsersPage() {
  const t = useTranslations('admin.users');
  const tr = useTranslations('roles');
  const te = useTranslations('enums.sector');
  const locale = useLocale();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const { data, isLoading, error, refetch } = useUsers({ page, size, sort: 'username,asc' });
  const cols: Column<UserSummary>[] = [
    { key: 'username', header: t('columns.username'), cell: (u) => <span className="font-mono text-xs">{u.username}</span> },
    { key: 'name', header: t('columns.name'), cell: (u) => <div><div className="font-medium">{u.fullName}</div><div className="text-2xs text-muted-foreground">{u.title ?? u.email}</div></div> },
    { key: 'roles', header: t('columns.roles'), cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} variant="outline">{tr(r as 'ADMIN')}</Badge>)}</div> },
    { key: 'sector', header: t('columns.sector'), cell: (u) => u.sectorScope ? te(u.sectorScope) : '—' },
    { key: 'enabled', header: t('columns.enabled'), cell: (u) => <ToneBadge tone={u.enabled ? 'good' : 'neutral'} label={u.enabled ? t('active') : t('disabled')} /> },
    { key: 'locked', header: t('columns.locked'), cell: (u) => u.locked ? <ToneBadge tone="critical" label={t('columns.locked')} /> : '—' },
    { key: 'lastLogin', header: t('columns.lastLogin'), align: 'right', cell: (u) => <span className="text-xs tabular">{fmtDateTime(u.lastLoginAt, locale)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} skeleton={<div className="p-4"><TableSkeleton cols={7} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(u) => u.id} dense />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} />}
        </DataState>
      </div>
    </>
  );
}

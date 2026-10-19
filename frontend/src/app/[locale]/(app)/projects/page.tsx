'use client';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { useProjects } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { ProjectFilters } from '@/components/projects/project-filters';
import { ProjectTable } from '@/components/projects/project-table';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { Pagination } from '@/components/common/data-table';
import { useUser } from '@/providers/session';

export default function ProjectsPage() {
  const t = useTranslations('projects');
  const tc = useTranslations('common');
  const { get, getAll, set } = useQueryParams();
  const user = useUser();
  useBreadcrumbs([{ label: t('title') }]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const sortField = get('sort') ?? 'updatedAt', sortDir = (get('dir') ?? 'desc') as 'asc' | 'desc';
  const query = { page, size, sort: `${sortField},${sortDir}`, q: get('q'), sector: user.sectorScope ?? get('sector'), zoneId: get('zoneId'), weredaId: get('weredaId'), status: getAll('status'), health: getAll('health'), fundingSource: get('fundingSource'), stage: getAll('stage'), minRiskScore: get('minRiskScore'), contractor: get('contractor') };
  const { data, isLoading, error, refetch, isPlaceholderData } = useProjects(query);
  return (
    <>
      <PageHeader title={t('title')} subtitle={data ? t('count', { count: data.totalElements }) : t('subtitle')} />
      <ProjectFilters get={get} getAll={getAll} set={set} hideSector={Boolean(user.sectorScope)} />
      <div className="rounded-lg border bg-card shadow-card" aria-busy={isPlaceholderData}>
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={tc('noResults')} skeleton={<div className="p-4"><TableSkeleton cols={8} rows={10} /></div>} className="p-4">
          <ProjectTable rows={data?.content ?? []} sort={{ field: sortField, dir: sortDir }} onSort={(s) => set({ sort: s.field, dir: s.dir })} hideSector={Boolean(user.sectorScope)} />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}

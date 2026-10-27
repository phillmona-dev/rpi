'use client';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { AgentForm } from '@/components/field-team/agent-form';
import { useFieldAgent } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canManageFieldTeam } from '@/lib/domain';

export default function EditFieldAgentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('fieldTeam');
  const user = useUser();
  const { data, isLoading, error, refetch } = useFieldAgent(Number(id));
  useBreadcrumbs([{ label: t('title'), href: '/field-team' }, { label: data?.summary.fullName ?? '…', href: `/field-team/${id}` }, { label: t('profile.edit') }]);
  if (!canManageFieldTeam(user.roles)) return <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState>;
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch}>
      {data && <><PageHeader title={t('form.titleEdit', { name: data.summary.fullName })} subtitle={t('form.subtitleEdit')} /><AgentForm key={data.summary.id} existing={data} /></>}
    </DataState>
  );
}

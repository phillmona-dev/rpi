'use client';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { AgentForm } from '@/components/field-team/agent-form';
import { useUser } from '@/providers/session';
import { canManageFieldTeam } from '@/lib/domain';

export default function NewFieldAgentPage() {
  const t = useTranslations('fieldTeam');
  const user = useUser();
  useBreadcrumbs([{ label: t('title'), href: '/field-team' }, { label: t('register') }]);
  return (
    <>
      <PageHeader title={t('form.titleNew')} subtitle={t('form.subtitleNew')} />
      {canManageFieldTeam(user.roles) ? <AgentForm /> : <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState>}
    </>
  );
}

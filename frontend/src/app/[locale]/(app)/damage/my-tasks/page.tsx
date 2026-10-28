'use client';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { MyTasks } from '@/components/damage/my-tasks';
import { isFieldTeam } from '@/lib/domain';
import { useUser } from '@/providers/session';

export default function MyTasksPage() {
  const t = useTranslations('damage');
  const user = useUser();
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, { label: t('mine.title') }]);
  return (
    <>
      <PageHeader title={t('mine.title')} subtitle={t('mine.subtitle')} />
      {isFieldTeam(user.roles) ? <MyTasks /> : <DataState isLoading={false} isEmpty emptyTitle={t('mine.notField')} emptyHint={t('mine.notFieldHint')}>{null}</DataState>}
    </>
  );
}

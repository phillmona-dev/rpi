'use client';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { RegistrationWizard } from '@/components/projects/registration/wizard';
import { useUser } from '@/providers/session';
import { canCreateProject } from '@/lib/domain';

export default function NewProjectPage() {
  const t = useTranslations('register');
  const tp = useTranslations('projects');
  const user = useUser();
  useBreadcrumbs([{ label: tp('title'), href: '/projects' }, { label: t('title') }]);
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {canCreateProject(user.roles) ? <RegistrationWizard /> : <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState>}
    </>
  );
}

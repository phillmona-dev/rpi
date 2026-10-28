'use client';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { CampaignForm } from '@/components/damage/campaign-form';
import { useRouter } from '@/i18n/navigation';
import { canManageCampaigns } from '@/lib/domain';
import { useUser } from '@/providers/session';

export default function NewCampaignPage() {
  const t = useTranslations('damage');
  const user = useUser();
  const router = useRouter();
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, { label: t('newCampaign') }]);
  return (
    <>
      <PageHeader title={t('newCampaign')} subtitle={t('campaignForm.subtitle')} />
      {canManageCampaigns(user.roles) ? <CampaignForm onDone={(id) => router.replace(`/damage/campaigns/${id}?view=sites`)} />
        : <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')}>{null}</DataState>}
    </>
  );
}

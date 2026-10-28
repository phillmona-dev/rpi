'use client';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { CampaignForm } from '@/components/damage/campaign-form';
import { useCampaign } from '@/lib/api/damage';
import { useRouter } from '@/i18n/navigation';

export default function EditCampaignPage() {
  const t = useTranslations('damage');
  const router = useRouter();
  const id = Number(useParams<{ id: string }>().id);
  const { data, isLoading, error } = useCampaign(id);
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, { label: data?.summary.code ?? '…', href: `/damage/campaigns/${id}` }, { label: t('campaignForm.editTitle') }]);
  const editable = data && data.permissions.canManage && (data.summary.status === 'PLANNING' || data.summary.status === 'ACTIVE');
  return (
    <>
      <PageHeader title={t('campaignForm.editTitle')} subtitle={data?.summary.name} />
      <DataState isLoading={isLoading} error={error} isEmpty={!editable} emptyTitle={t('campaignForm.notEditable')}>
        {data && <CampaignForm existing={data} onDone={() => router.replace(`/damage/campaigns/${id}`)} />}
      </DataState>
    </>
  );
}

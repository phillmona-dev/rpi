'use client';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { AssessmentForm } from '@/components/damage/assessment-form';
import { useAssessment } from '@/lib/api/damage';
import { useFacility } from '@/lib/api/hooks';
import { useRouter } from '@/i18n/navigation';
import { useUser } from '@/providers/session';

export default function ReviseAssessmentPage() {
  const t = useTranslations('damage');
  const user = useUser();
  const router = useRouter();
  const id = Number(useParams<{ id: string }>().id);
  const { data, isLoading, error } = useAssessment(id);
  const facility = useFacility(data?.summary.facility.id ?? NaN);
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, { label: data?.summary.facility.name ?? '…', href: `/damage/assessments/${id}` }, { label: t('form.reviseTitle') }]);
  const f = facility.data?.facility;
  return (
    <>
      <PageHeader title={t('form.reviseTitle')} subtitle={data?.campaign ? t('form.forTask', { code: data.campaign.code, name: data.campaign.name }) : t('form.adHoc')} />
      <DataState isLoading={isLoading || facility.isLoading} error={error ?? facility.error} isEmpty={!data || !data.permissions.canRevise} emptyTitle={t('form.cannotRevise')}>
        {data && f && <AssessmentForm facility={data.summary.facility} taskId={data.summary.taskId} beneficiaries={f.beneficiaries} location={f.location}
          existing={data} defaultAssessor={user.fullName} onDone={(aid) => router.replace(`/damage/assessments/${aid}?saved=1`)} />}
      </DataState>
    </>
  );
}

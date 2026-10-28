'use client';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { AssessmentForm } from '@/components/damage/assessment-form';
import { useAssessmentTask } from '@/lib/api/damage';
import { useFacility } from '@/lib/api/hooks';
import { useRouter } from '@/i18n/navigation';
import { canRecordAssessments } from '@/lib/domain';
import { useUser } from '@/providers/session';

/** New assessment for a campaign site (?taskId=) or, for analysts, an ad hoc visit to a registered facility (?facilityId=). */
export default function NewAssessmentPage() {
  const t = useTranslations('damage');
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const taskId = params.get('taskId') ? Number(params.get('taskId')) : null;
  const task = useAssessmentTask(taskId);
  const facilityId = task.data?.facility.id ?? (params.get('facilityId') ? Number(params.get('facilityId')) : NaN);
  const facility = useFacility(facilityId);
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, ...(task.data ? [{ label: task.data.campaignCode, href: `/damage/campaigns/${task.data.campaignId}` }] : []), { label: t('form.newTitle') }]);
  const f = facility.data?.facility;
  const allowed = canRecordAssessments(user.roles);
  return (
    <>
      <PageHeader title={t('form.newTitle')} subtitle={task.data ? t('form.forTask', { code: task.data.campaignCode, name: task.data.campaignName }) : t('form.adHoc')} />
      <DataState isLoading={(taskId !== null && task.isLoading) || facility.isLoading} error={task.error ?? facility.error} isEmpty={!allowed || !f} emptyTitle={allowed ? t('form.noFacility') : t('noAccess')}>
        {f && <AssessmentForm facility={{ id: f.id, code: f.code, name: f.name, sector: f.sector, facilityType: f.facilityType, wereda: f.wereda }} taskId={taskId}
          beneficiaries={f.beneficiaries} location={f.location} defaultAssessor={task.data?.assessor?.userId === user.id ? task.data.assessor.fullName : user.fullName}
          onDone={(id) => router.replace(`/damage/assessments/${id}?saved=1`)} />}
      </DataState>
    </>
  );
}

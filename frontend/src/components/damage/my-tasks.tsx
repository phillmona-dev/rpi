'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, ClipboardPen, Eye, MapPin, Play, Undo2, Ban } from 'lucide-react';
import { useMyAssessmentTasks, useTaskStatus } from '@/lib/api/damage';
import { DataState } from '@/components/common/data-state';
import { Section } from '@/components/common/page-header';
import { SectorDot, SeverityBadge, TaskStatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from './shared';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import type { AssessmentTask } from '@/lib/api/types';
import { fmtDate, localizedName } from '@/lib/format';
import { toneVar } from '@/lib/domain';

/** The signed-in field team member's sites, grouped by what they need to do next. */
export function MyTasks() {
  const t = useTranslations('damage.mine');
  const user = useUser();
  const { data, isLoading, error, refetch } = useMyAssessmentTasks();
  const [blocked, setBlocked] = React.useState<AssessmentTask | null>(null);
  const status = useTaskStatus();
  const tasks = data ?? [];
  const asAssessor = (x: AssessmentTask) => x.assessor?.userId === user.id;
  const asVerifier = (x: AssessmentTask) => x.verifier?.userId === user.id;
  const groups = [
    { key: 'fix', items: tasks.filter((x) => asAssessor(x) && x.status === 'RETURNED') },
    { key: 'record', items: tasks.filter((x) => asAssessor(x) && (x.status === 'ASSIGNED' || x.status === 'IN_PROGRESS')) },
    { key: 'verify', items: tasks.filter((x) => asVerifier(x) && x.status === 'SUBMITTED') },
    { key: 'waiting', items: tasks.filter((x) => asAssessor(x) && x.status === 'SUBMITTED') },
    { key: 'done', items: tasks.filter((x) => x.status === 'VERIFIED' || x.status === 'INACCESSIBLE' || x.status === 'CANCELLED') },
  ] as const;
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!tasks.length} emptyTitle={t('empty')} emptyHint={t('emptyHint')}>
      <div className="space-y-6">
        {groups.filter((g) => g.items.length).map((g) => (
          <Section key={g.key} title={<>{t(`groups.${g.key}`)} <span className="ml-1 text-muted-foreground tabular">{g.items.length}</span></>} hint={t(`groupHints.${g.key}`)}>
            <ul className="grid gap-3 laptop:grid-cols-2">
              {g.items.map((x) => <TaskCard key={x.id} task={x} mode={g.key} onBlocked={() => setBlocked(x)}
                onStart={() => status.mutate({ taskId: x.id, status: 'IN_PROGRESS' })} starting={status.isPending} />)}
            </ul>
          </Section>
        ))}
      </div>
      {blocked && <ReasonDialog open onOpenChange={(o) => !o && setBlocked(null)} title={t('inaccessibleTitle', { name: blocked.facility.name })} description={t('inaccessibleHint')}
        label={t('inaccessibleReason')} confirm={t('inaccessibleConfirm')} onConfirm={(note) => status.mutateAsync({ taskId: blocked.id, status: 'INACCESSIBLE', note })} />}
    </DataState>
  );
}

function TaskCard({ task: x, mode, onBlocked, onStart, starting }: { task: AssessmentTask; mode: 'fix' | 'record' | 'verify' | 'waiting' | 'done'; onBlocked: () => void; onStart: () => void; starting: boolean }) {
  const t = useTranslations('damage.mine');
  const te = useTranslations('enums');
  const locale = useLocale();
  const live = x.campaignStatus === 'ACTIVE';
  return (
    <li className="flex flex-col rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-base font-semibold"><SectorDot sector={x.facility.sector} />{x.facility.name}</div>
          <div className="text-sm text-muted-foreground">{te(`facilityType.${x.facility.facilityType}` as 'facilityType.FACTORY')} · {localizedName(x.facility.wereda.name, locale)}, {localizedName(x.facility.wereda.zoneName, locale)}</div>
        </div>
        <TaskStatusBadge value={x.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted-foreground">{t('campaign')}</dt><dd className="font-medium">{x.campaignCode}</dd></div>
        <div><dt className="text-muted-foreground">{t('due')}</dt><dd className="flex items-center gap-1 font-medium" style={{ color: x.overdue ? toneVar.critical : undefined }}><CalendarClock className="h-3.5 w-3.5" />{x.dueOn ? fmtDate(x.dueOn, locale, 'short') : '—'}{x.overdue && ` · ${t('overdue')}`}</dd></div>
        {x.priority !== 'NORMAL' && <div><dt className="text-muted-foreground">{t('priority')}</dt><dd className="font-medium" style={{ color: x.priority === 'URGENT' ? toneVar.critical : toneVar.serious }}>{te(`priority.${x.priority}`)}</dd></div>}
        <div><dt className="text-muted-foreground">{t('last')}</dt><dd>{x.previousSeverity ? <SeverityBadge value={x.previousSeverity} /> : t('neverAssessed')}</dd></div>
        {x.latitude !== null && x.longitude !== null && <div className="col-span-2 flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span className="tabular">{x.latitude.toFixed(5)}, {x.longitude.toFixed(5)}</span></div>}
      </dl>
      {x.instructions && <p className="mt-3 rounded-md bg-muted/40 p-2 text-sm">{x.instructions}</p>}
      {x.statusNote && (x.status === 'RETURNED' || x.status === 'INACCESSIBLE' || x.status === 'ASSIGNED') && (
        <p className="mt-3 rounded-md border-l-4 p-2 text-sm" style={{ borderColor: x.status === 'RETURNED' ? toneVar.serious : toneVar.neutral }}><span className="font-medium">{x.status === 'RETURNED' ? t('returnedNote') : t('note')}: </span>{x.statusNote}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'record' && live && x.status === 'ASSIGNED' && <Button variant="outline" onClick={onStart} disabled={starting}><Play />{t('start')}</Button>}
        {mode === 'record' && live && <Button asChild><Link href={`/damage/assessments/new?taskId=${x.id}`}><ClipboardPen />{t('record')}</Link></Button>}
        {mode === 'fix' && live && x.assessmentId && <Button asChild><Link href={`/damage/assessments/${x.assessmentId}/edit`}><Undo2 />{t('revise')}</Link></Button>}
        {mode === 'verify' && x.assessmentId && <Button asChild><Link href={`/damage/assessments/${x.assessmentId}`}><Eye />{t('review')}</Link></Button>}
        {(mode === 'waiting' || mode === 'done') && x.assessmentId && <Button asChild variant="outline"><Link href={`/damage/assessments/${x.assessmentId}`}><Eye />{t('open')}</Link></Button>}
        {(mode === 'record' || mode === 'fix') && live && <Button variant="ghost" onClick={onBlocked}><Ban />{t('inaccessible')}</Button>}
        {!live && mode !== 'done' && <span className="text-sm text-muted-foreground">{t('notLive', { status: te(`campaignStatus.${x.campaignStatus}`) })}</span>}
      </div>
    </li>
  );
}

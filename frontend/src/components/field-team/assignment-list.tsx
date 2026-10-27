'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, LogOut } from 'lucide-react';
import type { AssignmentDto } from '@/lib/api/types';
import { useCloseAssignment } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { DataTable, type Column } from '@/components/common/data-table';
import { AgentStatusBadge, AssignmentStatusBadge, SectorDot } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { fmtDate } from '@/lib/format';
import { toneVar } from '@/lib/domain';

/**
 * Assignments as a table. `show` decides whether the project or the member is the subject column, so the same list
 * serves the project's field-team tab, a member's profile and the team-wide assignment board.
 */
export function AssignmentList({ rows, show, canManage }: { rows: AssignmentDto[]; show: 'project' | 'agent' | 'both'; canManage: boolean }) {
  const t = useTranslations('fieldTeam');
  const tr = useTranslations('enums.assignmentRole');
  const tpr = useTranslations('enums.priority');
  const locale = useLocale();
  const [closing, setClosing] = React.useState<{ a: AssignmentDto; outcome: 'COMPLETED' | 'RELEASED' } | null>(null);

  const cols: Column<AssignmentDto>[] = [];
  if (show !== 'agent') cols.push({ key: 'project', header: t('columns.project'), cell: (a) => (
    <div className="min-w-[220px] max-w-[320px]"><Link href={`/projects/${a.project.id}`} className="flex items-center gap-1.5 font-medium hover:underline"><SectorDot sector={a.project.sector} /><span className="truncate">{a.project.name}</span></Link>
      <div className="truncate text-xs text-muted-foreground">{a.project.code} · {a.project.weredaName}</div></div>) });
  if (show !== 'project') cols.push({ key: 'agent', header: t('columns.assignedTo'), cell: (a) => (
    <div className="min-w-[170px]"><Link href={`/field-team/${a.agent.id}`} className="font-medium hover:underline">{a.agent.fullName}</Link>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{a.agent.code}{a.agent.status !== 'ACTIVE' && <AgentStatusBadge value={a.agent.status} />}</div></div>) });
  cols.push(
    { key: 'role', header: t('columns.role'), cell: (a) => <div><span className="font-medium">{tr(a.role)}</span>{a.priority !== 'NORMAL' && <div className="text-xs font-medium" style={{ color: a.priority === 'URGENT' ? toneVar.critical : toneVar.serious }}>{tpr(a.priority)}</div>}</div> },
    { key: 'cadence', header: t('columns.cadence'), cell: (a) => <span className="whitespace-nowrap">{t('every', { days: a.visitFrequencyDays })}</span> },
    { key: 'visits', header: t('columns.visits'), align: 'right', cell: (a) => <span className="tabular">{a.visits}</span> },
    { key: 'last', header: t('columns.lastVisit'), cell: (a) => <span className="whitespace-nowrap">{a.lastVisitOn ? fmtDate(a.lastVisitOn, locale, 'short') : '—'}</span> },
    { key: 'next', header: t('columns.nextDue'), cell: (a) => a.status !== 'ACTIVE' ? <AssignmentStatusBadge value={a.status} />
      : a.overdueDays ? <span className="whitespace-nowrap font-semibold" style={{ color: a.overdueDays > 14 ? toneVar.critical : toneVar.serious }}>{t('overdueBy', { days: a.overdueDays })}</span>
      : <span className="whitespace-nowrap">{fmtDate(a.nextDueOn, locale, 'short')}</span> },
  );
  if (canManage) cols.push({ key: 'actions', header: '', align: 'right', cell: (a) => a.status === 'ACTIVE' ? (
    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button size="xs" variant="outline" onClick={() => setClosing({ a, outcome: 'COMPLETED' })}><CheckCircle2 />{t('close.complete')}</Button>
      <Button size="xs" variant="ghost" onClick={() => setClosing({ a, outcome: 'RELEASED' })}><LogOut />{t('close.release')}</Button>
    </div>) : <span className="text-xs text-muted-foreground">{a.closeReason ?? ''}</span> });

  return (
    <>
      <DataTable columns={cols} rows={rows} rowKey={(a) => a.id} rowClassName={(a) => a.status !== 'ACTIVE' ? 'opacity-70' : undefined} />
      {closing && <CloseDialog a={closing.a} outcome={closing.outcome} onClose={() => setClosing(null)} />}
    </>
  );
}

function CloseDialog({ a, outcome, onClose }: { a: AssignmentDto; outcome: 'COMPLETED' | 'RELEASED'; onClose: () => void }) {
  const t = useTranslations('fieldTeam.close');
  const tc = useTranslations('common');
  const close = useCloseAssignment();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try { await close.mutateAsync({ id: a.id, outcome, reason: reason.trim() || undefined }); onClose(); }
    catch (e) { setError(e instanceof ApiError ? (e.errors?.map((x) => x.message).join(' ') || e.detail || e.title) : tc('error')); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{outcome === 'COMPLETED' ? t('titleComplete') : t('titleRelease')}</DialogTitle><DialogDescription>{a.agent.fullName} · {a.project.code} {a.project.name}</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="close-reason">{t('reason')}{outcome === 'RELEASED' && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</Label>
          <Textarea id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[90px]" maxLength={2000} />
          <p className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{error ?? t('reasonHint')}</p></div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button><Button variant={outcome === 'RELEASED' ? 'destructive' : 'default'} onClick={submit} disabled={close.isPending}>{t('confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

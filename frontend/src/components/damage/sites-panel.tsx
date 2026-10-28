'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Building, ClipboardPen, Eye, MoreHorizontal, Plus, Search, UserCheck } from 'lucide-react';
import type { AssessmentTask, AssignmentPriority, CampaignDetail, DamageSeverity, Sector, TaskStatus } from '@/lib/api/types';
import { useAddSites, useAssignSites, useCampaignTasks, useRegisterSite, useSiteCandidates, useTaskStatus } from '@/lib/api/damage';
import { Section } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { SectorDot, SeverityBadge, TaskStatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout, Field } from '@/components/projects/registration/ui';
import { ReasonDialog, apiMessage } from './shared';
import { Link, useRouter } from '@/i18n/navigation';
import { useQueryParams } from '@/lib/use-query-params';
import { fmtDate, localizedName, money } from '@/lib/format';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const STATUSES: TaskStatus[] = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'INACCESSIBLE', 'CANCELLED'];
const PRIORITIES: AssignmentPriority[] = ['NORMAL', 'HIGH', 'URGENT'];
const TYPES: Record<Sector, string[]> = {
  EDUCATION: ['PRIMARY_SCHOOL', 'SECONDARY_SCHOOL', 'TVET_COLLEGE', 'UNIVERSITY'],
  HEALTH: ['HEALTH_POST', 'HEALTH_CENTER', 'PRIMARY_HOSPITAL', 'GENERAL_HOSPITAL', 'REFERRAL_HOSPITAL'],
  MANUFACTURING: ['FACTORY', 'INDUSTRIAL_PARK', 'AGRO_PROCESSING_PLANT', 'WAREHOUSE'],
  AGRICULTURE: ['IRRIGATION_SCHEME', 'VETERINARY_CLINIC', 'SEED_MULTIPLICATION_CENTER', 'FARMERS_TRAINING_CENTER', 'AGRICULTURAL_RESEARCH_CENTER'],
};
const OPEN: TaskStatus[] = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED'];

/** Sites of the campaign: who assesses and verifies each one, by when, and where it stands. */
export function SitesPanel({ campaign }: { campaign: CampaignDetail }) {
  const t = useTranslations('damage.sites');
  const te = useTranslations('enums');
  const locale = useLocale();
  const router = useRouter();
  const { get, set } = useQueryParams();
  const id = campaign.summary.id;
  const editable = campaign.permissions.canManage && (campaign.summary.status === 'PLANNING' || campaign.summary.status === 'ACTIVE');
  const [q, setQ] = React.useState('');
  const filters = { status: get('status') ?? undefined, weredaId: get('weredaId') ?? undefined, assessorAgentId: get('assessor') ?? undefined, q: q.trim() || undefined };
  const { data, isLoading, error, refetch } = useCampaignTasks(id, filters);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [dialog, setDialog] = React.useState<null | 'assign' | 'add' | 'register'>(null);
  const [statusFor, setStatusFor] = React.useState<{ task: AssessmentTask; to: TaskStatus } | null>(null);
  const taskStatus = useTaskStatus();
  const rows = React.useMemo(() => data ?? [], [data]);
  const assessors = campaign.members.filter((m) => m.active && (m.role === 'ASSESSOR' || m.role === 'ENGINEER' || m.role === 'TEAM_LEAD'));
  const uniq = <T extends { agentId: number }>(xs: T[]) => xs.filter((x, i) => xs.findIndex((y) => y.agentId === x.agentId) === i);
  const allOpen = rows.filter((r) => OPEN.includes(r.status)).map((r) => r.id);
  const toggle = (tid: number) => setSelected((s) => (s.includes(tid) ? s.filter((x) => x !== tid) : [...s, tid]));
  React.useEffect(() => { setSelected((s) => s.filter((x) => rows.some((r) => r.id === x))); }, [rows]);

  return (
    <Section title={t('title')} hint={t('hint')} actions={editable && <>
      <Button variant="outline" onClick={() => setDialog('register')}><Building />{t('registerNew')}</Button>
      <Button onClick={() => setDialog('add')}><Plus />{t('add')}</Button>
    </>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full tablet:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="pl-9" aria-label={t('search')} /></div>
        <Select value={get('status') ?? 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={t('columns.status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('allStatuses')}</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{te(`taskStatus.${s}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={get('weredaId') ?? 'ALL'} onValueChange={(v) => set({ weredaId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[180px]" aria-label={t('columns.facility')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('allWeredas')}</SelectItem>{campaign.weredas.map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)}</SelectItem>)}</SelectContent></Select>
        <Select value={get('assessor') ?? 'ALL'} onValueChange={(v) => set({ assessor: v === 'ALL' ? null : v })}><SelectTrigger className="w-[190px]" aria-label={t('columns.assessor')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('allAssessors')}</SelectItem>{uniq(assessors).map((m) => <SelectItem key={m.agentId} value={String(m.agentId)}>{m.fullName}</SelectItem>)}</SelectContent></Select>
        <span className="ml-auto text-sm text-muted-foreground tabular">{t('count', { count: rows.length })}</span>
      </div>
      {editable && selected.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-md border-2 border-primary/50 bg-card px-4 py-2 shadow-card">
          <span className="font-medium">{t('selected', { count: selected.length })}</span>
          <Button size="sm" onClick={() => setDialog('assign')}><UserCheck />{t('assign')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>{t('clear')}</Button>
        </div>
      )}
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!rows.length} emptyTitle={t('empty')} emptyHint={editable ? t('emptyHint') : undefined} skeleton={<TableSkeleton cols={8} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground">
              {editable && <th className="w-10 py-2 pl-2"><input type="checkbox" className="h-4 w-4" aria-label={t('selectAll')} checked={allOpen.length > 0 && allOpen.every((x) => selected.includes(x))} onChange={(e) => setSelected(e.target.checked ? allOpen : [])} /></th>}
              <th className="py-2 pr-3 font-medium">{t('columns.facility')}</th><th className="py-2 pr-3 font-medium">{t('columns.status')}</th><th className="py-2 pr-3 font-medium">{t('columns.assessor')}</th>
              <th className="py-2 pr-3 font-medium">{t('columns.verifier')}</th><th className="py-2 pr-3 font-medium">{t('columns.due')}</th><th className="py-2 pr-3 font-medium">{t('columns.finding')}</th><th className="py-2 pr-3 text-right font-medium">{t('columns.estimate')}</th><th className="py-2" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/30', (r.status === 'CANCELLED') && 'opacity-60')}>
                  {editable && <td className="py-2 pl-2"><input type="checkbox" className="h-4 w-4" disabled={!OPEN.includes(r.status)} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={t('selectSite', { name: r.facility.name })} /></td>}
                  <td className="py-2 pr-3"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={r.facility.sector} />{r.facility.name}{r.priority !== 'NORMAL' && <span className="rounded px-1.5 text-xs font-semibold" style={{ color: r.priority === 'URGENT' ? toneVar.critical : toneVar.serious }}>{te(`priority.${r.priority}`)}</span>}</div>
                    <div className="text-muted-foreground">{te(`facilityType.${r.facility.facilityType}` as 'facilityType.FACTORY')} · {localizedName(r.facility.wereda.name, locale)}</div></td>
                  <td className="py-2 pr-3"><TaskStatusBadge value={r.status} />{r.statusNote && (r.status === 'INACCESSIBLE' || r.status === 'RETURNED' || r.status === 'CANCELLED') && <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={r.statusNote}>{r.statusNote}</div>}</td>
                  <td className="py-2 pr-3">{r.assessor?.fullName ?? <span style={{ color: toneVar.warning }}>{t('unassigned')}</span>}</td>
                  <td className="py-2 pr-3">{r.verifier?.fullName ?? <span className="text-muted-foreground">{t('anyVerifier')}</span>}</td>
                  <td className="whitespace-nowrap py-2 pr-3" style={{ color: r.overdue ? toneVar.critical : undefined }}>{r.dueOn ? fmtDate(r.dueOn, locale, 'short') : '—'}{r.overdue && <div className="text-xs font-medium">{t('overdue')}</div>}</td>
                  <td className="py-2 pr-3">{r.severity ? <SeverityBadge value={r.severity} /> : r.previousSeverity ? <span className="text-xs text-muted-foreground">{t('previously')} <SeverityBadge value={r.previousSeverity} /></span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-3 text-right tabular">{money(r.replacementEstimateEtb, locale)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {r.assessmentId ? <Button size="sm" variant="ghost" asChild><Link href={`/damage/assessments/${r.assessmentId}`}><Eye />{t('open')}</Link></Button>
                        : campaign.permissions.canManage && campaign.summary.status === 'ACTIVE' && (r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS') && <Button size="sm" variant="ghost" onClick={() => router.push(`/damage/assessments/new?taskId=${r.id}`)}><ClipboardPen />{t('record')}</Button>}
                      {editable && <RowMenu task={r} onPick={(to) => setStatusFor({ task: r, to })} onAssign={() => { setSelected([r.id]); setDialog('assign'); }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      {dialog === 'assign' && <AssignDialog campaign={campaign} taskIds={selected} onClose={(done) => { setDialog(null); if (done) setSelected([]); }} />}
      {dialog === 'add' && <AddSitesDialog campaign={campaign} onClose={() => setDialog(null)} />}
      {dialog === 'register' && <RegisterSiteDialog campaign={campaign} onClose={() => setDialog(null)} />}
      {statusFor && (statusFor.to === 'PLANNED'
        ? <ReasonDialog open onOpenChange={(o) => !o && setStatusFor(null)} title={t('reopenTitle', { name: statusFor.task.facility.name })} label={t('note')} confirm={t('reopen')} minLength={0}
            onConfirm={(note) => taskStatus.mutateAsync({ taskId: statusFor.task.id, status: 'PLANNED', note: note || undefined })} />
        : <ReasonDialog open onOpenChange={(o) => !o && setStatusFor(null)} title={t(statusFor.to === 'INACCESSIBLE' ? 'inaccessibleTitle' : 'cancelTitle', { name: statusFor.task.facility.name })}
            description={t(statusFor.to === 'INACCESSIBLE' ? 'inaccessibleHint' : 'cancelHint')} label={t('note')} confirm={t(statusFor.to === 'INACCESSIBLE' ? 'markInaccessible' : 'removeSite')} destructive={statusFor.to === 'CANCELLED'}
            onConfirm={(note) => taskStatus.mutateAsync({ taskId: statusFor.task.id, status: statusFor.to, note })} />)}
    </Section>
  );
}

function RowMenu({ task, onPick, onAssign }: { task: AssessmentTask; onPick: (to: TaskStatus) => void; onAssign: () => void }) {
  const t = useTranslations('damage.sites');
  const canAssign = OPEN.includes(task.status);
  const canBlock = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED'].includes(task.status);
  const canCancel = canBlock || task.status === 'INACCESSIBLE';
  const canReopen = task.status === 'INACCESSIBLE' || task.status === 'CANCELLED';
  if (!canAssign && !canCancel && !canReopen) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t('actions', { name: task.facility.name })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canAssign && <DropdownMenuItem onSelect={onAssign}>{t('assign')}</DropdownMenuItem>}
        {canBlock && <DropdownMenuItem onSelect={() => onPick('INACCESSIBLE')}>{t('markInaccessible')}</DropdownMenuItem>}
        {canCancel && <DropdownMenuItem onSelect={() => onPick('CANCELLED')}>{t('removeSite')}</DropdownMenuItem>}
        {canReopen && <DropdownMenuItem onSelect={() => onPick('PLANNED')}>{t('reopen')}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssignDialog({ campaign, taskIds, onClose }: { campaign: CampaignDetail; taskIds: number[]; onClose: (done: boolean) => void }) {
  const t = useTranslations('damage.sites');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const assign = useAssignSites(campaign.summary.id);
  const [assessor, setAssessor] = React.useState<string>('KEEP');
  const [verifier, setVerifier] = React.useState<string>('KEEP');
  const [due, setDue] = React.useState('');
  const [priority, setPriority] = React.useState<string>('KEEP');
  const [instructions, setInstructions] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [skipped, setSkipped] = React.useState<string[] | null>(null);
  const people = (roles: string[]) => campaign.members.filter((m) => m.active && roles.includes(m.role)).filter((m, i, xs) => xs.findIndex((y) => y.agentId === m.agentId) === i);
  const assessors = people(['ASSESSOR', 'ENGINEER', 'TEAM_LEAD']);
  const verifiers = people(['VERIFIER', 'TEAM_LEAD']);
  const same = assessor !== 'KEEP' && assessor === verifier;
  const submit = async () => {
    setError(null);
    try {
      const r = await assign.mutateAsync({ taskIds, assessorAgentId: assessor === 'KEEP' ? null : Number(assessor), verifierAgentId: verifier === 'KEEP' ? null : Number(verifier),
        dueOn: due || null, priority: priority === 'KEEP' ? null : (priority as AssignmentPriority), instructions: instructions.trim() || null });
      if (r.skipped.length) setSkipped(r.skipped); else onClose(true);
    } catch (e) { setError(apiMessage(e, tc('error'))); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('assignTitle', { count: taskIds.length })}</DialogTitle><DialogDescription>{t('assignHint')}</DialogDescription></DialogHeader>
        {skipped ? (
          <div className="space-y-3"><Callout tone="warning">{t('skipped', { count: skipped.length })}</Callout><ul className="list-disc space-y-1 pl-5 text-sm">{skipped.map((s) => <li key={s}>{s}</li>)}</ul>
            <DialogFooter><Button onClick={() => onClose(true)}>{t('done')}</Button></DialogFooter></div>
        ) : (
          <div className="space-y-4">
            <Field id="as-assessor" label={t('columns.assessor')}>{(a) => (
              <Select value={assessor} onValueChange={setAssessor}><SelectTrigger {...a}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="KEEP">{t('keep')}</SelectItem>{assessors.map((m) => <SelectItem key={m.agentId} value={String(m.agentId)}>{m.fullName} · {te(`campaignRole.${m.role}`)} · {t('openSites', { count: m.openTasks })}</SelectItem>)}</SelectContent></Select>)}</Field>
            <Field id="as-verifier" label={t('columns.verifier')} error={same ? t('samePerson') : undefined} hint={t('verifierHint')}>{(a) => (
              <Select value={verifier} onValueChange={setVerifier}><SelectTrigger {...a}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="KEEP">{t('keep')}</SelectItem>{verifiers.map((m) => <SelectItem key={m.agentId} value={String(m.agentId)}>{m.fullName} · {te(`campaignRole.${m.role}`)}</SelectItem>)}</SelectContent></Select>)}</Field>
            <div className="grid gap-4 tablet:grid-cols-2">
              <Field id="as-due" label={t('columns.due')}>{(a) => <Input type="date" value={due} min={campaign.summary.plannedStart} onChange={(e) => setDue(e.target.value)} {...a} />}</Field>
              <Field id="as-priority" label={t('priority')}>{(a) => (
                <Select value={priority} onValueChange={setPriority}><SelectTrigger {...a}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="KEEP">{t('keep')}</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{te(`priority.${p}`)}</SelectItem>)}</SelectContent></Select>)}</Field>
            </div>
            <div className="space-y-1.5"><Label htmlFor="as-ins">{t('instructions')}</Label><Textarea id="as-ins" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} className="min-h-[80px]" placeholder={t('instructionsHint')} /></div>
            {!assessors.length && <Callout tone="warning">{t('noAssessors')}</Callout>}
            {error && <Callout tone="error">{error}</Callout>}
            <DialogFooter><Button variant="ghost" onClick={() => onClose(false)}>{tc('cancel')}</Button><Button onClick={submit} disabled={assign.isPending || same}>{t('apply')}</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddSitesDialog({ campaign, onClose }: { campaign: CampaignDetail; onClose: () => void }) {
  const t = useTranslations('damage.sites');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [wereda, setWereda] = React.useState('ALL');
  const [severity, setSeverity] = React.useState('ALL');
  const [never, setNever] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [picked, setPicked] = React.useState<number[]>([]);
  const [priority, setPriority] = React.useState<AssignmentPriority>('NORMAL');
  const [error, setError] = React.useState<string | null>(null);
  const [skipped, setSkipped] = React.useState<string[] | null>(null);
  const { data, isLoading } = useSiteCandidates(campaign.summary.id, { weredaId: wereda === 'ALL' ? undefined : wereda, severity: severity === 'ALL' ? undefined : severity, neverAssessed: never || undefined, q: q.trim() || undefined });
  const add = useAddSites(campaign.summary.id);
  const list = data ?? [];
  const submit = async () => {
    setError(null);
    try { const r = await add.mutateAsync({ facilityIds: picked, priority }); if (r.skipped.length) setSkipped(r.skipped); else onClose(); } catch (e) { setError(apiMessage(e, tc('error'))); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t('addTitle')}</DialogTitle><DialogDescription>{t('addHint')}</DialogDescription></DialogHeader>
        {skipped ? (<div className="space-y-3"><Callout tone="warning">{t('skipped', { count: skipped.length })}</Callout><ul className="list-disc pl-5 text-sm">{skipped.map((s) => <li key={s}>{s}</li>)}</ul><DialogFooter><Button onClick={onClose}>{t('done')}</Button></DialogFooter></div>) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="w-full tablet:w-56" aria-label={t('search')} />
              <Select value={wereda} onValueChange={setWereda}><SelectTrigger className="w-[170px]" aria-label={t('allWeredas')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('allWeredas')}</SelectItem>{campaign.weredas.map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)}</SelectItem>)}</SelectContent></Select>
              <Select value={severity} onValueChange={setSeverity}><SelectTrigger className="w-[170px]" aria-label={t('lastSeverity')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('anySeverity')}</SelectItem>{(['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'] as DamageSeverity[]).map((s) => <SelectItem key={s} value={s}>{te(`severity.${s}`)}</SelectItem>)}</SelectContent></Select>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Switch checked={never} onCheckedChange={setNever} />{t('neverAssessed')}</label>
            </div>
            <div className="flex items-center justify-between text-sm"><button type="button" className="font-medium text-primary hover:underline" onClick={() => setPicked(list.every((c) => picked.includes(c.facilityId)) ? [] : list.map((c) => c.facilityId))}>{list.length && list.every((c) => picked.includes(c.facilityId)) ? t('clear') : t('selectAllShown', { count: list.length })}</button><span className="tabular">{t('selected', { count: picked.length })}</span></div>
            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              {isLoading ? <Skeleton className="h-40 w-full" /> : !list.length ? <p className="p-4 text-sm text-muted-foreground">{t('noCandidates')}</p> : (
                <ul className="divide-y">{list.map((c) => (
                  <li key={c.facilityId}><label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={picked.includes(c.facilityId)} onChange={() => setPicked((p) => (p.includes(c.facilityId) ? p.filter((x) => x !== c.facilityId) : [...p, c.facilityId]))} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-medium"><SectorDot sector={c.sector} />{c.name}</span>
                      <span className="block text-sm text-muted-foreground">{te(`facilityType.${c.facilityType}` as 'facilityType.FACTORY')} · {localizedName(c.wereda.name, locale)} · {c.lastAssessedOn ? t('lastAssessed', { date: fmtDate(c.lastAssessedOn, locale, 'short') }) : t('neverAssessedShort')}{c.inOtherCampaign && ` · ${t('inOther', { code: c.inOtherCampaign })}`}</span></span>
                    {c.latestSeverity && <SeverityBadge value={c.latestSeverity} />}
                  </label></li>))}</ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3"><span className="text-sm">{t('priority')}</span>
              <Select value={priority} onValueChange={(v) => setPriority(v as AssignmentPriority)}><SelectTrigger className="w-[150px]" aria-label={t('priority')}><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{te(`priority.${p}`)}</SelectItem>)}</SelectContent></Select></div>
            {error && <Callout tone="error">{error}</Callout>}
            <DialogFooter><Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button><Button onClick={submit} disabled={!picked.length || add.isPending}>{t('addCount', { count: picked.length })}</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterSiteDialog({ campaign, onClose }: { campaign: CampaignDetail; onClose: () => void }) {
  const t = useTranslations('damage.sites');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const sectors: Sector[] = campaign.summary.sector ? [campaign.summary.sector] : ['EDUCATION', 'HEALTH', 'MANUFACTURING', 'AGRICULTURE'];
  const types = sectors.flatMap((s) => TYPES[s]);
  const register = useRegisterSite(campaign.summary.id);
  const [f, setF] = React.useState({ name: '', type: types[0], weredaId: campaign.weredas[0]?.id ? String(campaign.weredas[0].id) : '', kebele: '', lat: '', lng: '', capacity: '', unit: '', beneficiaries: '' });
  const [error, setError] = React.useState<string | null>(null);
  const num = (s: string) => (s.trim() ? Number(s) : null);
  const submit = async () => {
    setError(null);
    try {
      await register.mutateAsync({ name: f.name.trim(), facilityType: f.type, weredaId: Number(f.weredaId), kebele: f.kebele.trim() || null, latitude: num(f.lat), longitude: num(f.lng),
        preCrisisCapacity: num(f.capacity), capacityUnit: f.unit.trim() || null, beneficiaries: num(f.beneficiaries) });
      onClose();
    } catch (e) { setError(apiMessage(e, tc('error'))); }
  };
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('registerTitle')}</DialogTitle><DialogDescription>{t('registerHint')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field id="nf-name" label={t('nf.name')} required>{(a) => <Input maxLength={200} {...field('name')} {...a} />}</Field>
          <div className="grid gap-4 tablet:grid-cols-2">
            <Field id="nf-type" label={t('nf.type')} required>{(a) => <Select value={f.type} onValueChange={(v) => setF((x) => ({ ...x, type: v }))}><SelectTrigger {...a}><SelectValue /></SelectTrigger><SelectContent>{types.map((x) => <SelectItem key={x} value={x}>{te(`facilityType.${x}` as 'facilityType.FACTORY')}</SelectItem>)}</SelectContent></Select>}</Field>
            <Field id="nf-wereda" label={t('nf.wereda')} required>{(a) => <Select value={f.weredaId} onValueChange={(v) => setF((x) => ({ ...x, weredaId: v }))}><SelectTrigger {...a}><SelectValue /></SelectTrigger><SelectContent>{campaign.weredas.map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)}</SelectItem>)}</SelectContent></Select>}</Field>
            <Field id="nf-kebele" label={t('nf.kebele')}>{(a) => <Input maxLength={120} {...field('kebele')} {...a} />}</Field>
            <Field id="nf-ben" label={t('nf.beneficiaries')}>{(a) => <Input inputMode="numeric" {...field('beneficiaries')} {...a} />}</Field>
            <Field id="nf-lat" label={t('nf.lat')}>{(a) => <Input inputMode="decimal" {...field('lat')} {...a} />}</Field>
            <Field id="nf-lng" label={t('nf.lng')}>{(a) => <Input inputMode="decimal" {...field('lng')} {...a} />}</Field>
            <Field id="nf-cap" label={t('nf.capacity')}>{(a) => <Input inputMode="numeric" {...field('capacity')} {...a} />}</Field>
            <Field id="nf-unit" label={t('nf.unit')} hint={t('nf.unitHint')}>{(a) => <Input maxLength={32} {...field('unit')} {...a} />}</Field>
          </div>
          {error && <Callout tone="error">{error}</Callout>}
          <DialogFooter><Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button><Button onClick={submit} disabled={f.name.trim().length < 3 || !f.weredaId || register.isPending}>{t('registerAction')}</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, MapPinned, UserMinus, UserPlus } from 'lucide-react';
import type { CampaignDetail, CampaignMember, CampaignRole } from '@/lib/api/types';
import { useAddMember, useMemberCandidates, useReleaseMember } from '@/lib/api/damage';
import { Section } from '@/components/common/page-header';
import { DataTable, type Column } from '@/components/common/data-table';
import { SectorDot, ToneBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/projects/registration/ui';
import { CAMPAIGN_ROLES, ReasonDialog, apiMessage } from './shared';
import { Link } from '@/i18n/navigation';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const roleTone: Record<CampaignRole, 'info' | 'good' | 'warning' | 'neutral'> = { TEAM_LEAD: 'info', VERIFIER: 'good', ENGINEER: 'warning', ASSESSOR: 'neutral' };

/** The campaign team: who holds which role, their workload here, and adding or releasing people. */
export function TeamPanel({ campaign }: { campaign: CampaignDetail }) {
  const t = useTranslations('damage.team');
  const te = useTranslations('enums');
  const manage = campaign.permissions.canManage;
  const [adding, setAdding] = React.useState(false);
  const [releasing, setReleasing] = React.useState<CampaignMember | null>(null);
  const release = useReleaseMember(campaign.summary.id);
  const active = campaign.members.filter((m) => m.active);
  const past = campaign.members.filter((m) => !m.active);
  const counts = CAMPAIGN_ROLES.map((r) => ({ role: r, n: active.filter((m) => m.role === r).length }));
  const cols: Column<CampaignMember>[] = [
    { key: 'name', header: t('columns.member'), cell: (m) => <div className="min-w-[200px]"><Link href={`/field-team/${m.agentId}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{m.fullName}</Link><div className="text-sm text-muted-foreground">{te(`agentType.${m.agentType}`)} · {m.agentCode}</div></div> },
    { key: 'role', header: t('columns.role'), cell: (m) => <ToneBadge tone={roleTone[m.role]} label={te(`campaignRole.${m.role}`)} /> },
    { key: 'area', header: t('columns.area'), cell: (m) => m.coversScope ? <span className="text-sm">{t('covers')}</span> : <span className="text-sm" style={{ color: toneVar.warning }}>{t('outsideArea')}</span> },
    { key: 'open', header: t('columns.open'), align: 'right', cell: (m) => <span className="tabular">{m.openTasks}</span> },
    { key: 'verified', header: t('columns.verified'), align: 'right', cell: (m) => <span className="tabular">{m.verifiedTasks}</span> },
    { key: 'reviews', header: t('columns.reviews'), align: 'right', cell: (m) => <span className="font-medium tabular" style={{ color: m.pendingReviews ? toneVar.warning : undefined }}>{m.pendingReviews}</span> },
    { key: 'login', header: t('columns.login'), cell: (m) => m.hasLogin ? <span className="inline-flex items-center gap-1 text-sm"><KeyRound className="h-3.5 w-3.5" />{t('hasLogin')}</span> : <span className="text-sm" style={{ color: toneVar.warning }}>{t('noLogin')}</span> },
    { key: 'phone', header: t('columns.phone'), cell: (m) => <span className="text-sm tabular">{m.phone ?? '—'}</span> },
    ...(manage ? [{ key: 'act', header: <span className="sr-only">{t('release')}</span>, cell: (m: CampaignMember) => <Button size="sm" variant="ghost" onClick={() => setReleasing(m)}><UserMinus />{t('release')}</Button> }] : []),
  ];
  return (
    <div className="space-y-6">
      <Section title={t('title')} hint={t('hint')} actions={manage && <Button onClick={() => setAdding(true)}><UserPlus />{t('add')}</Button>}>
        <ul className="mb-4 flex flex-wrap gap-2">{counts.map((c) => (
          <li key={c.role} className={cn('rounded-md border px-3 py-1.5 text-sm', c.n === 0 && (c.role === 'ASSESSOR' || c.role === 'VERIFIER') && 'border-dashed')}
            style={c.n === 0 && (c.role === 'ASSESSOR' || c.role === 'VERIFIER') ? { borderColor: toneVar.warning } : undefined}>
            {te(`campaignRole.${c.role}`)} <span className="font-semibold tabular">{c.n}</span></li>))}</ul>
        {active.some((m) => !m.hasLogin) && <div className="mb-4"><Callout tone="warning">{t('loginWarning')}</Callout></div>}
        {!active.length ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : <DataTable columns={cols} rows={active} rowKey={(m) => m.id} />}
      </Section>
      <Section title={t('roles.title')}>
        <dl className="grid gap-3 tablet:grid-cols-2">{CAMPAIGN_ROLES.map((r) => <div key={r} className="rounded-md border p-3"><dt className="font-semibold">{te(`campaignRole.${r}`)}</dt><dd className="mt-1 text-sm text-muted-foreground">{t(`roles.${r}`)}</dd></div>)}</dl>
      </Section>
      {past.length > 0 && (
        <Section title={t('past')}>
          <ul className="divide-y text-sm">{past.map((m) => <li key={m.id} className="py-2"><span className="font-medium">{m.fullName}</span> · {te(`campaignRole.${m.role}`)}<span className="block text-muted-foreground">{t('releasedNote', { reason: m.releaseReason ?? '' })}</span></li>)}</ul>
        </Section>
      )}
      {adding && <AddMemberDialog campaign={campaign} onClose={() => setAdding(false)} />}
      {releasing && <ReasonDialog open onOpenChange={(o) => !o && setReleasing(null)} title={t('releaseTitle', { name: releasing.fullName, role: te(`campaignRole.${releasing.role}`) })}
        description={t('releaseHint')} label={t('releaseReason')} confirm={t('release')} destructive onConfirm={(reason) => release.mutateAsync({ memberId: releasing.id, reason })} />}
    </div>
  );
}

function AddMemberDialog({ campaign, onClose }: { campaign: CampaignDetail; onClose: () => void }) {
  const t = useTranslations('damage.team');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const [role, setRole] = React.useState<CampaignRole>('ASSESSOR');
  const { data, isLoading } = useMemberCandidates(campaign.summary.id, role);
  const add = useAddMember(campaign.summary.id);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<string[]>([]);
  const pick = async (agentId: number, name: string) => {
    setError(null);
    try { await add.mutateAsync({ agentId, role }); setAdded((a) => [...a, `${name} — ${te(`campaignRole.${role}`)}`]); } catch (e) { setError(apiMessage(e, tc('error'))); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('addTitle')}</DialogTitle><DialogDescription>{t('addHint')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label={t('columns.role')} className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
            {CAMPAIGN_ROLES.map((r) => <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
              className={cn('rounded-md border-2 px-3 py-2 text-sm font-medium', role === r ? 'border-primary bg-muted/50' : 'border-border hover:bg-muted/40')}>{te(`campaignRole.${r}`)}</button>)}
          </div>
          <p className="text-sm text-muted-foreground">{t(`roles.${role}`)}</p>
          {added.length > 0 && <Callout>{t('addedList', { list: added.join('; ') })}</Callout>}
          {error && <Callout tone="error">{error}</Callout>}
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {isLoading ? <Skeleton className="h-40 w-full" /> : !data?.length ? <p className="p-4 text-sm text-muted-foreground">{t('noCandidates')}</p> : (
              <ul className="divide-y">{data.map((c) => (
                <li key={c.agentId} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !c.eligible && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{c.fullName} <span className="font-normal text-muted-foreground">· {te(`agentType.${c.agentType}`)}</span></div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1" style={{ color: c.coveredWeredas ? undefined : toneVar.warning }}><MapPinned className="h-3.5 w-3.5" />{t('coveredWeredas', { count: c.coveredWeredas })}</span>
                      <span>{t('openSites', { count: c.openTasks })}</span>
                      <span className="flex items-center gap-1">{c.sectors.map((s) => <SectorDot key={s} sector={s} />)}</span>
                      {!c.hasLogin && <span style={{ color: toneVar.warning }}>{t('noLogin')}</span>}
                      {c.currentRoles.length > 0 && <span>{t('alreadyAs', { roles: c.currentRoles.map((r) => te(`campaignRole.${r}`)).join(', ') })}</span>}
                    </div>
                    {!c.eligible && c.ineligibleReason && <div className="text-sm" style={{ color: toneVar.serious }}>{t(`ineligible.${c.ineligibleReason}` as 'ineligible.ALREADY_IN_ROLE')}</div>}
                  </div>
                  <Button size="sm" onClick={() => pick(c.agentId, c.fullName)} disabled={!c.eligible || add.isPending}><UserPlus />{t('addAs', { role: te(`campaignRole.${role}`) })}</Button>
                </li>))}</ul>
            )}
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{t('done')}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

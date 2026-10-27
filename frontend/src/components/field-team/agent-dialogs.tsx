'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { AccessResponse, AgentDetail, AgentStatus } from '@/lib/api/types';
import { useAgentAccess, useAgentStatus } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { Callout } from '@/components/projects/registration/ui';
import { Credentials } from './access-card';
import { agentStatusTone, toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

/** Status transition with the rules spelled out: reason for adverse changes, explicit release of open assignments. */
export function StatusDialog({ agent, open, onOpenChange }: { agent: AgentDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('fieldTeam.status');
  const ts = useTranslations('enums.agentStatus');
  const tc = useTranslations('common');
  const mutate = useAgentStatus(agent.summary.id);
  const [to, setTo] = React.useState<AgentStatus | null>(null);
  const [reason, setReason] = React.useState('');
  const [release, setRelease] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setTo(agent.allowedTransitions[0] ?? null); setReason(''); setRelease(false); setError(null); } }, [open, agent.allowedTransitions]);
  const active = agent.summary.activeAssignments;
  const adverse = to === 'SUSPENDED' || to === 'DEACTIVATED' || to === 'ON_LEAVE';
  const mustRelease = active > 0 && (to === 'SUSPENDED' || to === 'DEACTIVATED');
  const submit = async () => {
    if (!to) return;
    setError(null);
    try { await mutate.mutateAsync({ status: to, reason: reason.trim() || undefined, releaseAssignments: release }); onOpenChange(false); }
    catch (e) { setError(e instanceof ApiError ? (e.errors?.map((x) => x.message).join(' ') || e.detail || e.title) : tc('error')); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('title', { name: agent.summary.fullName })}</DialogTitle><DialogDescription>{t('loginEffect')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label={t('to')} className="grid gap-2">
            {agent.allowedTransitions.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={to === s} onClick={() => setTo(s)}
                className={cn('flex items-center gap-3 rounded-md border-2 px-4 py-2.5 text-left font-medium', to === s ? 'bg-muted/40' : 'border-border hover:bg-muted/30')} style={to === s ? { borderColor: toneVar[agentStatusTone[s]] } : undefined}>
                <span className="h-3 w-3 rounded-full" style={{ background: toneVar[agentStatusTone[s]] }} />{ts(s)}
              </button>
            ))}
          </div>
          {to === 'ACTIVE' && !agent.summary.onboarded && <Callout tone="warning">{t('activateNeeds')}</Callout>}
          <div className="space-y-1.5"><Label htmlFor="st-reason">{t('reason')}{adverse && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</Label><Textarea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[90px]" maxLength={2000} /><p className="text-xs text-muted-foreground">{t('reasonHint')}</p></div>
          {active > 0 && to !== 'ACTIVE' && (
            <label className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={release} onChange={(e) => setRelease(e.target.checked)} />
              <span><span className="block font-medium">{t('release', { count: active })}</span>{mustRelease && <span className="block text-sm text-muted-foreground">{t('releaseHint')}</span>}</span></label>
          )}
          {error && <Callout tone="error">{error}</Callout>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button><Button onClick={submit} disabled={!to || mutate.isPending || (mustRelease && !release)} variant={to === 'SUSPENDED' || to === 'DEACTIVATED' ? 'destructive' : 'default'}>{t('apply')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create the field app login, or reset its password. */
export function AccessDialog({ agent, open, onOpenChange }: { agent: AgentDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('fieldTeam.access');
  const tc = useTranslations('common');
  const mutate = useAgentAccess(agent.summary.id);
  const [result, setResult] = React.useState<AccessResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setResult(null); setError(null); } }, [open]);
  const has = agent.summary.hasAccount;
  const run = async () => { setError(null); try { setResult(await mutate.mutateAsync({})); } catch (e) { setError(e instanceof ApiError ? e.detail || e.title : tc('error')); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{agent.summary.fullName}{agent.summary.username ? ` · ${agent.summary.username}` : ''}</DialogDescription></DialogHeader>
        {result ? <Credentials access={result} name={agent.summary.fullName} /> : (
          <div className="space-y-3">
            {has && <Callout tone="warning">{t('confirmReset')}</Callout>}
            {agent.summary.status !== 'ACTIVE' && <p className="text-sm text-muted-foreground">{t('disabledNote')}</p>}
            {error && <Callout tone="error">{error}</Callout>}
          </div>
        )}
        <DialogFooter>
          {result ? <Button onClick={() => onOpenChange(false)}>{t('done')}</Button> : <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
            <Button onClick={run} disabled={mutate.isPending} variant={has ? 'destructive' : 'default'}>{has ? t('resetAction') : t('grant')}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

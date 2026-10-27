'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, CheckCircle2, MessageSquare, UserPlus, XCircle, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAlert, useAlertAction, useAssignableUsers } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canActOnAlerts } from '@/lib/domain';
import type { AlertAction } from '@/lib/api/types';
import { AlertSeverityBadge, AlertStatusBadge, SectorLabel } from '@/components/common/badges';
import { DataState } from '@/components/common/data-state';
import { fmtDateTime, money } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { Separator } from '@/components/ui/separator';
import { RecordDiscussion } from '@/components/messaging/record-discussion';

export function AlertDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const t = useTranslations('alerts');
  const tr = useTranslations('enums.rule');
  const th = useTranslations('enums.ruleHint');
  const te = useTranslations('enums.entityType');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useUser();
  const { data, isLoading, error, refetch } = useAlert(id);
  const act = useAlertAction(id);
  const [action, setAction] = React.useState<AlertAction>('ACKNOWLEDGE');
  const [note, setNote] = React.useState('');
  const [assignee, setAssignee] = React.useState<string>('');
  const canAct = canActOnAlerts(user.roles);
  const { data: users } = useAssignableUsers();
  const [feedback, setFeedback] = React.useState<string | null>(null);
  React.useEffect(() => { setNote(''); setFeedback(null); setAction('ACKNOWLEDGE'); }, [id]);

  const a = data?.alert;
  const closed = a && !['OPEN', 'ACKNOWLEDGED', 'ASSIGNED'].includes(a.status);
  const subjectHref = a ? (a.entityType === 'PROJECT' ? `/projects/${a.entityId}` : a.entityType === 'FACILITY' ? `/facilities/${a.entityId}` : `/weredas/${a.entityId}`) : '#';
  const needsNote = action === 'RESOLVE' || action === 'DISMISS';
  const submit = async () => {
    setFeedback(null);
    if (needsNote && !note.trim()) { setFeedback(t('actions.noteRequired')); return; }
    try {
      await act.mutateAsync({ action, note: note.trim() || undefined, assigneeUserId: action === 'ASSIGN' && assignee ? Number(assignee) : undefined });
      setNote(''); setFeedback(t('actions.done'));
    } catch (e) { setFeedback(e instanceof ApiError ? e.detail || e.title : tc('error')); }
  };
  const fmtMetric = (k: string, v: unknown) => typeof v === 'number' && /etb/i.test(k) ? money(v, locale) : typeof v === 'number' ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" className="max-w-2xl">
        {!a && <DialogTitle className="sr-only">{t('title')}</DialogTitle>}
        <DataState isLoading={isLoading} error={error} onRetry={refetch} rows={6}>
          {a && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2"><AlertSeverityBadge value={a.severity} /><AlertStatusBadge value={a.status} />{a.decisionRequired && <span className="rounded border px-1.5 text-2xs font-medium">{t('decisionBadge')}</span>}</div>
                <DialogTitle className="pr-6">{a.title}</DialogTitle>
                <DialogDescription>{tr(a.rule)} · {te(a.entityType)}{a.sector && <> · <SectorLabel sector={a.sector} /></>}{a.weredaName && <> · {a.weredaName}</>}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button asChild variant="outline" size="sm"><Link href={subjectHref}>{t('detail.openSubject', { type: te(a.entityType) })}: <span className="font-semibold truncate max-w-[280px]">{a.entityName ?? a.entityCode}</span><ArrowUpRight /></Link></Button>
              </div>
              <section className="rounded-md border bg-muted/30 p-3 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.why')}</h4>
                <p className="mt-1">{a.detail}</p>
                <p className="mt-2 text-xs text-muted-foreground">{th(a.rule)}</p>
                {a.metrics && Object.keys(a.metrics).length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tablet:grid-cols-3">
                    {Object.entries(a.metrics).map(([k, v]) => v !== null && <div key={k}><dt className="text-muted-foreground">{k.length <= 3 ? k.toUpperCase() : k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt><dd className="font-medium tabular">{fmtMetric(k, v)}</dd></div>)}
                  </dl>
                )}
              </section>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">{t('detail.triggered')}</dt><dd>{fmtDateTime(a.triggeredAt, locale)}</dd></div>
                <div><dt className="text-muted-foreground">{t('detail.acknowledged')}</dt><dd>{fmtDateTime(a.acknowledgedAt, locale)}</dd></div>
                <div><dt className="text-muted-foreground">{t('columns.assignee')}</dt><dd>{a.assignedToName ?? '—'}</dd></div>
              </dl>
              <Separator />
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.history')}</h4>
                {data.history.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">—</p> : (
                  <ol className="mt-2 space-y-2">
                    {data.history.map((h) => (
                      <li key={h.id} className="flex gap-2 text-sm">
                        <span className="mt-0.5 text-muted-foreground">{h.action === 'ACKNOWLEDGE' ? <Eye className="h-4 w-4" /> : h.action === 'ASSIGN' ? <UserPlus className="h-4 w-4" /> : h.action === 'RESOLVE' ? <CheckCircle2 className="h-4 w-4" /> : h.action === 'DISMISS' ? <XCircle className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}</span>
                        <div className="min-w-0"><div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{h.actorName ?? 'system'}</span><span>{t(`actions.${h.action.toLowerCase()}` as 'actions.acknowledge')}</span><span>· {fmtDateTime(h.createdAt, locale)}</span></div>{h.note && <p className="text-sm">{h.note}</p>}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <Separator />
              <section aria-labelledby="act-title">
                <h4 id="act-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('actions.title')}</h4>
                {!canAct ? <p className="mt-1 text-sm text-muted-foreground">{t('actions.readOnly')}</p> : (
                  <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('actions.title')}>
                      {(['ACKNOWLEDGE', 'ASSIGN', 'RESOLVE', 'DISMISS', 'COMMENT'] as AlertAction[]).map((x) => (
                        <Button key={x} type="button" role="radio" aria-checked={action === x} variant={action === x ? 'default' : 'outline'} size="sm" disabled={closed && x !== 'COMMENT'} onClick={() => setAction(x)}>{t(`actions.${x.toLowerCase()}` as 'actions.acknowledge')}</Button>
                      ))}
                    </div>
                    {action === 'ASSIGN' && (
                      <div className="space-y-1"><Label htmlFor="assignee">{t('actions.assignee')}</Label>
                        <Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="assignee"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{users?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName} · {u.roles.join(', ')}</SelectItem>)}</SelectContent></Select></div>
                    )}
                    <div className="space-y-1"><Label htmlFor="note">{t('actions.note')}{needsNote && ' *'}</Label><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('actions.notePlaceholder')} maxLength={2000} /></div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground" role="status">{feedback}</span>
                      <Button onClick={submit} disabled={act.isPending || (action === 'ASSIGN' && !assignee)}>{t('actions.submit')}</Button>
                    </div>
                  </div>
                )}
              </section>
              <Separator />
              <RecordDiscussion type="ALERT" id={a.id} threadClassName="h-[420px]" className="-mx-1" />
            </>
          )}
        </DataState>
      </DialogContent>
    </Dialog>
  );
}

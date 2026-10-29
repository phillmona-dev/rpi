'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, MapPin, ShieldCheck, Timer, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DataState } from '@/components/common/data-state';
import { Stat } from '@/components/common/page-header';
import { SectorLabel, ToneBadge } from '@/components/common/badges';
import { EvidenceGallery } from './evidence-gallery';
import { useInspection, useVerifyInspection } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canVerifyEvidence, toneVar, verificationTone } from '@/lib/domain';
import { fmtDate, fmtDateTime, localizedName, pct } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import type { VerificationStatus } from '@/lib/api/types';

export function InspectionDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const t = useTranslations('evidence');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useUser();
  const { data, isLoading, error, refetch } = useInspection(id);
  const verify = useVerifyInspection(id);
  const [status, setStatus] = React.useState<VerificationStatus>('VERIFIED');
  const [note, setNote] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null);
  React.useEffect(() => { setNote(''); setFeedback(null); setStatus('VERIFIED'); }, [id]);
  const s = data?.summary;
  const canAct = canVerifyEvidence(user.roles);
  const submit = async () => {
    setFeedback(null);
    if (status !== 'VERIFIED' && !note.trim()) { setFeedback(t('verify.noteRequired')); return; }
    try { await verify.mutateAsync({ status, note: note.trim() || undefined }); setFeedback(t('verify.done')); }
    catch (e) { setFeedback(e instanceof ApiError ? e.detail || e.title : tc('error')); }
  };
  const subjectHref = s ? (s.projectId ? `/projects/${s.projectId}` : `/facilities/${s.facilityId}`) : '#';
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" className="max-w-3xl">
        {!s && <DialogTitle className="sr-only">{t('inspections')}</DialogTitle>}
        <DataState isLoading={isLoading} error={error} onRetry={refetch} rows={6}>
          {data && s && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={verificationTone[s.verificationStatus]} label={te(`verification.${s.verificationStatus}`)} />{s.farFromSite && <ToneBadge tone="warning" label={t('detail.farWarning', { m: 250 })} />}</div>
                <DialogTitle className="pr-6">{te(`inspectionType.${s.inspectionType}`)} · {fmtDate(s.visitedOn, locale)}</DialogTitle>
                <DialogDescription>{s.inspectorName}{s.organization ? ` · ${s.organization}` : ''}{s.sector && <> · <SectorLabel sector={s.sector} /></>} · {localizedName(s.wereda.name, locale)}</DialogDescription>
              </DialogHeader>
              <Button asChild variant="outline" size="sm" className="w-fit"><Link href={subjectHref as '/'}>{s.projectId ? t('detail.openProject') : t('detail.openFacility')}: <span className="truncate max-w-[320px] font-semibold">{s.projectName ?? s.facilityName}</span><ArrowUpRight /></Link></Button>
              <div className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
                {s.observedProgressPct !== null && <Stat label={t('columns.observed')} value={pct(s.observedProgressPct)} hint={<span style={{ color: (s.progressGapPp ?? 0) <= -10 ? toneVar.critical : undefined }}>{t('columns.reportedSaid', { value: pct(s.reportedProgressPct) })}</span>} />}
                <Stat label={t('detail.ratings')} value={<span className="text-base">{t('detail.ratingValue', { quality: s.qualityRating ?? '—', safety: s.safetyRating ?? '—' })}</span>} hint={t('detail.ratingHint')} />
                <Stat label={t('detail.workforce')} value={<span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-muted-foreground" />{s.workforceObserved ?? '—'}</span>} />
                <Stat label={t('detail.location')} value={<span className="inline-flex items-center gap-1 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{s.distanceFromSiteM === null ? t('detail.noGps') : t('detail.distance', { m: Math.round(s.distanceFromSiteM) })}</span>} />
              </div>
              <section className="rounded-md border bg-muted/30 p-3 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.findings')}</h4>
                <p className="mt-1">{data.findings ?? '—'}</p>
                {data.recommendedAction && <><h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.recommended')}</h4><p className="mt-1">{data.recommendedAction}</p></>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {s.startedAt && s.endedAt && <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />{t('detail.duration', { minutes: Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000) })}</span>}
                  {s.syncedAt && <span>{t('detail.synced', { time: fmtDateTime(s.syncedAt, locale) })}</span>}
                </div>
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.media', { count: data.media.length })}</h4>
                <EvidenceGallery items={data.media} isLoading={false} compact />
              </section>
              <Separator />
              <section aria-labelledby="verify-title">
                <h4 id="verify-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('verify.title')}</h4>
                {s.verificationStatus !== 'UNVERIFIED' && <p className="mt-1 inline-flex items-center gap-1 text-sm"><ShieldCheck className="h-4 w-4" style={{ color: toneVar[verificationTone[s.verificationStatus]] }} />{s.verifiedByName ? t('detail.verifiedBy', { name: s.verifiedByName }) : ''}{s.verifiedAt ? ` · ${fmtDateTime(s.verifiedAt, locale)}` : ''}{data.verificationNote && <span className="text-muted-foreground"> · {data.verificationNote}</span>}</p>}
                {!canAct ? <p className="mt-1 text-sm text-muted-foreground">{t('verify.readOnly')}</p> : (
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-muted-foreground">{t('verify.hint')}</p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('verify.title')}>
                      {(['VERIFIED', 'DISPUTED', 'REJECTED'] as VerificationStatus[]).map((x) => <Button key={x} type="button" role="radio" aria-checked={status === x} variant={status === x ? 'default' : 'outline'} size="sm" onClick={() => setStatus(x)}>{t(`verify.${x.toLowerCase()}` as 'verify.verified')}</Button>)}
                    </div>
                    <div className="space-y-1"><Label htmlFor="vnote">{t('verify.note')}{status !== 'VERIFIED' && ' *'}</Label><Textarea id="vnote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground" role="status">{feedback}</span><Button onClick={submit} disabled={verify.isPending}>{tc('submit')}</Button></div>
                  </div>
                )}
              </section>
            </>
          )}
        </DataState>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, FolderPlus, MapPin, PencilLine } from 'lucide-react';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { AssessmentStatusBadge, NeedPriorityBadge, SectorLabel, SeverityBadge } from '@/components/common/badges';
import { ReviewPanel } from '@/components/damage/review-panel';
import { Fact } from '@/components/damage/shared';
import { Callout } from '@/components/projects/registration/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessment } from '@/lib/api/damage';
import { Link } from '@/i18n/navigation';
import { fmtDate, fmtDateTime, localizedName, money, num, pct } from '@/lib/format';
import { mediaSrc, toneVar } from '@/lib/domain';

export default function AssessmentPage() {
  const t = useTranslations('damage');
  const te = useTranslations('enums');
  const locale = useLocale();
  const id = Number(useParams<{ id: string }>().id);
  const saved = useSearchParams().get('saved') === '1';
  const { data: d, isLoading, error, refetch } = useAssessment(id);
  const s = d?.summary;
  useBreadcrumbs([{ label: t('title'), href: '/damage' }, ...(d?.campaign ? [{ label: d.campaign.code, href: `/damage/campaigns/${d.campaign.id}` }] : []), { label: s?.facility.name ?? '…' }]);
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {d && s && (
        <>
          <PageHeader title={s.facility.name}
            subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><SectorLabel sector={s.facility.sector} /><span>{te(`facilityType.${s.facility.facilityType}` as 'facilityType.FACTORY')}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{localizedName(s.facility.wereda.name, locale)}, {localizedName(s.facility.wereda.zoneName, locale)}</span>
              <span>{t('detail.assessedBy', { date: fmtDate(s.assessedOn, locale), name: s.assessorName })}</span></span>}
            meta={<><AssessmentStatusBadge value={s.status} /><SeverityBadge value={s.severity} /></>}
            actions={<>
              <Button asChild variant="outline"><Link href={`/facilities/${s.facility.id}`}><Building2 />{t('detail.facility')}</Link></Button>
              {d.permissions.canRevise && <Button asChild variant={s.status === 'RETURNED' ? 'default' : 'outline'}><Link href={`/damage/assessments/${s.id}/edit`}><PencilLine />{t('detail.revise')}</Link></Button>}
              {d.permissions.canCreateProject && <Button asChild><Link href={`/projects/new?assessment=${s.id}`}><FolderPlus />{t('needs.register')}</Link></Button>}
            </>} />
          {saved && <Callout>{s.status === 'SUBMITTED' ? t('detail.savedSubmitted') : t('detail.saved')}</Callout>}
          {s.status === 'RETURNED' && d.reviewNote && <Callout tone="warning"><span className="font-semibold">{t('detail.returned')}</span> {d.reviewNote}</Callout>}
          {s.status === 'REJECTED' && <Callout tone="error"><span className="font-semibold">{t('detail.rejected')}</span> {d.reviewNote}</Callout>}
          {d.uxoSuspected && <Callout tone="warning"><AlertTriangle className="mr-1 inline h-4 w-4" />{t('detail.uxo')}</Callout>}

          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-6">
            <Stat label={t('detail.impact')} value={<>{s.structuralImpactScore}<span className="text-sm font-normal text-muted-foreground">/100</span></>} />
            <Stat label={t('detail.capacity')} value={pct(s.functionalCapacityPct)} />
            <Stat label={t('detail.repair')} value={money(s.estimatedRepairCostEtb, locale)} />
            <Stat label={t('detail.replacement')} value={money(s.estimatedReplacementCostEtb, locale)} />
            <Stat label={t('detail.equipment')} value={money(d.equipmentLossEtb, locale)} />
            <Stat label={t('detail.people')} value={num(s.beneficiariesAffected, locale)} />
          </div>

          <div className="grid gap-5 desktop:grid-cols-12">
            <div className="space-y-5 desktop:col-span-8">
              <Section title={t('detail.findings')}>
                <dl className="grid gap-4 tablet:grid-cols-3">
                  <Fact label={t('detail.intervention')}>{s.recommendedIntervention ? te(`intervention.${s.recommendedIntervention}`) : '—'}</Fact>
                  <Fact label={t('detail.priority')}><NeedPriorityBadge value={s.interventionPriority} /></Fact>
                  <Fact label={t('detail.inventory')}>{pct(s.inventoryLossPct)}</Fact>
                  <Fact label={t('detail.access')}>{d.accessStatus ? te(`access.${d.accessStatus}`) : '—'}</Fact>
                  <Fact label={t('detail.use')}>{d.currentUse ? te(`currentUse.${d.currentUse}`) : '—'}</Fact>
                  <Fact label={t('detail.causes')}>{d.damageCauses.length ? d.damageCauses.map((c) => te(`damageCause.${c}`)).join(', ') : '—'}</Fact>
                </dl>
                {d.notes && <p className="mt-4 whitespace-pre-line rounded-md bg-muted/40 p-3">{d.notes}</p>}
              </Section>
              <Section title={t('detail.components')} hint={d.components.length ? t('detail.componentsTotal', { amount: money(d.componentRepairTotalEtb, locale) }) : undefined}>
                {!d.components.length ? <p className="text-sm text-muted-foreground">{t('detail.noComponents')}</p> : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">{t('form.components.element')}</th><th className="py-2 pr-3 font-medium">{t('form.components.condition')}</th><th className="py-2 pr-3 text-right font-medium">{t('form.components.cost')}</th><th className="py-2 font-medium">{t('form.components.note')}</th></tr></thead>
                    <tbody>{d.components.map((c) => <tr key={c.component} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{te(`component.${c.component}` as 'component.ROOF')}</td><td className="py-2 pr-3"><SeverityBadge value={c.condition} /></td><td className="py-2 pr-3 text-right tabular">{money(c.repairCostEtb, locale)}</td><td className="py-2 text-muted-foreground">{c.note}</td></tr>)}</tbody>
                  </table></div>
                )}
              </Section>
              <Section title={t('detail.photos', { count: d.photos.length })}>
                {!d.photos.length ? <p className="text-sm text-muted-foreground">{t('detail.noPhotos')}</p> : (
                  <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-4">{d.photos.map((p) => (
                    <li key={p.id} className="overflow-hidden rounded-md border">
                      <a href={mediaSrc(p.url)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaSrc(p.url)} alt={p.caption ?? s.facility.name} className="h-32 w-full object-cover" loading="lazy" />
                      </a>
                      {p.caption && <p className="truncate p-1.5 text-xs">{p.caption}</p>}
                    </li>))}</ul>
                )}
                {d.location && <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span className="tabular">{d.location.lat.toFixed(5)}, {d.location.lng.toFixed(5)}</span></p>}
              </Section>
            </div>
            <div className="space-y-5 desktop:col-span-4">
              <ReviewPanel assessment={d} />
              <Section title={t('detail.workflow')}>
                <dl className="space-y-3">
                  <Fact label={t('detail.campaign')}>{d.campaign ? <Link href={`/damage/campaigns/${d.campaign.id}`} className="text-primary hover:underline">{d.campaign.code} · {d.campaign.name}</Link> : t('adHoc')}</Fact>
                  <Fact label={t('detail.submittedBy')}>{d.submittedByName ?? '—'}{s.submittedAt && <span className="block text-sm font-normal text-muted-foreground">{fmtDateTime(s.submittedAt, locale)} · {t('detail.revisionN', { n: d.revision })}</span>}</Fact>
                  <Fact label={t('detail.verifiedBy')}>{s.status === 'VERIFIED' ? <>{d.verifiedByName}{s.verifiedAt && <span className="block text-sm font-normal text-muted-foreground">{fmtDateTime(s.verifiedAt, locale)}</span>}</> : <span className="text-muted-foreground">{t('detail.notYet')}</span>}</Fact>
                  <Fact label={t('detail.source')}>{te(`source.${s.source}`)}</Fact>
                  <Fact label={t('detail.project')}>{d.project ? <Link href={`/projects/${d.project.id}`} className="text-primary hover:underline">{d.project.code} · {d.project.name}</Link> : <span className="text-muted-foreground">{s.status === 'VERIFIED' ? t('detail.noProject') : '—'}</span>}</Fact>
                </dl>
              </Section>
              <Section title={t('detail.history')}>
                {!d.history.length ? <p className="text-sm text-muted-foreground">{t('detail.noHistory')}</p> : (
                  <ol className="space-y-3 border-l-2 pl-4">
                    {d.history.map((h, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-card" style={{ background: h.kind === 'VERIFIED' ? toneVar.good : h.kind === 'RETURNED' ? toneVar.serious : h.kind === 'REJECTED' ? toneVar.critical : 'hsl(var(--primary))' }} />
                        <div className="font-medium">{t(`events.${h.kind}` as 'events.SUBMITTED')}</div>
                        <div className="text-sm text-muted-foreground">{h.actorName} · {fmtDateTime(h.occurredAt, locale)}</div>
                        {h.note && <p className="mt-1 text-sm">{h.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>
          </div>
        </>
      )}
    </DataState>
  );
}

'use client';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Download, Users, Wallet, Wrench } from 'lucide-react';
import type { CampaignDetail, ResultBucket } from '@/lib/api/types';
import { useCampaignResults, useCampaignTasks } from '@/lib/api/damage';
import { Section } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { KpiRow, KpiTile } from '@/components/common/kpi-tile';
import { Button } from '@/components/ui/button';
import { CampaignProgressBar } from './shared';
import { money, num } from '@/lib/format';
import { needPriorityTone, severityTone, toneVar } from '@/lib/domain';
import type { DamageSeverity, NeedPriority } from '@/lib/api/types';

/** Verified findings of a campaign. Only verified assessments count; open submissions are shown in the progress line. */
export function ResultsPanel({ campaign }: { campaign: CampaignDetail }) {
  const t = useTranslations('damage.results');
  const te = useTranslations('enums');
  const locale = useLocale();
  const { data: r, isLoading, error, refetch } = useCampaignResults(campaign.summary.id);
  const { data: tasks } = useCampaignTasks(campaign.summary.id, {});
  const label = (group: string) => (k: string) => {
    if (k === 'UNSPECIFIED') return t('unspecified');
    switch (group) {
      case 'severity': return te(`severity.${k}` as 'severity.SEVERE');
      case 'intervention': return te(`intervention.${k}` as 'intervention.REHABILITATION');
      case 'priority': return te(`needPriority.${k}` as 'needPriority.HIGH');
      case 'type': return te(`facilityType.${k}` as 'facilityType.FACTORY');
      case 'cause': return te(`damageCause.${k}` as 'damageCause.LOOTING');
      case 'component': return te(`component.${k}` as 'component.ROOF');
      default: return k;
    }
  };
  const exportCsv = () => {
    if (!tasks) return;
    const head = ['Site code', 'Site', 'Facility type', 'Wereda', 'Zone', 'Status', 'Priority', 'Assessor', 'Verifier', 'Due', 'Severity', 'Replacement estimate (ETB)', 'Assessment ID'];
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = tasks.map((x) => [x.facility.code, x.facility.name, x.facility.facilityType, x.facility.wereda.name.en, x.facility.wereda.zoneName.en, x.status, x.priority,
      x.assessor?.fullName, x.verifier?.fullName, x.dueOn, x.severity, x.replacementEstimateEtb, x.assessmentId].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${campaign.summary.code}-sites.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch}>
      {r && (
        <div className="space-y-6">
          <Section title={t('progress')} actions={<Button variant="outline" onClick={exportCsv} disabled={!tasks}><Download />{t('export')}</Button>}>
            <CampaignProgressBar progress={r.progress} legend />
            <p className="mt-3 text-sm text-muted-foreground">{t('progressHint', { assessed: r.assessed, total: r.progress.total })}</p>
          </Section>
          <KpiRow>
            <KpiTile icon={Wrench} label={t('repair')} value={money(r.repairEstimateEtb, locale)} hint={t('equipment', { amount: money(r.equipmentLossEtb, locale) })} />
            <KpiTile icon={Wallet} label={t('replacement')} value={money(r.replacementEstimateEtb, locale)} />
            <KpiTile icon={Users} label={t('people')} value={num(r.beneficiariesAffected, locale)} />
            <KpiTile icon={AlertTriangle} label={t('flags')} value={num(r.uxoSites, locale)} accent={r.uxoSites ? toneVar.critical : undefined} hint={t('flagsHint', { idp: r.idpShelterSites, linked: r.needsLinkedToProjects })} />
          </KpiRow>
          {!r.assessed ? <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{t('none')}</p> : (
            <div className="grid gap-6 laptop:grid-cols-2">
              <Buckets title={t('bySeverity')} rows={r.bySeverity} label={label('severity')} color={(k) => toneVar[severityTone[k as DamageSeverity]] ?? undefined} />
              <Buckets title={t('byIntervention')} rows={r.byIntervention} label={label('intervention')} />
              <Buckets title={t('byPriority')} rows={r.byPriority} label={label('priority')} color={(k) => toneVar[needPriorityTone[k as NeedPriority]] ?? undefined} />
              <Buckets title={t('byWereda')} rows={r.byWereda} label={label('wereda')} />
              <Buckets title={t('byType')} rows={r.byFacilityType} label={label('type')} />
              <Buckets title={t('byCause')} rows={r.byCause} label={label('cause')} metric="sites" />
              <Buckets title={t('components')} hint={t('componentsHint')} rows={r.componentsDamaged} label={label('component')} metric="sites" className="laptop:col-span-2" />
            </div>
          )}
        </div>
      )}
    </DataState>
  );
}

function Buckets({ title, hint, rows, label, color, metric = 'estimate', className }: { title: string; hint?: string; rows: ResultBucket[]; label: (k: string) => string; color?: (k: string) => string | undefined; metric?: 'estimate' | 'sites'; className?: string }) {
  const t = useTranslations('damage.results');
  const locale = useLocale();
  const max = Math.max(1, ...rows.map((r) => (metric === 'sites' ? r.sites : r.estimateEtb)));
  return (
    <Section title={title} hint={hint} className={className}>
      {!rows.length ? <p className="text-sm text-muted-foreground">{t('noData')}</p> : (
        <ul className="space-y-2.5">{rows.map((r) => {
          const v = metric === 'sites' ? r.sites : r.estimateEtb;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{label(r.key)}</span>
                <span className="tabular text-muted-foreground">{t('sitesN', { count: r.sites })}{metric === 'estimate' ? ` · ${money(r.estimateEtb, locale)}` : r.estimateEtb ? ` · ${money(r.estimateEtb, locale)}` : ''}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: color?.(r.key) ?? 'var(--seq-450)' }} /></div>
            </li>
          );
        })}</ul>
      )}
    </Section>
  );
}

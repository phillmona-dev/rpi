'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { SectorSummary } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { Sparkline } from '@/components/charts/sparkline';
import { Progress } from '@/components/ui/progress';
import { sectorSlug, sectorVar, toneVar } from '@/lib/domain';
import { money, pct } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Section } from '@/components/common/page-header';

export function SectorCards({ sectors, isLoading }: { sectors?: SectorSummary[]; isLoading: boolean }) {
  const t = useTranslations('dashboard');
  const te = useTranslations('enums.sector');
  const tk = useTranslations('dashboard.kpi');
  const tp = useTranslations('projects');
  const locale = useLocale();
  return (
    <Section id="sectors" title={t('sectorSummary')} hint={t('sectorHint')}>
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {isLoading || !sectors ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px]" />) : sectors.map((s) => {
          const variance = (s.avgPhysicalProgressPct ?? 0) - (s.avgPlannedProgressPct ?? 0);
          const util = s.budgetEtb ? (s.disbursedEtb / s.budgetEtb) * 100 : 0;
          return (
            <Link key={s.sector} href={`/sectors/${sectorSlug[s.sector]}`} className="group rounded-lg border p-3.5 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring" style={{ borderLeft: `4px solid ${sectorVar[s.sector]}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{te(s.sector)}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">{tp('count', { count: s.projectsTotal })}<ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold tabular leading-none">{pct(s.avgPhysicalProgressPct)}</div>
                  <div className="text-2xs text-muted-foreground" style={{ color: variance <= -5 ? toneVar.serious : undefined }}>{Math.abs(variance) < 0.5 ? tk('onPlan') : variance < 0 ? tk('behind', { value: Math.abs(variance).toFixed(0) }) : tk('ahead', { value: variance.toFixed(0) })}</div>
                </div>
                <Sparkline values={s.progressSparkline} color={sectorVar[s.sector]} />
              </div>
              <Progress value={s.avgPhysicalProgressPct ?? 0} planned={s.avgPlannedProgressPct} tone={sectorVar[s.sector]} className="mt-2" label={te(s.sector)} />
              <dl className="mt-2.5 grid grid-cols-3 gap-2 text-2xs text-muted-foreground">
                <div><dt>{t('kpi.activeProjects')}</dt><dd className="text-sm font-medium text-foreground tabular">{s.projectsActive}<span className="text-muted-foreground font-normal">/{s.projectsTotal}</span></dd></div>
                <div><dt>{t('released')}</dt><dd className="text-sm font-medium text-foreground tabular">{pct(util)}<span className="text-muted-foreground font-normal"> · {money(s.budgetEtb, locale)}</span></dd></div>
                <div><dt>{t('metric.openAlerts')}</dt><dd className="text-sm font-medium tabular" style={{ color: s.criticalAlerts ? toneVar.critical : undefined }}>{s.openAlerts}{s.criticalAlerts ? <span className="font-normal text-2xs"> ({s.criticalAlerts} crit.)</span> : null}</dd></div>
              </dl>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

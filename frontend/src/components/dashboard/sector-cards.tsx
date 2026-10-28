'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { SectorSummary } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
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
            <Link key={s.sector} href={`/sectors/${sectorSlug[s.sector]}`} className="group rounded-lg border p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring" style={{ borderLeft: `4px solid ${sectorVar[s.sector]}` }}>
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">{te(s.sector)}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">{tp('count', { count: s.projectsTotal })}<ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-semibold tabular leading-none">{pct(s.avgPhysicalProgressPct)} <span className="text-sm font-normal text-muted-foreground">{t('workDone')}</span></div>
                <div className="mt-1 text-sm font-medium" style={{ color: variance <= -5 ? toneVar.serious : variance > 0.5 ? toneVar.good : undefined }}>{Math.abs(variance) < 0.5 ? tk('onPlan') : variance < 0 ? tk('behind', { value: Math.abs(variance).toFixed(0) }) : tk('ahead', { value: variance.toFixed(0) })}</div>
              </div>
              <Progress value={s.avgPhysicalProgressPct ?? 0} planned={s.avgPlannedProgressPct} tone={sectorVar[s.sector]} className="mt-2" label={te(s.sector)} />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                <div><dt>{t('sector.underWay')}</dt><dd className="font-medium text-foreground tabular">{s.projectsActive} <span className="font-normal text-muted-foreground">{t('sector.ofTotal', { total: s.projectsTotal })}</span></dd></div>
                <div><dt>{t('sector.money')}</dt><dd className="font-medium text-foreground tabular">{pct(util)} <span className="font-normal text-muted-foreground">{t('sector.ofBudget', { budget: money(s.budgetEtb, locale) })}</span></dd></div>
                <div><dt>{t('sector.problems')}</dt><dd className="font-medium tabular" style={{ color: s.criticalAlerts ? toneVar.critical : undefined }}>{s.openAlerts}{s.criticalAlerts ? <span className="font-normal"> · {t('sector.serious', { count: s.criticalAlerts })}</span> : null}</dd></div>
              </dl>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

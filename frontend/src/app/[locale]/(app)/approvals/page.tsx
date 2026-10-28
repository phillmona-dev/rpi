'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Clock, Hourglass, Undo2 } from 'lucide-react';
import { useApprovalCounts, useApprovalQueue } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { KpiRow, KpiTile } from '@/components/common/kpi-tile';
import { ApprovalBadge, SectorLabel } from '@/components/common/badges';
import { ReadinessMeter } from '@/components/approvals/readiness-meter';
import { Pagination } from '@/components/common/data-table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { canDecideApprovals, canSeeApprovals, toneVar } from '@/lib/domain';
import { SECTORS, type ApprovalQueueItem, type ApprovalStatus, type Sector } from '@/lib/api/types';
import { fmtDate, localizedName, money, relTime } from '@/lib/format';

const TABS = { pending: ['PENDING'], returned: ['RETURNED'], decided: ['APPROVED', 'REJECTED'] } as const satisfies Record<string, readonly ApprovalStatus[]>;
type Tab = keyof typeof TABS;

export default function ApprovalsPage() {
  const t = useTranslations('approvals');
  const user = useUser();
  useBreadcrumbs([{ label: t('title') }]);
  if (!canSeeApprovals(user.roles)) return (
    <><PageHeader title={t('title')} subtitle={t('subtitle')} /><DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState></>
  );
  return <ApprovalQueue />;
}

function ApprovalQueue() {
  const t = useTranslations('approvals');
  const ts = useTranslations('scope');
  const te = useTranslations('enums.sector');
  const locale = useLocale();
  const user = useUser();
  const { get, set } = useQueryParams();
  const tab = (get('tab') as Tab | null) ?? 'pending';
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const page = Number(get('page') ?? 0);
  const { data: counts, isLoading: cl } = useApprovalCounts();
  const { data, isLoading, error, refetch } = useApprovalQueue({ status: [...TABS[tab]], sector: sector ?? undefined, page, size: 20 });
  const oldest = counts?.oldestPendingDays ?? null;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={!user.sectorScope && (
        <Select value={sector ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}>
          <SelectTrigger className="w-[190px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(s)}</SelectItem>)}</SelectContent>
        </Select>
      )} />

      <KpiRow>
        <KpiTile loading={cl} icon={Hourglass} label={t('kpi.pending')} value={counts?.pending ?? 0} accent={counts && counts.pending > 0 ? toneVar.warning : undefined}
          hint={t('kpi.pendingHint', { budget: money(counts?.pendingBudgetEtb, locale).replace('ETB ', '') })} href="/approvals" />
        <KpiTile loading={cl} icon={Clock} label={t('kpi.oldest')} value={oldest === null ? '—' : t('kpi.days', { count: oldest })}
          accent={oldest !== null && oldest > 14 ? toneVar.critical : oldest !== null && oldest > 7 ? toneVar.serious : undefined} hint={oldest === null ? t('kpi.none') : undefined} />
        <KpiTile loading={cl} icon={Undo2} label={t('kpi.returned')} value={counts?.returned ?? 0} hint={t('kpi.returnedHint', { count: counts?.returnedLast30 ?? 0 })} href="/approvals?tab=returned" />
      </KpiRow>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'pending' ? null : v, page: null })}>
        <TabsList aria-label={t('title')}>
          {(Object.keys(TABS) as Tab[]).map((k) => (
            <TabsTrigger key={k} value={k}>{t(`tabs.${k}`)}{k === 'pending' && counts?.pending ? <span className="ml-2 rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground tabular">{counts.pending}</span> : null}{k === 'returned' && counts?.returned ? <span className="ml-2 rounded-full bg-muted-foreground/20 px-2 text-xs font-semibold tabular">{counts.returned}</span> : null}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length}
        emptyTitle={t(`empty.${tab}`)} emptyHint={tab === 'pending' ? t('empty.pendingHint') : undefined}
        skeleton={<div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>}>
        <ul className="space-y-3">
          {data?.content.map((item) => <QueueRow key={item.project.id} item={item} tab={tab} canDecide={canDecideApprovals(user.roles)} />)}
        </ul>
        {data && data.totalPages > 1 && <div className="rounded-lg border bg-card"><Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} /></div>}
      </DataState>
    </>
  );
}

function QueueRow({ item, tab, canDecide }: { item: ApprovalQueueItem; tab: Tab; canDecide: boolean }) {
  const t = useTranslations('approvals');
  const tl = useTranslations('projects.lifecycle.stages');
  const locale = useLocale();
  const p = item.project;
  const waiting = item.waitingDays;
  const waitColor = waiting === null ? undefined : waiting > 14 ? toneVar.critical : waiting > 7 ? toneVar.serious : undefined;
  return (
    <li className="rounded-lg border bg-card shadow-card transition-colors hover:border-primary/40">
      <div className="grid gap-4 p-5 laptop:grid-cols-12 laptop:items-center">
        <div className="min-w-0 laptop:col-span-5">
          <Link href={`/approvals/${p.id}`} className="block text-lg font-semibold leading-snug hover:underline">{p.name}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <SectorLabel sector={p.sector} /><span>{localizedName(p.wereda.name, locale)} · {localizedName(p.wereda.zoneName, locale)}</span>
          </div>
          {tab !== 'pending' && <div className="mt-2"><ApprovalBadge value={item.status} /></div>}
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm tablet:grid-cols-3 laptop:col-span-5">
          <div><dt className="text-muted-foreground">{t('columns.requested')}</dt><dd className="mt-0.5 text-base font-semibold tabular">{money(p.totalBudgetEtb, locale)}</dd><dd className="text-xs text-muted-foreground">{tl(p.lifecycleStage)}</dd></div>
          {tab === 'decided' ? (
            <div><dt className="text-muted-foreground">{t('columns.decided')}</dt><dd className="mt-0.5 font-medium">{fmtDate(item.decidedAt, locale)}</dd><dd className="text-xs text-muted-foreground">{item.decisionReference} · {item.decidedByName}</dd></div>
          ) : (
            <div><dt className="text-muted-foreground">{t('columns.submitted')}</dt><dd className="mt-0.5 font-medium">{relTime(item.submittedAt)}</dd><dd className="text-xs text-muted-foreground">{item.submittedByName && t('by', { name: item.submittedByName })}{item.resubmissions > 0 && <> · {t('resubmitted', { count: item.resubmissions })}</>}</dd></div>
          )}
          <div><dt className="text-muted-foreground">{t('columns.readiness')}</dt><dd className="mt-1"><ReadinessMeter r={item.readiness} /></dd></div>
        </dl>
        <div className="flex items-center justify-between gap-3 laptop:col-span-2 laptop:flex-col laptop:items-end">
          {tab === 'pending' && waiting !== null && <span className="text-sm font-medium tabular" style={{ color: waitColor }}>{t('waiting', { count: waiting })}</span>}
          <Button asChild variant={tab === 'pending' && canDecide ? 'default' : 'outline'}><Link href={`/approvals/${p.id}`}>{tab === 'pending' && canDecide ? t('review') : t('openDossier')}<ArrowRight /></Link></Button>
        </div>
      </div>
      {item.lastNote && tab !== 'decided' && (
        <div className="border-t bg-muted/30 px-5 py-3 text-sm"><span className="font-medium">{t('columns.note')}: </span><span className="text-muted-foreground line-clamp-2">{item.lastNote}</span></div>
      )}
    </li>
  );
}

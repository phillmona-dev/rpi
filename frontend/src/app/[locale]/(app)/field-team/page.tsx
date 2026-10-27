'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, ClipboardList, MapPinned, Search, UserPlus, Users } from 'lucide-react';
import { useAssignments, useCoverage, useFieldAgents, useFieldSummary, useZones } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, type Column } from '@/components/common/data-table';
import { KpiRow, KpiTile } from '@/components/common/kpi-tile';
import { AgentStatusBadge, CoverageGapBadge, SectorDot } from '@/components/common/badges';
import { AssignmentList } from '@/components/field-team/assignment-list';
import { AssignDialog, type AssignTarget } from '@/components/field-team/assign-dialog';
import { RiskChip } from '@/components/projects/risk-score';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { canManageFieldTeam, canSeeFieldTeam, toneVar } from '@/lib/domain';
import { SECTORS, type AgentStatus, type AgentSummary, type AgentType, type CoverageRow, type Sector } from '@/lib/api/types';
import { fmtDate, localizedName, relTime } from '@/lib/format';

const TYPES: AgentType[] = ['DATA_COLLECTOR', 'FIELD_ANALYST', 'FIELD_SUPERVISOR'];
const STATUSES: AgentStatus[] = ['ACTIVE', 'PENDING_ONBOARDING', 'ON_LEAVE', 'SUSPENDED', 'DEACTIVATED'];

export default function FieldTeamPage() {
  const t = useTranslations('fieldTeam');
  const user = useUser();
  useBreadcrumbs([{ label: t('title') }]);
  if (!canSeeFieldTeam(user.roles)) return <><PageHeader title={t('title')} subtitle={t('subtitle')} /><DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState></>;
  return <FieldTeam />;
}

function FieldTeam() {
  const t = useTranslations('fieldTeam');
  const user = useUser();
  const { get, set } = useQueryParams();
  const tab = get('tab') ?? 'roster';
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const manage = canManageFieldTeam(user.roles);
  const { data: s, isLoading } = useFieldSummary(sector);
  const [assign, setAssign] = React.useState<AssignTarget | null>(null);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={manage && <Button asChild size="lg"><Link href="/field-team/new"><UserPlus />{t('register')}</Link></Button>} />
      <KpiRow>
        <KpiTile loading={isLoading} icon={Users} label={t('kpi.active')} value={s?.active ?? 0}
          hint={s && t('kpi.activeHint', { collectors: s.activeByType.DATA_COLLECTOR ?? 0, analysts: s.activeByType.FIELD_ANALYST ?? 0, supervisors: s.activeByType.FIELD_SUPERVISOR ?? 0 })} />
        <KpiTile loading={isLoading} icon={MapPinned} label={t('kpi.coverage')} value={s?.coveragePct == null ? '—' : `${Math.round(s.coveragePct)}%`}
          accent={s && s.projectsWithoutTeam > 0 ? toneVar.serious : toneVar.good} hint={s && t('kpi.coverageHint', { without: s.projectsWithoutTeam })} href="/field-team?tab=coverage" />
        <KpiTile loading={isLoading} icon={ClipboardList} label={t('kpi.assignments')} value={s?.activeAssignments ?? 0} hint={s && t('kpi.assignmentsHint', { slots: s.availableSlots, full: s.agentsAtCapacity })} href="/field-team?tab=assignments" />
        <KpiTile loading={isLoading} icon={CalendarClock} label={t('kpi.overdue')} value={s?.overdueVisits ?? 0} accent={s && s.overdueVisits > 0 ? toneVar.critical : undefined}
          hint={s && t('kpi.attentionHint', { contracts: s.contractsEndingSoon, accounts: s.withoutAccount })} href="/field-team?tab=assignments&overdue=true" />
      </KpiRow>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'roster' ? null : v, overdue: null })}>
        <TabsList aria-label={t('title')}>{(['roster', 'assignments', 'coverage'] as const).map((k) => <TabsTrigger key={k} value={k}>{t(`tabs.${k}`)}</TabsTrigger>)}</TabsList>
        <TabsContent value="roster"><Roster sector={sector} /></TabsContent>
        <TabsContent value="assignments"><Assignments sector={sector} manage={manage} /></TabsContent>
        <TabsContent value="coverage"><Coverage sector={sector} manage={manage} onAssign={setAssign} /></TabsContent>
      </Tabs>
      {assign && <AssignDialog open onOpenChange={(o) => !o && setAssign(null)} project={assign} />}
    </>
  );
}

function Roster({ sector }: { sector: Sector | null }) {
  const t = useTranslations('fieldTeam');
  const te = useTranslations('enums');
  const ts = useTranslations('scope');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { get, set } = useQueryParams();
  const [q, setQ] = React.useState(get('q') ?? '');
  // Debounce the search box into the URL; `set` changes identity with every URL change, so it is deliberately not a dependency.
  React.useEffect(() => {
    const h = setTimeout(() => set({ q: q.trim() || null }), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const { data: zones } = useZones();
  const filters = { q: get('q') ?? undefined, type: get('type') ?? undefined, status: get('status') ?? undefined, zoneId: get('zoneId') ?? undefined, sector: sector ?? undefined, available: get('available') === 'true' || undefined };
  const { data, isLoading, error, refetch } = useFieldAgents(filters);

  const cols: Column<AgentSummary>[] = [
    { key: 'member', header: t('columns.member'), cell: (a) => (
      <div className="min-w-[210px]"><div className="font-semibold">{a.fullName}</div>
        <div className="text-sm text-muted-foreground">{te(`agentType.${a.agentType}`)} · {a.code}</div>
        {a.supervisorName && <div className="text-xs text-muted-foreground">↳ {a.supervisorName}</div>}</div>) },
    { key: 'status', header: t('columns.status'), cell: (a) => <AgentStatusBadge value={a.status} /> },
    { key: 'area', header: t('columns.area'), cell: (a) => (
      <div className="max-w-[220px]"><div className="truncate">{a.coverageZones.slice(0, 2).join(', ')}{a.coverageZones.length > 2 && ` +${a.coverageZones.length - 2}`}</div>
        <div className="flex items-center gap-1 pt-0.5">{a.sectors.map((x) => <SectorDot key={x} sector={x} />)}<span className="ml-1 text-xs text-muted-foreground">{a.homeWereda ? localizedName(a.homeWereda.name, locale) : ''}</span></div></div>) },
    { key: 'workload', header: t('columns.workload'), cell: (a) => {
      const full = a.activeAssignments >= a.maxActiveAssignments;
      return <div className="w-28"><div className="text-sm font-medium tabular" style={{ color: full ? toneVar.serious : undefined }}>{t('workload', { active: a.activeAssignments, max: a.maxActiveAssignments })}</div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (a.activeAssignments / a.maxActiveAssignments) * 100)}%`, background: full ? toneVar.serious : 'var(--seq-450)' }} /></div></div>;
    } },
    { key: 'overdue', header: t('columns.overdue'), align: 'right', cell: (a) => <span className="font-semibold tabular" style={{ color: a.overdueVisits ? toneVar.critical : undefined }}>{a.overdueVisits || '—'}</span> },
    { key: 'insp', header: t('columns.inspections'), align: 'right', cell: (a) => <span className="tabular">{a.inspections30d}</span> },
    { key: 'quality', header: t('columns.quality'), align: 'right', cell: (a) => a.acceptanceRate90d === null ? <span className="text-muted-foreground">—</span>
      : <span className="font-medium tabular" style={{ color: a.acceptanceRate90d < 70 ? toneVar.serious : a.acceptanceRate90d >= 85 ? toneVar.good : undefined }}>{Math.round(a.acceptanceRate90d)}%</span> },
    { key: 'last', header: t('columns.lastActivity'), cell: (a) => <div className="whitespace-nowrap text-sm">{a.lastInspectionOn ? fmtDate(a.lastInspectionOn, locale, 'short') : '—'}<div className="text-xs text-muted-foreground">{a.lastSyncAt ? relTime(a.lastSyncAt) : t('neverSynced')}</div></div> },
    { key: 'access', header: t('columns.access'), cell: (a) => a.hasAccount ? <span className="font-mono text-sm">{a.username}</span> : <span className="text-sm" style={{ color: toneVar.warning }}>{t('noAccount')}</span> },
  ];

  return (
    <Section title={t('tabs.roster')} actions={<span className="text-sm text-muted-foreground tabular">{data?.length ?? 0}</span>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full tablet:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filters.search')} className="pl-9" aria-label={t('filters.search')} /></div>
        <Select value={get('type') ?? 'ALL'} onValueChange={(v) => set({ type: v === 'ALL' ? null : v })}><SelectTrigger className="w-[180px]" aria-label={t('columns.role')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.type')}</SelectItem>{TYPES.map((x) => <SelectItem key={x} value={x}>{te(`agentType.${x}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={get('status') ?? 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={t('columns.status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.status')}</SelectItem>{STATUSES.map((x) => <SelectItem key={x} value={x}>{te(`agentStatus.${x}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.zone')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
        {!user.sectorScope && <Select value={get('sector') ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.sector')}</SelectItem>{SECTORS.map((x) => <SelectItem key={x} value={x}>{te(`sector.${x}`)}</SelectItem>)}</SelectContent></Select>}
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Switch checked={get('available') === 'true'} onCheckedChange={(v) => set({ available: v ? 'true' : null })} />{t('filters.available')}</label>
      </div>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('empty.roster')} emptyHint={t('empty.rosterHint')} skeleton={<TableSkeleton cols={8} />}>
        <DataTable columns={cols} rows={data ?? []} rowKey={(a) => a.id} onRowClick={(a) => router.push(`/field-team/${a.id}`)} rowClassName={(a) => a.status === 'DEACTIVATED' ? 'opacity-60' : undefined} />
      </DataState>
    </Section>
  );
}

function Assignments({ sector, manage }: { sector: Sector | null; manage: boolean }) {
  const t = useTranslations('fieldTeam');
  const te = useTranslations('enums.assignmentStatus');
  const { get, set } = useQueryParams();
  const status = get('astatus') ?? 'ACTIVE';
  const overdue = get('overdue') === 'true';
  const { data, isLoading, error, refetch } = useAssignments({ status: status === 'ALL' ? undefined : status, overdue: overdue || undefined, sector: sector ?? undefined });
  return (
    <Section title={t('tabs.assignments')} actions={<span className="text-sm text-muted-foreground tabular">{data?.length ?? 0}</span>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => set({ astatus: v === 'ACTIVE' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={t('columns.status')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('filters.assignmentStatus')}</SelectItem>{(['ACTIVE', 'COMPLETED', 'RELEASED'] as const).map((x) => <SelectItem key={x} value={x}>{te(x)}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Switch checked={overdue} onCheckedChange={(v) => set({ overdue: v ? 'true' : null })} />{t('filters.overdueOnly')}</label>
      </div>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('empty.assignments')} skeleton={<TableSkeleton cols={8} />}>
        <AssignmentList rows={data ?? []} show="both" canManage={manage} />
      </DataState>
    </Section>
  );
}

function Coverage({ sector, manage, onAssign }: { sector: Sector | null; manage: boolean; onAssign: (p: AssignTarget) => void }) {
  const t = useTranslations('fieldTeam');
  const tr = useTranslations('enums.assignmentRole');
  const ts = useTranslations('scope');
  const locale = useLocale();
  const { get, set } = useQueryParams();
  const gapsOnly = get('all') !== 'true';
  const { data: zones } = useZones();
  const { data, isLoading, error, refetch } = useCoverage({ sector: sector ?? undefined, zoneId: get('zoneId') ?? undefined, gapsOnly });
  const cols: Column<CoverageRow>[] = [
    { key: 'project', header: t('columns.project'), cell: (r) => <div className="min-w-[220px] max-w-[320px]"><Link href={`/projects/${r.project.id}`} className="flex items-center gap-1.5 font-medium hover:underline"><SectorDot sector={r.project.sector} /><span className="truncate">{r.project.name}</span></Link><div className="truncate text-xs text-muted-foreground">{r.project.code} · {r.project.weredaName} · {r.project.zoneName}</div></div> },
    { key: 'gap', header: t('columns.gap'), cell: (r) => <CoverageGapBadge value={r.gap} /> },
    { key: 'team', header: t('columns.team'), cell: (r) => r.team.length ? <ul className="space-y-0.5 text-sm">{r.team.map((a) => <li key={a.id}><Link href={`/field-team/${a.agent.id}`} className="hover:underline">{a.agent.fullName}</Link> <span className="text-muted-foreground">· {tr(a.role)}</span>{a.overdueDays ? <span className="ml-1 font-medium" style={{ color: toneVar.critical }}>· {t('overdueBy', { days: a.overdueDays })}</span> : null}</li>)}</ul> : <span className="text-muted-foreground">—</span> },
    { key: 'verified', header: t('columns.verified'), cell: (r) => <span className="whitespace-nowrap" style={{ color: r.daysSinceVerified !== null && r.daysSinceVerified > 60 ? toneVar.serious : undefined }}>{r.lastVerifiedAt ? fmtDate(r.lastVerifiedAt, locale, 'short') : '—'}</span> },
    { key: 'risk', header: t('columns.risk'), cell: (r) => <RiskChip score={r.project.riskScore} /> },
  ];
  if (manage) cols.push({ key: 'act', header: '', align: 'right', cell: (r) => <Button size="sm" variant={r.gap === 'NO_TEAM' || r.gap === 'NO_LEAD' ? 'default' : 'outline'} onClick={(e) => { e.stopPropagation(); onAssign({ id: r.project.id, code: r.project.code, name: r.project.name, status: r.project.status }); }}>{t('assignShort')}</Button> });
  return (
    <Section title={t('tabs.coverage')} actions={<span className="text-sm text-muted-foreground tabular">{data?.length ?? 0}</span>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[180px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.zone')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Switch checked={gapsOnly} onCheckedChange={(v) => set({ all: v ? null : 'true' })} />{t('filters.gapsOnly')}</label>
      </div>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('empty.coverage')} skeleton={<TableSkeleton cols={6} />}>
        <DataTable columns={cols} rows={data ?? []} rowKey={(r) => r.project.id} />
      </DataState>
    </Section>
  );
}

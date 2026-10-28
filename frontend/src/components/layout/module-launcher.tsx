'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutDashboard, BrainCircuit, Globe2, Bell,
  Layers, Map, FolderKanban, Building2, Camera,
  Wallet, FileText, FileBarChart2, Users, ScrollText,
  ChevronRight, Radio, ShieldCheck, Target, Search, X, History, Stamp, UsersRound, MessagesSquare, ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { canAdmin, canSeeAudit, canSeeBrief, canSeeFinance, canSeeReports, canSeeIntelligence, canSeeApprovals, canSeeFieldTeam, canSeeDamage, isFieldTeam } from '@/lib/domain';
import { useApprovalCounts, useFieldSummary, useOverview } from '@/lib/api/hooks';
import { useChatUnread } from '@/lib/api/messaging';
import { useDamageOverview } from '@/lib/api/damage';
import type { ApprovalCounts, ChatUnread, DamageOverview, Overview, TeamSummary } from '@/lib/api/types';
import { money, num, pct, relTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ─── Module card definition ──────────────────────────────────────── */
type Category = 'command' | 'operations' | 'analysis' | 'records' | 'administration';

interface Stat {
  /** Headline figure, already formatted */
  value: React.ReactNode;
  /** What the figure is */
  label: string;
  /** Secondary context line */
  detail?: React.ReactNode;
  /** Colour the figure (status var) — used sparingly for things that need action */
  accent?: string;
}

interface ModuleCard {
  href: string;
  /** nav.* key for the title; launcher.desc.* key for the description */
  key: string;
  icon: LucideIcon;
  category: Category;
  /** Live figure derived from the overview; undefined while loading, null when the module has none */
  stat?: Stat | null;
}

const CATEGORIES: Category[] = ['command', 'operations', 'analysis', 'records', 'administration'];

/* ─── Module definitions ───────────────────────────────────────────── */
function useModules(roles: string[], ov: Overview | undefined, locale: string, ap?: ApprovalCounts, ft?: TeamSummary, chat?: ChatUnread, da?: DamageOverview): ModuleCard[] {
  const t = useTranslations('launcher.stat');
  const k = ov?.kpis;
  const a = ov?.alertCounts;
  const loading = !ov;
  const s = (stat: Stat): Stat | undefined => (loading ? undefined : stat);
  const n = (v: number | null | undefined) => num(v, locale);

  const attention = k ? k.projectsAtRisk + k.projectsDelayed + k.projectsStalled : 0;
  const weredasActive = ov ? ov.weredas.filter((w) => w.projectsTotal > 0).length : 0;
  const disbPct = k && k.budgetEtb ? (k.disbursedEtb / k.budgetEtb) * 100 : 0;

  return [
    /* ── Command ─────────────────────────────────────── */
    {
      href: '/dashboard', key: 'commandCenter', icon: LayoutDashboard, category: 'command',
      stat: s({
        value: n(k?.projectsActive), label: t('activeProjects'),
        detail: t('progressDetail', { physical: pct(k?.avgPhysicalProgressPct), planned: pct(k?.avgPlannedProgressPct) }),
      }),
    },
    ...(canSeeIntelligence(roles) ? [{
      href: '/intelligence', key: 'intelligence', icon: BrainCircuit, category: 'command',
      stat: s({
        value: n(attention), label: t('needAttention'),
        detail: t('attentionDetail', { stalled: n(k?.projectsStalled), delayed: n(k?.projectsDelayed) }),
        accent: attention > 0 ? 'var(--status-serious)' : undefined,
      }),
    } as ModuleCard] : []),
    {
      href: '/map', key: 'map', icon: Globe2, category: 'command',
      stat: s({
        value: n(weredasActive), label: t('weredasWithProjects'),
        detail: t('severeFacilities', { count: n(k?.facilitiesSevere) }),
      }),
    },
    {
      href: '/alerts', key: 'alerts', icon: Bell, category: 'command',
      stat: s({
        value: n(a?.decisionRequired), label: t('decisionsPending'),
        detail: t('decisionsDetail', { critical: n(a?.critical), open: n(a?.open) }),
        accent: (a?.decisionRequired ?? 0) > 0 ? 'var(--status-critical)' : undefined,
      }),
    },
    {
      href: '/messages', key: 'messages', icon: MessagesSquare, category: 'command',
      stat: chat ? {
        value: n(chat.total), label: t('unreadMessages'),
        detail: t('messagesDetail', { conversations: n(chat.conversations), mentions: n(chat.mentions) }),
        accent: chat.mentions > 0 ? 'var(--status-warning)' : undefined,
      } : undefined,
    },
    /* ── Field operations ─────────────────────────────── */
    ...(canSeeDamage(roles) || isFieldTeam(roles) ? [{
      href: canSeeDamage(roles) ? '/damage' : '/damage/my-tasks', key: 'damage', icon: ClipboardCheck, category: 'operations',
      stat: da ? (canSeeDamage(roles) ? {
        value: n(da.awaitingReview), label: t('awaitingVerification'),
        detail: t('damageDetail', { active: n(da.campaignsActive), needs: n(da.needsAwaitingProject) }),
        accent: da.awaitingReview > 0 ? 'var(--status-warning)' : undefined,
      } : {
        value: n(da.mine.toAssess + da.mine.returned), label: t('sitesToAssess'),
        detail: t('mySitesDetail', { returned: n(da.mine.returned), review: n(da.mine.toReview) }),
        accent: da.mine.returned > 0 ? 'var(--status-serious)' : undefined,
      }) : undefined,
    } as ModuleCard] : []),
    ...(canSeeApprovals(roles) ? [{
      href: '/approvals', key: 'approvals', icon: Stamp, category: 'operations',
      stat: ap ? {
        value: n(ap.pending), label: t('awaitingDecision'),
        detail: t('approvalDetail', { returned: n(ap.returned), days: ap.oldestPendingDays ?? 0 }),
        accent: ap.pending > 0 ? 'var(--status-warning)' : undefined,
      } : undefined,
    } as ModuleCard] : []),
    ...(canSeeFieldTeam(roles) ? [{
      href: '/field-team', key: 'fieldTeam', icon: UsersRound, category: 'operations',
      stat: ft ? {
        value: n(ft.active), label: t('membersActive'),
        detail: t('fieldDetail', { coverage: ft.coveragePct == null ? '—' : `${Math.round(ft.coveragePct)}%`, overdue: n(ft.overdueVisits) }),
        accent: ft.overdueVisits > 0 ? 'var(--status-serious)' : undefined,
      } : undefined,
    } as ModuleCard] : []),
    /* ── Analysis ─────────────────────────────────────── */
    {
      href: '/sectors', key: 'sectors', icon: Layers, category: 'analysis',
      stat: s({ value: n(ov?.sectors.length), label: t('sectors'), detail: t('openAlerts', { count: n(a?.open) }) }),
    },
    {
      href: '/geography', key: 'geography', icon: Map, category: 'analysis',
      stat: s({ value: n(ov?.weredas.length), label: t('weredas'), detail: t('delayedProjects', { count: n(k?.projectsDelayed) }) }),
    },
    {
      href: '/projects', key: 'projects', icon: FolderKanban, category: 'analysis',
      stat: s({ value: n(k?.projectsTotal), label: t('projects'), detail: t('completed', { count: n(k?.projectsCompleted) }) }),
    },
    {
      href: '/facilities', key: 'facilities', icon: Building2, category: 'analysis',
      stat: s({ value: n(k?.facilitiesTotal), label: t('facilities'), detail: t('facilitiesDetail', { severe: n(k?.facilitiesSevere), restored: n(k?.facilitiesRestored) }) }),
    },
    {
      href: '/evidence', key: 'evidence', icon: Camera, category: 'analysis',
      stat: s({ value: n(k?.assessmentsLast7Days), label: t('assessments7d'), detail: t('progressReports', { count: n(k?.progressReportsLast7Days) }) }),
    },
    ...(canSeeFinance(roles) ? [{
      href: '/finance', key: 'finance', icon: Wallet, category: 'analysis',
      stat: s({ value: money(k?.disbursedEtb, locale), label: t('disbursed'), detail: t('ofBudget', { pct: pct(disbPct), budget: money(k?.budgetEtb, locale) }) }),
    } as ModuleCard] : []),
    /* ── Records ──────────────────────────────────────── */
    ...(canSeeBrief(roles) ? [{
      href: '/briefing', key: 'briefing', icon: FileText, category: 'records',
      stat: s({ value: relTime(k?.lastProgressDataAt), label: t('latestProgress') }),
    } as ModuleCard] : []),
    ...(canSeeReports(roles) ? [{
      href: '/reports', key: 'reports', icon: FileBarChart2, category: 'records', stat: null,
    } as ModuleCard] : []),
    /* ── Administration ───────────────────────────────── */
    ...(canAdmin(roles) ? [{
      href: '/admin/users', key: 'users', icon: Users, category: 'administration', stat: null,
    } as ModuleCard] : []),
    ...(canSeeAudit(roles) ? [{
      href: '/admin/audit', key: 'audit', icon: ScrollText, category: 'administration', stat: null,
    } as ModuleCard] : []),
  ];
}

/* ─── Per-user open history (browser-local convenience, never authoritative) ─ */
type Usage = Record<string, { n: number; t: number }>;

function useModuleUsage(userId: number) {
  const storageKey = `rpis.launcher.usage.${userId}`;
  const [usage, setUsage] = React.useState<Usage>({});

  // Read after mount so server and first client render agree.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setUsage(JSON.parse(raw) as Usage);
    } catch { /* storage blocked or corrupt — start empty */ }
  }, [storageKey]);

  const persist = React.useCallback((next: Usage) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

  const record = React.useCallback((key: string) => {
    setUsage((prev) => {
      const next = { ...prev, [key]: { n: (prev[key]?.n ?? 0) + 1, t: Date.now() } };
      persist(next);
      return next;
    });
  }, [persist]);

  /** Drop one module's history; it simply stays in its category section. */
  const forget = React.useCallback((key: string) => {
    setUsage((prev) => {
      const { [key]: _removed, ...next } = prev;
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = React.useCallback(() => {
    setUsage({});
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  return { usage, record, forget, clear };
}

/** Most-opened first; ties broken by most recent. */
const byUsage = (usage: Usage) => (a: ModuleCard, b: ModuleCard) =>
  (usage[b.key]?.n ?? 0) - (usage[a.key]?.n ?? 0) || (usage[b.key]?.t ?? 0) - (usage[a.key]?.t ?? 0);

const FREQUENT_LIMIT = 4;

/* ─── Main page ────────────────────────────────────────────────────── */
export function ModuleLauncher() {
  const user = useUser();
  const locale = useLocale();
  const tn = useTranslations('nav');
  const tr = useTranslations('roles');
  const ta = useTranslations('app');
  const tc = useTranslations('launcher.context');
  const te = useTranslations('enums.sector');
  const tAuth = useTranslations('auth');
  const tdesc = useTranslations('launcher.desc');
  const ts = useTranslations('launcher.search');
  const router = useRouter();
  const { data: ov } = useOverview({ sector: user.sectorScope });
  const { data: ap } = useApprovalCounts(canSeeApprovals(user.roles));
  const { data: ft } = useFieldSummary(user.sectorScope, canSeeFieldTeam(user.roles));
  const { data: chat } = useChatUnread();
  const { data: da } = useDamageOverview(user.sectorScope, canSeeDamage(user.roles) || isFieldTeam(user.roles));
  const modules = useModules(user.roles, ov, locale, ap, ft, chat, da);
  const { usage, record, forget, clear } = useModuleUsage(user.id);

  /* ── Search ── */
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const q = query.trim().toLocaleLowerCase(locale);

  // "/" focuses the search box unless the user is already typing somewhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = React.useMemo(() => {
    if (!q) return [];
    const scored = modules.flatMap((m) => {
      const title = tn(m.key).toLocaleLowerCase(locale);
      const haystack = [title, tdesc(m.key), tn(m.category), m.stat?.label ?? ''].join(' ').toLocaleLowerCase(locale);
      const score = title.startsWith(q) ? 3 : title.includes(q) ? 2 : haystack.includes(q) ? 1 : 0;
      return score ? [{ m, score }] : [];
    });
    const usageOrder = byUsage(usage);
    return scored.sort((a, b) => b.score - a.score || usageOrder(a.m, b.m)).map((r) => r.m);
  }, [q, modules, usage, locale, tn, tdesc]);

  const frequent = React.useMemo(
    () => modules.filter((m) => usage[m.key]?.n).sort(byUsage(usage)).slice(0, FREQUENT_LIMIT),
    [modules, usage],
  );

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    if (e.key === 'Enter' && results[0]) {
      record(results[0].key);
      router.push(results[0].href as '/');
    }
  };

  const byCategory = CATEGORIES
    .map((cat) => ({ cat, cards: modules.filter((m) => m.category === cat) }))
    .filter((g) => g.cards.length > 0);

  const pending = <Skeleton className="inline-block h-3 w-16 align-middle" />;
  const context: { icon: LucideIcon; label: string; value: React.ReactNode }[] = [
    { icon: Target, label: tc('scope'), value: user.sectorScope ? tc('sectorScope', { sector: te(user.sectorScope) }) : tc('region') },
    { icon: Radio, label: tc('lastFieldData'), value: ov ? relTime(ov.kpis.lastFieldDataAt) : pending },
    { icon: Bell, label: tc('openAlerts'), value: ov ? num(ov.alertCounts.open, locale) : pending },
    { icon: ShieldCheck, label: tc('access'), value: tc('auditLogged') },
  ];

  return (
    <div className="py-2 tablet:py-4 space-y-10">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-card">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground tablet:text-2xl">
                {ta('name')}
              </h1>
              <p className="text-sm text-muted-foreground">{ta('tagline')}</p>
            </div>
          </div>
          <div className="hidden text-right tablet:block">
            <div className="text-sm font-medium text-foreground">{user.fullName}</div>
            <div className="text-xs text-muted-foreground">{user.roles.map((r) => tr(r)).join(' · ')}</div>
          </div>
        </div>

        {/* Context strip — real figures, not slogans */}
        <dl className="flex flex-wrap gap-2">
          {context.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-1.5 text-xs shadow-[0_2px_0_0_hsl(var(--border))]">
              <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold text-foreground tabular">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Search */}
        <div>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={ts('placeholder')}
              aria-label={ts('label')}
              aria-describedby="launcher-search-hint"
              autoComplete="off"
              className={cn(
                'h-11 w-full rounded-lg border-2 border-border bg-card pl-10 pr-20 text-sm text-foreground',
                'shadow-[0_3px_0_0_hsl(var(--border))] placeholder:text-muted-foreground',
                'focus-visible:border-primary/70 focus-visible:ring-0 focus-visible:ring-offset-0',
                '[&::-webkit-search-cancel-button]:hidden',
              )}
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                aria-label={ts('clear')}
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">/</kbd>
            )}
          </div>
          <p id="launcher-search-hint" className="mt-2 hidden text-2xs text-muted-foreground tablet:block">{ts('hint')}</p>
        </div>
      </div>

      {q ? (
        /* ── Search results ─────────────────────────────────────────────── */
        <section aria-labelledby="launcher-results" className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 id="launcher-results" className="text-xs font-bold uppercase tracking-widest text-muted-foreground" aria-live="polite">
              {ts('results', { count: results.length })}
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          {results.length ? (
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-3">
              {results.map((card) => <RowCard key={card.href} card={card} onOpen={record} usage={usage[card.key]} />)}
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {ts('noResults', { query: query.trim() })}
            </div>
          )}
        </section>
      ) : (<>

      {/* ── Frequently opened ─────────────────────────────────────────── */}
      {frequent.length > 0 && (
        <section aria-labelledby="launcher-frequent" className="space-y-4">
          <div className="flex items-center gap-3">
            <History className="h-3.5 w-3.5 text-primary" aria-hidden />
            <h2 id="launcher-frequent" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {ts('frequent')}
            </h2>
            <span className="hidden text-2xs text-muted-foreground tablet:inline">· {ts('frequentHint')}</span>
            <div className="h-px flex-1 bg-border" />
            <button type="button" onClick={clear} className="text-2xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {ts('clearHistory')}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-4">
            {frequent.map((card) => <RowCard key={card.href} card={card} onOpen={record} usage={usage[card.key]} onRemove={forget} compact />)}
          </div>
        </section>
      )}

      {/* ── Module groups ─────────────────────────────────────────────── */}
      {byCategory.map(({ cat, cards }) => (
        <section key={cat} aria-labelledby={`launcher-${cat}`} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 id={`launcher-${cat}`} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {tn(cat)}
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>

          {cat === 'command' ? (
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
              {cards.map((card) => <HeroCard key={card.href} card={card} onOpen={record} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-3">
              {cards.map((card) => <RowCard key={card.href} card={card} onOpen={record} />)}
            </div>
          )}
        </section>
      ))}
      </>)}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border pt-6 text-center text-2xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{ta('name')}</span>
          {' '}· {ta('office')}
        </p>
        <p className="mt-1">{tAuth('secure')}</p>
      </footer>
    </div>
  );
}

/* ─── Shared pieces ────────────────────────────────────────────────── */
/* A "physical" card: 2px border, a solid 4px edge underneath, and a press-down on hover. */
const cardEdge = 'shadow-[0_4px_0_0_hsl(var(--border)),0_6px_14px_-4px_rgb(0_0_0/0.35)]';
const cardEdgePressed = 'hover:translate-y-[2px] hover:shadow-[0_2px_0_0_hsl(var(--border)),0_3px_8px_-4px_rgb(0_0_0/0.35)]';
const cardBase =
  'group relative flex overflow-hidden rounded-lg border-2 border-border bg-card text-card-foreground ' +
  cardEdge + ' transition-[border-color,box-shadow,transform] duration-150 ' +
  'hover:border-primary/60 ' + cardEdgePressed + ' ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function IconChip({ icon: Icon, hero }: { icon: LucideIcon; hero?: boolean }) {
  return (
    <div className={cn(
      'flex shrink-0 items-center justify-center rounded-md transition-colors duration-200',
      hero ? 'h-10 w-10 bg-primary/10 text-primary' : 'h-9 w-9 bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
    )}>
      <Icon className={hero ? 'h-5 w-5' : 'h-[18px] w-[18px]'} aria-hidden />
    </div>
  );
}

function StatValue({ stat, className }: { stat: Stat | undefined; className?: string }) {
  if (stat === undefined) return <Skeleton className={cn('h-7 w-16', className)} />;
  return (
    <span className={cn('font-semibold tabular leading-none', className)} style={stat.accent ? { color: stat.accent } : undefined}>
      {stat.value}
    </span>
  );
}

/* ─── Command tile: icon, title, live figure, one-line purpose ─────── */
function HeroCard({ card, onOpen }: { card: ModuleCard; onOpen: (key: string) => void }) {
  const tn = useTranslations('nav');
  const td = useTranslations('launcher.desc');
  const tCommon = useTranslations('common');
  return (
    <Link href={card.href} onClick={() => onOpen(card.key)} className={cn(cardBase, 'flex-col p-5 pl-6')}>
      {/* thick side rail */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-primary/80 transition-colors group-hover:bg-primary" />

      <div className="flex items-center gap-3">
        <IconChip icon={card.icon} hero />
        <h3 className="text-sm font-semibold leading-tight text-foreground">{tn(card.key)}</h3>
      </div>

      <div className="mt-5">
        <StatValue stat={card.stat ?? undefined} className="text-3xl" />
        {card.stat && <div className="mt-1 text-xs font-medium text-muted-foreground">{card.stat.label}</div>}
        {card.stat === undefined && <Skeleton className="mt-1.5 h-3 w-24" />}
      </div>
      {card.stat?.detail && <div className="mt-1 text-xs text-muted-foreground tabular">{card.stat.detail}</div>}

      <p className="mt-4 flex-1 text-xs leading-relaxed text-muted-foreground">{td(card.key)}</p>

      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
        {tCommon('open')}
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}

/* ─── Compact row: icon, title + purpose, figure at the right ──────── */
function RowCard({ card, onOpen, onRemove, usage, compact }: {
  card: ModuleCard;
  onOpen: (key: string) => void;
  /** When given, shows an × that removes the module from the history */
  onRemove?: (key: string) => void;
  /** When given, shows how often / how recently this user opened the module */
  usage?: { n: number; t: number };
  /** Narrow tile: hides the live figure so title and history fit */
  compact?: boolean;
}) {
  const tn = useTranslations('nav');
  const td = useTranslations('launcher.desc');
  const ts = useTranslations('launcher.search');
  const link = (
    <Link href={card.href} onClick={() => onOpen(card.key)} className={cn(cardBase, 'items-center gap-4 px-4 py-3.5 pl-5', onRemove && 'h-full pr-12')}>
      {/* side rail — neutral until hovered */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-border transition-colors group-hover:bg-primary" />
      <IconChip icon={card.icon} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-tight text-foreground">{tn(card.key)}</h3>
        {!compact && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{td(card.key)}</p>}
        {usage && (
          <p className="mt-1 text-2xs font-medium text-primary/90 tabular">
            {ts('opened', { count: usage.n })} · {relTime(new Date(usage.t).toISOString())}
          </p>
        )}
      </div>
      {!compact && card.stat !== null && (
        <div className="hidden shrink-0 flex-col items-end text-right tablet:flex">
          <StatValue stat={card.stat} className="text-lg" />
          {card.stat ? (
            <>
              <span className="mt-0.5 text-2xs text-muted-foreground">{card.stat.label}</span>
              {card.stat.detail && <span className="text-2xs text-muted-foreground tabular">{card.stat.detail}</span>}
            </>
          ) : <Skeleton className="mt-1 h-2.5 w-14" />}
        </div>
      )}
      {!onRemove && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
    </Link>
  );
  if (!onRemove) return link;
  // The × is a sibling of the link, not inside it: a button nested in an <a> is invalid and would also navigate.
  return (
    <div className="relative">
      {link}
      <button
        type="button"
        onClick={() => onRemove(card.key)}
        aria-label={ts('remove', { module: tn(card.key) })}
        title={ts('remove', { module: tn(card.key) })}
        className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

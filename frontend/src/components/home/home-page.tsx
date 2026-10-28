'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, ClipboardCheck, FolderPlus, MessagesSquare, ShieldAlert, Stamp, Undo2, UsersRound, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { useApprovalCounts, useFieldSummary, useOverview } from '@/lib/api/hooks';
import { useDamageOverview } from '@/lib/api/damage';
import { useChatUnread } from '@/lib/api/messaging';
import { DESTINATION_GROUPS, destinationsFor } from '@/components/layout/destinations';
import { Skeleton } from '@/components/ui/skeleton';
import { canActOnAlerts, canCreateProject, canDecideApprovals, canSeeApprovals, canSeeDamage, canSeeFieldTeam, canSeeFinance, isFieldTeam, toneVar } from '@/lib/domain';
import { money, num } from '@/lib/format';

interface Task { key: string; icon: LucideIcon; text: string; action: string; href: string; tone?: string }

/**
 * Home: what needs this person's attention, a few figures in plain words, and where to go next.
 * Everything a person can act on is a sentence with one button; nothing needs explaining.
 */
export function HomePage() {
  const t = useTranslations('home');
  const tn = useTranslations('nav');
  const tr = useTranslations('roles');
  const te = useTranslations('enums.sector');
  const locale = useLocale();
  const user = useUser();
  const roles = user.roles;
  const field = isFieldTeam(roles) && !canSeeDamage(roles);
  const { data: ov, isLoading: ovLoading } = useOverview({ sector: user.sectorScope });
  const { data: ap } = useApprovalCounts(canSeeApprovals(roles));
  const { data: da } = useDamageOverview(user.sectorScope, canSeeDamage(roles) || isFieldTeam(roles));
  const { data: ft } = useFieldSummary(user.sectorScope, canSeeFieldTeam(roles));
  const { data: chat } = useChatUnread();
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  const tasks: Task[] = [];
  const add = (cond: boolean | undefined | 0, task: Task) => { if (cond) tasks.push(task); };
  if (ap) {
    add(canDecideApprovals(roles) && ap.pending > 0, { key: 'approve', icon: Stamp, text: t('tasks.approve', { count: ap.pending }), action: t('actions.decide'), href: '/approvals', tone: toneVar.warning });
    add(canCreateProject(roles) && ap.returned > 0, { key: 'returnedProjects', icon: Undo2, text: t('tasks.returnedProjects', { count: ap.returned }), action: t('actions.fix'), href: '/approvals?tab=returned', tone: toneVar.serious });
  }
  if (da) {
    add(da.mine.returned > 0, { key: 'returnedSites', icon: Undo2, text: t('tasks.returnedSites', { count: da.mine.returned }), action: t('actions.fix'), href: '/damage/my-tasks', tone: toneVar.serious });
    add(da.mine.toAssess > 0, { key: 'toAssess', icon: ClipboardCheck, text: t('tasks.toAssess', { count: da.mine.toAssess }), action: t('actions.open'), href: '/damage/my-tasks' });
    add(da.mine.toReview > 0, { key: 'toReview', icon: ClipboardCheck, text: t('tasks.toReview', { count: da.mine.toReview }), action: t('actions.check'), href: field ? '/damage/my-tasks' : '/damage?view=review', tone: toneVar.warning });
    add((roles.includes('EXECUTIVE') || roles.includes('SECTOR_HEAD')) && da.campaignsInReview > 0, { key: 'endorse', icon: Stamp, text: t('tasks.endorse', { count: da.campaignsInReview }), action: t('actions.decide'), href: '/damage?view=campaigns&status=REVIEW', tone: toneVar.warning });
    add(canCreateProject(roles) && da.needsAwaitingProject > 0, { key: 'needs', icon: FolderPlus, text: t('tasks.needs', { count: da.needsAwaitingProject }), action: t('actions.see'), href: '/damage?view=needs' });
  }
  if (ov && canActOnAlerts(roles)) add(ov.alertCounts.decisionRequired > 0, { key: 'alerts', icon: ShieldAlert, text: t('tasks.alerts', { count: ov.alertCounts.decisionRequired }), action: t('actions.see'), href: '/alerts?decisionRequired=true', tone: toneVar.critical });
  if (ft) add(ft.overdueVisits > 0, { key: 'visits', icon: UsersRound, text: t('tasks.visits', { count: ft.overdueVisits }), action: t('actions.see'), href: '/field-team?tab=assignments&overdue=true' });
  if (chat) add(chat.total > 0, { key: 'messages', icon: MessagesSquare, text: t('tasks.messages', { count: chat.total }), action: t('actions.read'), href: '/messages' });
  const tasksLoading = ovLoading || (canSeeApprovals(roles) && !ap) || ((canSeeDamage(roles) || isFieldTeam(roles)) && !da);

  const k = ov?.kpis;
  const behind = k ? k.projectsDelayed + k.projectsStalled : 0;
  const releasedPct = k && k.budgetEtb ? Math.round((k.disbursedEtb / k.budgetEtb) * 100) : 0;
  const hour = now?.getHours() ?? 9;
  const greeting = hour < 12 ? t('morning') : hour < 18 ? t('afternoon') : t('evening');
  const destinations = destinationsFor(roles);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight tablet:text-3xl">{greeting}, {user.fullName}</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {roles.map((r) => tr(r)).join(' · ')} · {user.sectorScope ? te(user.sectorScope) : t('allTigray')}
          </p>
        </div>
        {now && <p className="text-base text-muted-foreground">{now.toLocaleDateString(locale === 'en' ? 'en-GB' : locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      </header>

      <section aria-labelledby="attention" className="rounded-xl border bg-card shadow-card">
        <h2 id="attention" className="border-b px-6 py-4 text-lg font-semibold">{t('attention')}</h2>
        {tasksLoading ? <div className="space-y-3 p-6"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          : !tasks.length ? (
            <p className="flex items-center gap-3 px-6 py-6 text-base"><CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: toneVar.good }} aria-hidden />{t('allClear')}</p>
          ) : (
            <ul className="divide-y">
              {tasks.map((x) => (
                <li key={x.key} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted" style={x.tone ? { color: x.tone } : undefined}><x.icon className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-[12rem] flex-1 text-base">{x.text}</span>
                  <Link href={x.href as '/'} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
                    {x.action}<ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      {!field && (
        <section aria-labelledby="glance" className="space-y-3">
          <h2 id="glance" className="text-lg font-semibold">{t('glance.title')}</h2>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-4">
            <Figure loading={!k} label={t('glance.underWay')} value={num(k?.projectsActive, locale)} note={t('glance.underWayNote', { total: num(k?.projectsTotal, locale), done: num(k?.projectsCompleted, locale) })} href="/projects?status=ACTIVE" />
            <Figure loading={!k} label={t('glance.behind')} value={num(behind, locale)} note={t('glance.behindNote')} href="/projects?health=DELAYED&health=STALLED" accent={behind > 0 ? toneVar.serious : undefined} />
            <Figure loading={!k} label={t('glance.released')} value={money(k?.disbursedEtb, locale)} note={t('glance.releasedNote', { pct: releasedPct, budget: money(k?.budgetEtb, locale) })} href={canSeeFinance(roles) ? '/finance' : undefined} />
            <Figure loading={!k} label={t('glance.damaged')} value={num(k?.facilitiesSevere, locale)} note={t('glance.damagedNote', { restored: num(k?.facilitiesRestored, locale) })} href="/facilities?severity=SEVERE" />
          </div>
        </section>
      )}

      <section aria-labelledby="goto" className="space-y-5">
        <h2 id="goto" className="text-lg font-semibold">{t('goTo')}</h2>
        {DESTINATION_GROUPS.map((g) => {
          const items = destinations.filter((d) => d.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t(`groups.${g}`)}</h3>
              <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2 laptop:grid-cols-3">
                {items.map((d) => (
                  <li key={d.href}>
                    <Link href={d.href as '/'} className="group flex h-full items-start gap-4 rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><d.icon className="h-5 w-5" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold group-hover:text-primary">{tn(d.key)}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{t(`desc.${d.key}`)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Figure({ label, value, note, href, accent, loading }: { label: string; value: React.ReactNode; note: string; href?: string; accent?: string; loading?: boolean }) {
  if (loading) return <Skeleton className="h-[120px]" />;
  const body = (
    <div className="h-full rounded-lg border bg-card p-5 shadow-card transition-colors hover:border-primary/40">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular leading-none" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{note}</div>
    </div>
  );
  return href ? <Link href={href as '/'} className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

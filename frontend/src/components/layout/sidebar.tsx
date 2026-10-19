'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, Bell, BrainCircuit, Building2, Camera, ChevronLeft, ChevronRight, FileBarChart2, FileText, FolderKanban, Globe2, LayoutDashboard, Layers, Map, ScrollText, Users, Wallet } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useUser } from '@/providers/session';
import { canAdmin, canSeeAudit, canSeeBrief, canSeeFinance, canSeeReports, sectorSlug } from '@/lib/domain';
import { SECTORS } from '@/lib/api/types';
import { SectorDot } from '@/components/common/badges';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAlertCounts } from '@/lib/api/hooks';

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; children?: { href: string; label: string; dot?: React.ReactNode }[] }

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations('nav');
  const te = useTranslations('enums.sector');
  const pathname = usePathname();
  const user = useUser();
  const { data: counts } = useAlertCounts(user.sectorScope);
  const roles = user.roles;

  const command: Item[] = [
    { href: '/', label: t('commandCenter'), icon: LayoutDashboard },
    { href: '/intelligence', label: t('intelligence'), icon: BrainCircuit },
    { href: '/map', label: t('map'), icon: Globe2 },
    { href: '/alerts', label: t('alerts'), icon: Bell, badge: counts?.decisionRequired },
  ];
  const items: Item[] = [
    { href: '/sectors', label: t('sectors'), icon: Layers, children: SECTORS.filter((s) => !user.sectorScope || user.sectorScope === s).map((s) => ({ href: `/sectors/${sectorSlug[s]}`, label: te(s), dot: <SectorDot sector={s} /> })) },
    { href: '/geography', label: t('geography'), icon: Map },
    { href: '/projects', label: t('projects'), icon: FolderKanban },
    { href: '/facilities', label: t('facilities'), icon: Building2 },
    { href: '/evidence', label: t('evidence'), icon: Camera },
    ...(canSeeFinance(roles) ? [{ href: '/finance', label: t('finance'), icon: Wallet }] : []),
  ];
  const records: Item[] = [
    ...(canSeeBrief(roles) ? [{ href: '/briefing', label: t('briefing'), icon: FileText }] : []),
    ...(canSeeReports(roles) ? [{ href: '/reports', label: t('reports'), icon: FileBarChart2 }] : []),
  ];
  const admin: Item[] = [
    ...(canAdmin(roles) ? [{ href: '/admin/users', label: t('users'), icon: Users }] : []),
    ...(canSeeAudit(roles) ? [{ href: '/admin/audit', label: t('audit'), icon: ScrollText }] : []),
  ];
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const render = (it: Item) => {
    const Icon = it.icon;
    const link = (
      <Link href={it.href} aria-current={active(it.href) ? 'page' : undefined}
        className={cn('group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:ring-offset-sidebar', active(it.href) ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/85', collapsed && 'justify-center px-2')}>
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate flex-1">{it.label}</span>}
        {!collapsed && it.badge ? <span className="rounded-full bg-status-critical px-1.5 text-2xs font-semibold text-white tabular">{it.badge}</span> : null}
        {collapsed && it.badge ? <span className="sr-only">{it.badge}</span> : null}
      </Link>
    );
    return (
      <li key={it.href}>
        {collapsed ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{it.label}</TooltipContent></Tooltip> : link}
        {!collapsed && it.children && active(it.href) && (
          <ul className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
            {it.children.map((c) => (
              <li key={c.href}>
                <Link href={c.href} aria-current={pathname === c.href ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-sidebar-accent', pathname === c.href ? 'text-white bg-sidebar-accent' : 'text-sidebar-foreground/75')}>{c.dot}{c.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className={cn('hidden laptop:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 shrink-0', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex h-14 items-center gap-2 border-b border-sidebar-border px-4', collapsed && 'justify-center px-2')}>
        <BarChart3 className="h-6 w-6 text-white shrink-0" aria-hidden />
        {!collapsed && <div className="min-w-0 leading-tight"><div className="text-sm font-semibold text-white">RPIS</div><div className="truncate text-2xs text-sidebar-foreground/70">ReconstructTigray</div></div>}
      </div>
      <nav aria-label={t('main')} className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {!collapsed && <div className="mb-1 px-3 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">{t('command')}</div>}
        <ul className="space-y-0.5">{command.map(render)}</ul>
        {!collapsed && <div className="mt-5 mb-1 px-3 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">{t('analysis')}</div>}
        <ul className={cn('space-y-0.5', collapsed && 'mt-4 border-t border-sidebar-border pt-3')}>{items.map(render)}</ul>
        {records.length > 0 && (<>
          {!collapsed && <div className="mt-5 mb-1 px-3 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">{t('records')}</div>}
          <ul className={cn('space-y-0.5', collapsed && 'mt-4 border-t border-sidebar-border pt-3')}>{records.map(render)}</ul>
        </>)}
        {admin.length > 0 && (
          <>
            {!collapsed && <div className="mt-5 mb-1 px-3 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">{t('administration')}</div>}
            <ul className={cn('space-y-0.5', collapsed && 'mt-4 border-t border-sidebar-border pt-3')}>{admin.map(render)}</ul>
          </>
        )}
      </nav>
      <button type="button" onClick={onToggle} className="flex h-10 items-center justify-center gap-2 border-t border-sidebar-border text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent" aria-label={collapsed ? t('expand') : t('collapse')}>
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" />{t('collapse')}</>}
      </button>
    </aside>
  );
}

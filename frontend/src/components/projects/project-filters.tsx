'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useZones } from '@/lib/api/hooks';
import { SECTORS } from '@/lib/api/types';
import { localizedName } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUSES = ['PLANNED', 'PROCUREMENT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELLED'];
const HEALTHS = ['ON_TRACK', 'AT_RISK', 'DELAYED', 'STALLED', 'COMPLETED', 'NOT_STARTED'];
const FUNDING = ['REGIONAL_TREASURY', 'FEDERAL_TRANSFER', 'DONOR_GRANT', 'DEVELOPMENT_LOAN', 'DIASPORA_FUND', 'PRIVATE_INVESTMENT'];
const STAGES = ['PLANNING', 'APPROVAL', 'FUNDING', 'PROCUREMENT', 'IMPLEMENTATION', 'MONITORING', 'COMPLETION', 'CANCELLED'];

/** One-click views a non-specialist asks for; each is a plain combination of status and health. */
const QUICK: { key: string; params: Record<string, string[] | null> }[] = [
  { key: 'all', params: { status: null, health: null } },
  { key: 'behind', params: { status: ['ACTIVE'], health: ['DELAYED', 'STALLED', 'AT_RISK'] } },
  { key: 'onTrack', params: { status: ['ACTIVE'], health: ['ON_TRACK'] } },
  { key: 'notStarted', params: { status: ['PLANNED', 'PROCUREMENT'], health: null } },
  { key: 'finished', params: { status: ['COMPLETED'], health: null } },
];
const same = (a: string[], b: string[] | null) => (b === null ? a.length === 0 : a.length === b.length && b.every((x) => a.includes(x)));

export function ProjectFilters({ get, getAll, set, hideSector }: { get: (k: string) => string | null; getAll: (k: string) => string[]; set: (p: Record<string, string | string[] | null>) => void; hideSector?: boolean }) {
  const t = useTranslations('projects.filters');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tl = useTranslations('projects.lifecycle.stages');
  const locale = useLocale();
  const { data: zones } = useZones();
  const [q, setQ] = React.useState(get('q') ?? '');
  React.useEffect(() => { const id = setTimeout(() => { if ((get('q') ?? '') !== q) set({ q: q || null }); }, 350); return () => clearTimeout(id); }, [q, get, set]);
  const status = getAll('status'), health = getAll('health');
  const quick = QUICK.find((x) => same(status, x.params.status) && same(health, x.params.health))?.key ?? null;
  const advanced = ['stage', 'fundingSource'].some((k) => get(k)) || (quick === null && (status.length > 0 || health.length > 0));
  const [more, setMore] = React.useState(advanced);
  const hasAny = ['q', 'status', 'health', 'sector', 'zoneId', 'fundingSource', 'stage', 'minRiskScore', 'contractor'].some((k) => get(k));
  const single = (k: string, label: string, options: string[], text: (o: string) => string) => {
    const cur = getAll(k);
    return (
      <Select value={cur.length === 1 ? cur[0] : 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[190px]" aria-label={label}><SelectValue>{cur.length > 1 ? t('several', { label, count: cur.length }) : cur.length === 1 ? text(cur[0]) : `${label}: ${tc('all')}`}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{label}: {tc('all')}</SelectItem>{options.map((o) => <SelectItem key={o} value={o}>{text(o)}</SelectItem>)}</SelectContent>
      </Select>
    );
  };
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('show')} className="flex flex-wrap gap-2">
        {QUICK.map((x) => (
          <button key={x.key} type="button" role="radio" aria-checked={quick === x.key} onClick={() => set({ status: x.params.status, health: x.params.health, page: null })}
            className={cn('rounded-full border px-4 py-1.5 text-sm font-medium transition-colors', quick === x.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}>
            {t(`quick.${x.key}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full tablet:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="pl-9" aria-label={t('search')} /></div>
        {!hideSector && (
          <Select value={get('sector') ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}>
            <SelectTrigger className="w-[170px]" aria-label={t('sector')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">{t('sector')}: {tc('all')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}>
          <SelectTrigger className="w-[170px]" aria-label={t('zone')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('zone')}: {tc('all')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setMore((m) => !m)} aria-expanded={more}><ChevronDown className={cn('transition-transform', more && 'rotate-180')} />{t('more')}</Button>
        {hasAny && <Button variant="ghost" size="sm" onClick={() => { setQ(''); set({ q: null, status: null, health: null, sector: hideSector ? get('sector') : null, zoneId: null, fundingSource: null, stage: null, minRiskScore: null, contractor: null }); }}><X />{tc('clearFilters')}</Button>}
      </div>
      {more && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
          {single('status', t('status'), STATUSES, (o) => te(`status.${o}` as 'status.ACTIVE'))}
          {single('health', t('health'), HEALTHS, (o) => te(`health.${o}` as 'health.ON_TRACK'))}
          {single('stage', t('stage'), STAGES, (o) => tl(o as 'PLANNING'))}
          {single('fundingSource', t('funding'), FUNDING, (o) => te(`funding.${o}` as 'funding.DONOR_GRANT'))}
        </div>
      )}
    </div>
  );
}

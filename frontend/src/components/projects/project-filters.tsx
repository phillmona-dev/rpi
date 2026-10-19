'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useZones } from '@/lib/api/hooks';
import { SECTORS } from '@/lib/api/types';
import { localizedName } from '@/lib/format';

const STATUSES = ['PLANNED', 'PROCUREMENT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELLED'];
const HEALTHS = ['ON_TRACK', 'AT_RISK', 'DELAYED', 'STALLED', 'COMPLETED', 'NOT_STARTED'];
const FUNDING = ['REGIONAL_TREASURY', 'FEDERAL_TRANSFER', 'DONOR_GRANT', 'DEVELOPMENT_LOAN', 'DIASPORA_FUND', 'PRIVATE_INVESTMENT'];
const STAGES = ['PLANNING', 'APPROVAL', 'FUNDING', 'PROCUREMENT', 'IMPLEMENTATION', 'MONITORING', 'COMPLETION', 'CANCELLED'];

export function ProjectFilters({ get, getAll, set, hideSector }: { get: (k: string) => string | null; getAll: (k: string) => string[]; set: (p: Record<string, string | string[] | null>) => void; hideSector?: boolean }) {
  const t = useTranslations('projects.filters');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tl = useTranslations('projects.lifecycle.stages');
  const locale = useLocale();
  const { data: zones } = useZones();
  const [q, setQ] = React.useState(get('q') ?? '');
  React.useEffect(() => { const id = setTimeout(() => { if ((get('q') ?? '') !== q) set({ q: q || null }); }, 350); return () => clearTimeout(id); }, [q, get, set]);
  const multi = (k: string, label: string, options: string[], ns: string) => {
    const cur = getAll(k);
    return (
      <Select value={cur.length === 1 ? cur[0] : cur.length > 1 ? '__multi' : 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[160px]" aria-label={label}><SelectValue>{cur.length > 1 ? `${label} (${cur.length})` : cur.length === 1 ? te(`${ns}.${cur[0]}` as 'status.ACTIVE') : label}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{tc('all')}</SelectItem>{options.map((o) => <SelectItem key={o} value={o}>{te(`${ns}.${o}` as 'status.ACTIVE')}</SelectItem>)}{cur.length > 1 && <SelectItem value="__multi" disabled>{label} ({cur.length})</SelectItem>}</SelectContent>
      </Select>
    );
  };
  const hasAny = ['q', 'status', 'health', 'sector', 'zoneId', 'fundingSource', 'stage', 'minRiskScore', 'contractor'].some((k) => get(k));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="w-[260px]" aria-label={t('search')} />
      {!hideSector && (
        <Select value={get('sector') ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}>
          <SelectTrigger className="w-[160px]" aria-label={t('sector')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('sector')}: {tc('all')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[160px]" aria-label={t('zone')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{t('zone')}: {tc('all')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent>
      </Select>
      {multi('status', t('status'), STATUSES, 'status')}
      {multi('health', t('health'), HEALTHS, 'health')}
      <Select value={get('stage') ?? 'ALL'} onValueChange={(v) => set({ stage: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[160px]" aria-label={t('stage')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{t('stage')}: {tc('all')}</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{tl(s as 'PLANNING')}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={get('fundingSource') ?? 'ALL'} onValueChange={(v) => set({ fundingSource: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[180px]" aria-label={t('funding')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{t('funding')}: {tc('all')}</SelectItem>{FUNDING.map((f) => <SelectItem key={f} value={f}>{te(`funding.${f}` as 'funding.DONOR_GRANT')}</SelectItem>)}</SelectContent>
      </Select>
      {hasAny && <Button variant="ghost" size="sm" onClick={() => { setQ(''); set({ q: null, status: null, health: null, sector: hideSector ? get('sector') : null, zoneId: null, fundingSource: null, stage: null, minRiskScore: null, contractor: null }); }}><X />{tc('clearFilters')}</Button>}
    </div>
  );
}

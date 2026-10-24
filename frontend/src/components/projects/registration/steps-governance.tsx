'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Building2, Check, ChevronsUpDown, Lock, Plus, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useOrganizations } from '@/lib/api/hooks';
import type { Level, OrganizationOption, OrganizationRole, OrganizationType } from '@/lib/api/types';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toneVar } from '@/lib/domain';
import {
  LEVELS, ORG_ROLES, ORG_TYPES, PROCUREMENT_METHODS, REGISTRABLE_STAGES, RISK_CATEGORIES, RISK_SUGGESTIONS, ROLE_DEFAULT_TYPE, SINGLE_ROLES, isoToday, riskScore, rowKey, stageRank, toNum,
  type OrgRow, type RiskRow,
} from './model';
import { Callout, Field, GroupError, MoneyInput, StepCard, SubHeading, errClass } from './ui';
import { RowError, RowInput } from './steps-plan';
import type { StepProps } from './steps-identity';

/* ─── 5 · Parties & governance ────────────────────────────────────────────── */
export function PartiesStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const tr = useTranslations('projects.lifecycle.orgRole');
  const tl = useTranslations('projects.lifecycle.stages');
  const te = useTranslations('enums');
  const locale = useLocale();
  const { data: orgs } = useOrganizations();
  const rank = stageRank(s.initialStage);
  const upd = (key: string, patch: Partial<OrgRow>) => set({ organizations: s.organizations.map((o) => (o.key === key ? { ...o, ...patch } : o)) });
  const taken = new Set(s.organizations.map((o) => o.role));
  const total = toNum(s.totalBudgetEtb) ?? 0;
  const cv = toNum(s.contractValueEtb);

  const gov: { field: 'approvedOn' | 'approvalReference' | 'fundingSecuredOn' | 'procurementMethod' | 'contractSignedOn' | 'contractValueEtb'; from: number }[] = [
    { field: 'approvedOn', from: 2 }, { field: 'approvalReference', from: 2 }, { field: 'fundingSecuredOn', from: 3 }, { field: 'procurementMethod', from: 3 }, { field: 'contractSignedOn', from: 4 }, { field: 'contractValueEtb', from: 4 },
  ];
  const later = gov.filter((g) => rank < g.from);

  return (
    <StepCard title={t('steps.parties.title')} description={t('steps.parties.description')}>
      <div className="space-y-3">
        <SubHeading hint={t('h.organizations')} actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="xs" variant="outline"><UserPlus />{t('org.add')}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{ORG_ROLES.map((r) => <DropdownMenuItem key={r} disabled={SINGLE_ROLES.includes(r) && taken.has(r)} onSelect={() => set({ organizations: [...s.organizations, { key: rowKey(), role: r, mode: 'existing', organizationId: null, newName: '', newType: ROLE_DEFAULT_TYPE[r], newContact: '' }] })}>{tr(r)}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        }>{t('org.title')}</SubHeading>
        <ul className="space-y-2">
          {s.organizations.map((o, i) => (
            <li key={o.key} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={o.role} onValueChange={(v) => upd(o.key, { role: v as OrganizationRole, newType: o.newType || ROLE_DEFAULT_TYPE[v as OrganizationRole] })}>
                  <SelectTrigger className="h-8 w-[220px] text-xs font-medium" aria-label={t('org.role')}><SelectValue /></SelectTrigger>
                  <SelectContent>{ORG_ROLES.map((r) => <SelectItem key={r} value={r}>{tr(r)}</SelectItem>)}</SelectContent>
                </Select>
                <div className="inline-flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label={t('org.mode')}>
                  {(['existing', 'new'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={o.mode === m} onClick={() => upd(o.key, { mode: m })} className={cn('rounded px-2 py-1', o.mode === m ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground')}>{t(`org.${m}`)}</button>)}
                </div>
                {s.organizations.length > 1 && <Button type="button" size="iconSm" variant="ghost" className="ml-auto" aria-label={t('remove')} onClick={() => set({ organizations: s.organizations.filter((x) => x.key !== o.key) })}><Trash2 /></Button>}
              </div>
              <div className="mt-2.5">
                {o.mode === 'existing' ? (
                  <div data-field={`organizations[${i}].organizationId`}>
                    <OrgCombobox id={`organizations[${i}].organizationId`} options={orgs ?? []} value={o.organizationId} preferType={ROLE_DEFAULT_TYPE[o.role]} error={errors[`organizations[${i}].organizationId`]}
                      onChange={(id) => upd(o.key, { organizationId: id })} onCreate={(name) => upd(o.key, { mode: 'new', newName: name })} />
                    <RowError error={errors[`organizations[${i}].organizationId`]} />
                  </div>
                ) : (
                  <div className="grid gap-2 tablet:grid-cols-3">
                    <RowInput id={`organizations[${i}].newName`} label={t('org.newName')} placeholder={t('org.newName')} value={o.newName} onChange={(v) => upd(o.key, { newName: v })} error={errors[`organizations[${i}].newName`]} maxLength={200} />
                    <div>
                      <Select value={o.newType} onValueChange={(v) => upd(o.key, { newType: v as OrganizationType })}>
                        <SelectTrigger id={`organizations[${i}].newType`} className={cn('h-8 text-xs', errClass(errors[`organizations[${i}].newType`]))} aria-label={t('org.type')}><SelectValue placeholder={t('org.type')} /></SelectTrigger>
                        <SelectContent>{ORG_TYPES.map((ty) => <SelectItem key={ty} value={ty}>{te(`orgType.${ty}`)}</SelectItem>)}</SelectContent>
                      </Select>
                      <RowError error={errors[`organizations[${i}].newType`]} />
                    </div>
                    <RowInput id={`organizations[${i}].newContact`} label={t('org.contact')} placeholder={t('org.contact')} value={o.newContact} onChange={(v) => upd(o.key, { newContact: v })} maxLength={200} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <GroupError id="organizations" error={errors.organizations} />
      </div>

      <div className="space-y-3 border-t pt-5">
        <SubHeading hint={t('h.governance', { stage: tl(s.initialStage) })}>{t('gov.title')}</SubHeading>
        {rank < 2 ? <Callout>{t('gov.none', { stage: tl(s.initialStage) })}</Callout> : (
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {rank >= 2 && <>
              <Field id="approvedOn" label={t('f.approvedOn')} required error={errors.approvedOn}>{(a) => <Input {...a} type="date" max={isoToday()} value={s.approvedOn} onChange={(e) => set({ approvedOn: e.target.value })} className={errClass(errors.approvedOn)} />}</Field>
              <Field id="approvalReference" label={t('f.approvalReference')} required error={errors.approvalReference} hint={t('h.approvalReference')}>{(a) => <Input {...a} value={s.approvalReference} maxLength={120} placeholder="EXEC/2026/041" onChange={(e) => set({ approvalReference: e.target.value })} className={errClass(errors.approvalReference)} />}</Field>
            </>}
            {rank >= 3 && <>
              <Field id="fundingSecuredOn" label={t('f.fundingSecuredOn')} required error={errors.fundingSecuredOn}>{(a) => <Input {...a} type="date" min={s.approvedOn || undefined} max={isoToday()} value={s.fundingSecuredOn} onChange={(e) => set({ fundingSecuredOn: e.target.value })} className={errClass(errors.fundingSecuredOn)} />}</Field>
              <Field id="procurementMethod" label={t('f.procurementMethod')} required error={errors.procurementMethod}>
                {(a) => <Select value={s.procurementMethod} onValueChange={(v) => set({ procurementMethod: v })}><SelectTrigger {...a} className={errClass(errors.procurementMethod)}><SelectValue placeholder={t('ph.select')} /></SelectTrigger><SelectContent>{PROCUREMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{t(`procurement.${p}`)}</SelectItem>)}</SelectContent></Select>}
              </Field>
            </>}
            {rank >= 4 && <>
              <Field id="contractSignedOn" label={t('f.contractSignedOn')} required error={errors.contractSignedOn}>{(a) => <Input {...a} type="date" min={s.fundingSecuredOn || undefined} max={isoToday()} value={s.contractSignedOn} onChange={(e) => set({ contractSignedOn: e.target.value })} className={errClass(errors.contractSignedOn)} />}</Field>
              <Field id="contractValueEtb" label={t('f.contractValue')} required error={errors.contractValueEtb} hint={cv !== null && total ? t('h.contractShare', { pct: Math.round((cv / total) * 100) }) : undefined}>
                {(a) => <MoneyInput {...a} value={s.contractValueEtb} onValueChange={(v) => set({ contractValueEtb: v })} error={errors.contractValueEtb} />}
              </Field>
            </>}
          </div>
        )}
        {later.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground"><Lock className="h-3 w-3" />{t('gov.later')}
            {later.map((g) => <span key={g.field} className="rounded border px-1.5 py-0.5">{t(`gov.fields.${g.field}`)} · {tl(REGISTRABLE_STAGES[g.from])}</span>)}
          </p>
        )}
        {total > 0 && cv !== null && <p className="text-2xs text-muted-foreground tabular">{t('gov.contractVsBudget', { contract: money(cv, locale), budget: money(total, locale) })}</p>}
      </div>
    </StepCard>
  );
}

/** Searchable organisation picker (ARIA combobox). Organisations of the type expected for the role are listed first. */
function OrgCombobox({ id, options, value, preferType, error, onChange, onCreate }: { id: string; options: OrganizationOption[]; value: number | null; preferType: OrganizationType; error?: string; onChange: (id: number) => void; onCreate: (name: string) => void }) {
  const t = useTranslations('register');
  const te = useTranslations('enums.orgType');
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const selected = options.find((o) => o.id === value);
  const list = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    return options.filter((o) => !ql || o.name.toLowerCase().includes(ql) || o.code.toLowerCase().includes(ql))
      .sort((a, b) => Number(b.orgType === preferType) - Number(a.orgType === preferType) || b.projects - a.projects || a.name.localeCompare(b.name)).slice(0, 50);
  }, [options, q, preferType]);
  const choose = (o: OrganizationOption) => { onChange(o.id); setOpen(false); setQ(''); };
  const listId = `${id}-list`;
  return (
    <div className="relative">
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={error ? true : undefined}
          aria-activedescendant={open && list[active] ? `${listId}-${list[active].id}` : undefined}
          className={cn('h-9 pl-8 pr-8 text-sm', errClass(error))} placeholder={selected ? selected.name : t('org.search')}
          value={open ? q : selected?.name ?? ''} onFocus={() => { setOpen(true); setActive(0); }} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (list[active]) choose(list[active]); else if (q.trim()) onCreate(q.trim()); }
            else if (e.key === 'Escape') setOpen(false);
          }} />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-lg">
          {list.map((o, i) => (
            <li key={o.id} id={`${listId}-${o.id}`} role="option" aria-selected={o.id === value} onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5', i === active && 'bg-accent')}>
              <span className="min-w-0 flex-1"><span className="block truncate">{o.name}</span><span className="block text-2xs text-muted-foreground">{te(o.orgType)} · {o.code} · {t('org.projects', { count: o.projects })}</span></span>
              {o.id === value && <Check className="h-4 w-4 shrink-0" />}
            </li>
          ))}
          {q.trim() && (
            <li role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onCreate(q.trim()); }} onMouseEnter={() => setActive(list.length)}
              className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-primary', active === list.length && 'bg-accent')}><Plus className="h-3.5 w-3.5" />{t('org.createNamed', { name: q.trim() })}</li>
          )}
          {!list.length && !q.trim() && <li className="px-2 py-1.5 text-xs text-muted-foreground">{t('org.empty')}</li>}
        </ul>
      )}
    </div>
  );
}

/* ─── 6 · Initial risk register ───────────────────────────────────────────── */
export function RisksStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const upd = (key: string, patch: Partial<RiskRow>) => set({ risks: s.risks.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const suggestions = [...(s.sector ? RISK_SUGGESTIONS[s.sector] : []), ...RISK_SUGGESTIONS.COMMON].filter((x) => !s.risks.some((r) => r.title === x.title));
  const add = (r?: Omit<RiskRow, 'key' | 'owner'>) => set({ risks: [...s.risks, { key: rowKey(), title: '', category: '', likelihood: 'MEDIUM', impact: 'MEDIUM', mitigation: '', owner: '', ...r }] });

  return (
    <StepCard title={t('steps.risks.title')} description={t('steps.risks.description')}>
      <div className="grid gap-5 desktop:grid-cols-4">
        <div className="space-y-3 desktop:col-span-3">
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">{t('rk.suggestions')}</p>
              <div className="flex flex-wrap gap-1.5">{suggestions.map((x) => <button key={x.title} type="button" onClick={() => add(x)} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="h-3 w-3" />{x.title}</button>)}</div>
            </div>
          )}
          {s.risks.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">{t('rk.empty')}</p> : (
            <ul className="space-y-2">
              {s.risks.map((r, i) => {
                const score = riskScore(r);
                const color = score >= 6 ? toneVar.critical : score >= 3 ? toneVar.warning : toneVar.good;
                return (
                  <li key={r.key} className="rounded-md border p-3" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="grid gap-2 tablet:grid-cols-12">
                      <div className="tablet:col-span-7"><RowInput id={`risks[${i}].title`} label={t('rk.title')} placeholder={t('rk.title')} value={r.title} onChange={(v) => upd(r.key, { title: v })} error={errors[`risks[${i}].title`]} maxLength={200} /></div>
                      <div className="tablet:col-span-4">
                        <Select value={r.category} onValueChange={(v) => upd(r.key, { category: v })}>
                          <SelectTrigger id={`risks[${i}].category`} className={cn('h-8 text-xs', errClass(errors[`risks[${i}].category`]))} aria-label={t('rk.category')}><SelectValue placeholder={t('rk.category')} /></SelectTrigger>
                          <SelectContent>{RISK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`riskCategory.${c}`)}</SelectItem>)}</SelectContent>
                        </Select>
                        <RowError error={errors[`risks[${i}].category`]} />
                      </div>
                      <div className="flex justify-end tablet:col-span-1"><Button type="button" size="iconSm" variant="ghost" aria-label={t('remove')} onClick={() => set({ risks: s.risks.filter((x) => x.key !== r.key) })}><Trash2 /></Button></div>
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 tablet:col-span-12">
                        <LevelPicker label={t('rk.likelihood')} value={r.likelihood} onChange={(v) => upd(r.key, { likelihood: v })} />
                        <LevelPicker label={t('rk.impact')} value={r.impact} onChange={(v) => upd(r.key, { impact: v })} />
                        <span className="mb-0.5 rounded px-1.5 py-0.5 text-2xs font-semibold tabular" style={{ color, border: `1px solid ${color}` }} title={t('rk.score')}>{t('rk.scoreValue', { score })}</span>
                      </div>
                      <div className="tablet:col-span-8"><Textarea aria-label={t('rk.mitigation')} placeholder={t('rk.mitigation')} rows={2} className="min-h-0 text-xs" value={r.mitigation} maxLength={2000} onChange={(e) => upd(r.key, { mitigation: e.target.value })} /></div>
                      <div className="tablet:col-span-4"><RowInput id={`risks[${i}].owner`} label={t('rk.owner')} placeholder={t('rk.owner')} value={r.owner} onChange={(v) => upd(r.key, { owner: v })} maxLength={160} /></div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => add()}><Plus />{t('rk.add')}</Button>
          <GroupError id="risks" error={errors.risks} />
        </div>
        <RiskMatrix risks={s.risks} label={t('rk.matrix')} lk={t('rk.likelihood')} im={t('rk.impact')} levelLabel={(l) => te(`level.${l}`)} />
      </div>
    </StepCard>
  );
}

function LevelPicker({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  const te = useTranslations('enums.level');
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-0.5 text-2xs text-muted-foreground">{label}</div>
      <div className="inline-flex rounded-md border p-0.5">
        {LEVELS.map((l) => <button key={l} type="button" role="radio" aria-checked={value === l} onClick={() => onChange(l)} className={cn('rounded px-1.5 py-0.5 text-2xs', value === l ? 'bg-accent font-semibold' : 'text-muted-foreground hover:text-foreground')}>{te(l)}</button>)}
      </div>
    </div>
  );
}

/** 3×3 likelihood × impact heat grid with counts. */
function RiskMatrix({ risks, label, lk, im, levelLabel }: { risks: RiskRow[]; label: string; lk: string; im: string; levelLabel: (l: Level) => string }) {
  const rows = [...LEVELS].reverse();
  return (
    <div className="space-y-2" aria-label={label}>
      <p className="flex items-center gap-1.5 text-xs font-medium"><ShieldAlert className="h-3.5 w-3.5" />{label}</p>
      <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1 text-2xs">
        {rows.map((l) => (
          <React.Fragment key={l}>
            <div className="flex items-center justify-end pr-1 text-muted-foreground">{levelLabel(l)}</div>
            {LEVELS.map((i) => {
              const n = risks.filter((r) => r.likelihood === l && r.impact === i).length;
              const sc = (LEVELS.indexOf(l) + 1) * (LEVELS.indexOf(i) + 1);
              const color = sc >= 6 ? toneVar.critical : sc >= 3 ? toneVar.warning : toneVar.good;
              return <div key={i} className="flex aspect-square items-center justify-center rounded text-sm font-semibold tabular" style={{ background: `color-mix(in srgb, ${color} ${n ? 45 : 12}%, transparent)` }}>{n || ''}</div>;
            })}
          </React.Fragment>
        ))}
        <div />
        {LEVELS.map((i) => <div key={i} className="text-center text-muted-foreground">{levelLabel(i)}</div>)}
      </div>
      <div className="flex justify-between text-2xs text-muted-foreground"><span>↑ {lk}</span><span>{im} →</span></div>
    </div>
  );
}

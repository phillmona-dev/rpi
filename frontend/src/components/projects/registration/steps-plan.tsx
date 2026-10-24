'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownUp, CalendarRange, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmtDate, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toneVar } from '@/lib/domain';
import type { FundingSource } from '@/lib/api/types';
import {
  BUDGET_CATEGORIES, FUNDING_SOURCES, budgetSplit, daysBetween, distributeMilestones, isoToday, milestoneTemplate, monthsBetween, rowKey, stageRank, sum, toNum, trancheTemplate, validDate,
  type BudgetRow, type MilestoneRow, type TrancheRow, type TrancheTemplate,
} from './model';
import { Callout, Field, GroupError, Meter, MoneyInput, StepCard, SubHeading, errClass } from './ui';
import type { StepProps } from './steps-identity';

const pctOf = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 1000) / 10}%` : '—');

/* ─── 3 · Schedule & milestones ───────────────────────────────────────────── */
export function ScheduleStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const datesOk = validDate(s.plannedStart) && validDate(s.plannedEnd) && s.plannedEnd > s.plannedStart;
  const weights = sum(s.milestones.map((m) => toNum(m.weightPct)));
  const upd = (key: string, patch: Partial<MilestoneRow>) => set({ milestones: s.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)) });
  const add = () => set({ milestones: [...s.milestones, { key: rowKey(), name: '', plannedDate: s.plannedEnd || '', weightPct: String(Math.max(0, Math.round((100 - weights) * 100) / 100) || '') }] });

  return (
    <StepCard title={t('steps.schedule.title')} description={t('steps.schedule.description')}>
      <div className="grid gap-4 tablet:grid-cols-3">
        <Field id="plannedStart" label={t('f.plannedStart')} required error={errors.plannedStart}>
          {(a) => <Input {...a} type="date" value={s.plannedStart} onChange={(e) => set({ plannedStart: e.target.value })} className={errClass(errors.plannedStart)} />}
        </Field>
        <Field id="plannedEnd" label={t('f.plannedEnd')} required error={errors.plannedEnd} hint={datesOk ? t('duration', { months: monthsBetween(s.plannedStart, s.plannedEnd), days: daysBetween(s.plannedStart, s.plannedEnd) }) : undefined}>
          {(a) => <Input {...a} type="date" min={s.plannedStart || undefined} value={s.plannedEnd} onChange={(e) => set({ plannedEnd: e.target.value })} className={errClass(errors.plannedEnd)} />}
        </Field>
        {stageRank(s.initialStage) >= 4 && (
          <Field id="actualStart" label={t('f.actualStart')} required error={errors.actualStart} hint={t('h.actualStart')}>
            {(a) => <Input {...a} type="date" max={isoToday()} value={s.actualStart} onChange={(e) => set({ actualStart: e.target.value })} className={errClass(errors.actualStart)} />}
          </Field>
        )}
      </div>

      {datesOk && <Timeline start={s.plannedStart} end={s.plannedEnd} actualStart={stageRank(s.initialStage) >= 4 ? s.actualStart : ''} milestones={s.milestones} />}

      <div className="space-y-3 border-t pt-5">
        <SubHeading hint={t('h.milestones')} actions={<>
          <Button type="button" size="xs" variant="outline" disabled={!s.sector || !datesOk} onClick={() => s.sector && set({ milestones: milestoneTemplate(s.sector, s.plannedStart, s.plannedEnd) })}><Sparkles />{s.sector ? t('ms.template', { sector: te(`sector.${s.sector}`) }) : t('ms.templateNoSector')}</Button>
          <Button type="button" size="xs" variant="outline" disabled={!datesOk || !s.milestones.length} onClick={() => set({ milestones: distributeMilestones(s.milestones, s.plannedStart, s.plannedEnd) })}><Wand2 />{t('ms.distribute')}</Button>
          <Button type="button" size="xs" variant="ghost" disabled={s.milestones.length < 2} onClick={() => set({ milestones: [...s.milestones].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)) })}><ArrowDownUp />{t('ms.sort')}</Button>
        </>}>{t('ms.title')}</SubHeading>
        {!datesOk && <Callout>{t('ms.needDates')}</Callout>}
        {s.milestones.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground"><th className="w-8 py-1.5">#</th><th className="py-1.5">{t('ms.name')}</th><th className="w-44 py-1.5">{t('ms.date')}</th><th className="w-28 py-1.5 text-right">{t('ms.weight')}</th><th className="w-10" /></tr></thead>
              <tbody>
                {s.milestones.map((m, i) => (
                  <tr key={m.key} className="align-top">
                    <td className="py-1.5 pr-2 pt-3 text-xs tabular text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2"><RowInput id={`milestones[${i}].name`} error={errors[`milestones[${i}].name`]} value={m.name} placeholder={t('ph.milestone')} onChange={(v) => upd(m.key, { name: v })} label={`${t('ms.name')} ${i + 1}`} maxLength={200} /></td>
                    <td className="py-1.5 pr-2"><RowInput id={`milestones[${i}].plannedDate`} type="date" min={s.plannedStart} max={s.plannedEnd} error={errors[`milestones[${i}].plannedDate`]} value={m.plannedDate} onChange={(v) => upd(m.key, { plannedDate: v })} label={`${t('ms.date')} ${i + 1}`} /></td>
                    <td className="py-1.5 pr-2"><RowInput id={`milestones[${i}].weightPct`} inputMode="decimal" className="text-right tabular" suffix="%" error={errors[`milestones[${i}].weightPct`]} value={m.weightPct} onChange={(v) => upd(m.key, { weightPct: v.replace(/[^0-9.]/g, '') })} label={`${t('ms.weight')} ${i + 1}`} /></td>
                    <td className="py-1.5"><Button type="button" size="iconSm" variant="ghost" aria-label={t('remove')} onClick={() => set({ milestones: s.milestones.filter((x) => x.key !== m.key) })}><Trash2 /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" size="sm" variant="outline" onClick={add}><Plus />{t('ms.add')}</Button>
          {s.milestones.length > 0 && <div className="w-64"><Meter value={weights} target={100} label={t('ms.weightTotal')} detail={`${Math.round(weights * 100) / 100}% / 100%`} /></div>}
        </div>
        <GroupError id="milestones" error={errors.milestones} />
      </div>
    </StepCard>
  );
}

/** Gantt-style strip: schedule span, milestone diamonds, today and actual start markers. */
function Timeline({ start, end, actualStart, milestones }: { start: string; end: string; actualStart: string; milestones: MilestoneRow[] }) {
  const locale = useLocale();
  const t = useTranslations('register');
  const span = daysBetween(start, end);
  const pos = (d: string) => Math.max(0, Math.min(100, (daysBetween(start, d) / span) * 100));
  const today = isoToday();
  return (
    <div className="rounded-md border bg-muted/20 px-4 pb-3 pt-7" aria-hidden>
      <div className="relative h-2 rounded-full bg-[color-mix(in_srgb,var(--seq-450)_25%,transparent)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--seq-450)] opacity-60" style={{ width: `${today > start ? pos(today) : 0}%` }} />
        {today > start && today < end && <div className="absolute -top-5 -translate-x-1/2 text-2xs font-medium" style={{ left: `${pos(today)}%`, color: toneVar.critical }}>{t('today')}<div className="mx-auto mt-0.5 h-5 w-px" style={{ background: toneVar.critical }} /></div>}
        {validDate(actualStart) && <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-foreground/70" style={{ left: `${pos(actualStart)}%` }} title={t('f.actualStart')} />}
        {milestones.filter((m) => validDate(m.plannedDate)).map((m) => (
          <div key={m.key} className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(m.plannedDate)}%` }}>
            <div className="h-3 w-3 rotate-45 border-2 border-card bg-foreground" />
            <div className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-2xs shadow group-hover:block">{m.name || '—'} · {fmtDate(m.plannedDate, locale)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-2xs text-muted-foreground tabular"><span><CalendarRange className="mr-1 inline h-3 w-3" />{fmtDate(start, locale)}</span><span>{fmtDate(end, locale)}</span></div>
    </div>
  );
}

/* ─── 4 · Budget & funding ────────────────────────────────────────────────── */
export function BudgetStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const locale = useLocale();
  const total = toNum(s.totalBudgetEtb) ?? 0;
  const allocated = sum(s.budgetLines.map((l) => toNum(l.allocatedEtb)));
  const scheduled = sum(s.tranches.map((r) => toNum(r.amountEtb)));
  const datesOk = validDate(s.plannedStart) && validDate(s.plannedEnd) && s.plannedEnd > s.plannedStart;
  const updLine = (key: string, patch: Partial<BudgetRow>) => set({ budgetLines: s.budgetLines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const updTr = (key: string, patch: Partial<TrancheRow>) => set({ tranches: s.tranches.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const used = new Set(s.budgetLines.map((l) => l.category));
  const applyTranches = (k: TrancheTemplate) => set({ tranches: trancheTemplate(k, total, s.plannedStart, s.plannedEnd, s.fundingSource) });
  let cumulative = 0;

  return (
    <StepCard title={t('steps.budget.title')} description={t('steps.budget.description')}>
      <div className="grid gap-4 tablet:grid-cols-2">
        <Field id="totalBudgetEtb" label={t('f.totalBudget')} required error={errors.totalBudgetEtb} hint={total ? money(total, locale) : t('h.totalBudget')}>
          {(a) => <MoneyInput {...a} value={s.totalBudgetEtb} onValueChange={(v) => set({ totalBudgetEtb: v })} error={errors.totalBudgetEtb} placeholder="0" />}
        </Field>
        <Field id="fundingSource" label={t('f.fundingSource')} required error={errors.fundingSource} hint={t('h.fundingSource')}>
          {(a) => (
            <Select value={s.fundingSource} onValueChange={(v) => set({ fundingSource: v as FundingSource })}>
              <SelectTrigger {...a} className={errClass(errors.fundingSource)}><SelectValue placeholder={t('ph.select')} /></SelectTrigger>
              <SelectContent>{FUNDING_SOURCES.map((f) => <SelectItem key={f} value={f}>{te(`funding.${f}`)}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {/* Budget lines */}
      <div className="space-y-3 border-t pt-5">
        <SubHeading hint={t('h.budgetLines')} actions={<Button type="button" size="xs" variant="outline" disabled={!total} onClick={() => set({ budgetLines: budgetSplit(total) })}><Sparkles />{t('bl.standard')}</Button>}>{t('bl.title')}</SubHeading>
        {s.budgetLines.length > 0 && (
          <>
            {total > 0 && <StackedBar parts={s.budgetLines.map((l, i) => ({ key: l.key, label: l.category ? te(`budgetCategory.${l.category}`) : '—', value: toNum(l.allocatedEtb) ?? 0, color: `var(--seq-${[650, 450, 250, 650, 450][i % 5]})`, opacity: i >= 3 ? 0.55 : 1 }))} total={Math.max(total, allocated)} />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground"><th className="py-1.5">{t('bl.category')}</th><th className="w-56 py-1.5 text-right">{t('bl.amount')}</th><th className="w-20 py-1.5 text-right">{t('bl.share')}</th><th className="w-10" /></tr></thead>
                <tbody>
                  {s.budgetLines.map((l, i) => (
                    <tr key={l.key} className="align-top">
                      <td className="py-1.5 pr-2">
                        <Select value={l.category} onValueChange={(v) => updLine(l.key, { category: v as BudgetRow['category'] })}>
                          <SelectTrigger id={`budgetLines[${i}].category`} aria-label={t('bl.category')} className={cn('h-8 text-xs', errClass(errors[`budgetLines[${i}].category`]))}><SelectValue placeholder={t('ph.select')} /></SelectTrigger>
                          <SelectContent>{BUDGET_CATEGORIES.map((c) => <SelectItem key={c} value={c} disabled={used.has(c) && c !== l.category}>{te(`budgetCategory.${c}`)}</SelectItem>)}</SelectContent>
                        </Select>
                        <RowError error={errors[`budgetLines[${i}].category`]} />
                      </td>
                      <td className="py-1.5 pr-2"><MoneyInput id={`budgetLines[${i}].allocatedEtb`} aria-label={t('bl.amount')} className="h-8 text-xs" value={l.allocatedEtb} onValueChange={(v) => updLine(l.key, { allocatedEtb: v })} error={errors[`budgetLines[${i}].allocatedEtb`]} /></td>
                      <td className="py-1.5 pr-2 pt-3 text-right text-xs tabular text-muted-foreground">{pctOf(toNum(l.allocatedEtb) ?? 0, total)}</td>
                      <td className="py-1.5"><Button type="button" size="iconSm" variant="ghost" aria-label={t('remove')} onClick={() => set({ budgetLines: s.budgetLines.filter((x) => x.key !== l.key) })}><Trash2 /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" size="sm" variant="outline" disabled={s.budgetLines.length >= BUDGET_CATEGORIES.length} onClick={() => set({ budgetLines: [...s.budgetLines, { key: rowKey(), category: BUDGET_CATEGORIES.find((c) => !used.has(c)) ?? '', allocatedEtb: total > allocated ? String(Math.round((total - allocated) * 100) / 100) : '' }] })}><Plus />{t('bl.add')}</Button>
          {s.budgetLines.length > 0 && <div className="w-72"><Meter value={allocated} target={total} label={t('bl.allocated')} detail={t('bl.allocatedDetail', { allocated: money(allocated, locale), total: money(total, locale), diff: money(total - allocated, locale) })} /></div>}
        </div>
        <GroupError id="budgetLines" error={errors.budgetLines} />
      </div>

      {/* Disbursement schedule */}
      <div className="space-y-3 border-t pt-5">
        <SubHeading hint={t('h.tranches')} actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="xs" variant="outline" disabled={!total || !datesOk}><Sparkles />{t('tr.template')}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['advance', 'quarterly', 'single'] as TrancheTemplate[]).map((k) => <DropdownMenuItem key={k} onSelect={() => applyTranches(k)}><div><div className="text-sm">{t(`tr.templates.${k}`)}</div><div className="text-2xs text-muted-foreground">{t(`tr.templatesHint.${k}`)}</div></div></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        }>{t('tr.title')}</SubHeading>
        {(!total || !datesOk) && <Callout>{t('tr.needBudget')}</Callout>}
        {s.tranches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground"><th className="w-8 py-1.5">#</th><th className="w-44 py-1.5">{t('tr.date')}</th><th className="py-1.5 pr-2 text-right">{t('tr.amount')}</th><th className="w-48 py-1.5 pl-1">{t('tr.source')}</th><th className="w-24 py-1.5 text-right">{t('tr.cumulative')}</th><th className="w-10" /></tr></thead>
              <tbody>
                {s.tranches.map((r, i) => {
                  cumulative += toNum(r.amountEtb) ?? 0;
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="py-1.5 pr-2 pt-3 text-xs tabular text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-2"><RowInput id={`tranches[${i}].plannedDate`} type="date" error={errors[`tranches[${i}].plannedDate`]} value={r.plannedDate} onChange={(v) => updTr(r.key, { plannedDate: v })} label={t('tr.date')} /></td>
                      <td className="py-1.5 pr-2"><MoneyInput id={`tranches[${i}].amountEtb`} aria-label={t('tr.amount')} className="h-8 text-xs" value={r.amountEtb} onValueChange={(v) => updTr(r.key, { amountEtb: v })} error={errors[`tranches[${i}].amountEtb`]} /></td>
                      <td className="py-1.5 pr-2">
                        <Select value={r.fundingSource || 'DEFAULT'} onValueChange={(v) => updTr(r.key, { fundingSource: v === 'DEFAULT' ? '' : (v as FundingSource) })}>
                          <SelectTrigger className="h-8 text-xs" aria-label={t('tr.source')}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="DEFAULT">{t('tr.sameAsProject')}</SelectItem>{FUNDING_SOURCES.map((f) => <SelectItem key={f} value={f}>{te(`funding.${f}`)}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2 pt-3 text-right text-xs tabular text-muted-foreground">{pctOf(cumulative, total)}</td>
                      <td className="py-1.5"><Button type="button" size="iconSm" variant="ghost" aria-label={t('remove')} onClick={() => set({ tranches: s.tranches.filter((x) => x.key !== r.key) })}><Trash2 /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => set({ tranches: [...s.tranches, { key: rowKey(), plannedDate: s.tranches.at(-1)?.plannedDate ?? s.plannedStart ?? '', amountEtb: total > scheduled ? String(Math.round((total - scheduled) * 100) / 100) : '', fundingSource: '' }] })}><Plus />{t('tr.add')}</Button>
          {s.tranches.length > 0 && <div className="w-72"><Meter value={scheduled} target={total} label={t('tr.scheduled')} detail={t('tr.scheduledDetail', { scheduled: money(scheduled, locale), unscheduled: money(Math.max(0, total - scheduled), locale) })} /></div>}
        </div>
        <GroupError id="tranches" error={errors.tranches} />
      </div>
    </StepCard>
  );
}

function StackedBar({ parts, total }: { parts: { key: string; label: string; value: number; color: string; opacity?: number }[]; total: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>{parts.map((p) => <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: p.opacity }} title={p.label} />)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">{parts.map((p) => <span key={p.key} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: p.color, opacity: p.opacity }} />{p.label}</span>)}</div>
    </div>
  );
}

export function RowInput({ id, label, error, value, onChange, suffix, className, ...rest }: { id: string; label: string; error?: string; value: string; onChange: (v: string) => void; suffix?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'>) {
  return (
    <div data-field={id}>
      <div className="relative">
        <Input id={id} aria-label={label} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={cn('h-8 text-xs', suffix && 'pr-7', errClass(error), className)} {...rest} />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground">{suffix}</span>}
      </div>
      <RowError id={`${id}-error`} error={error} />
    </div>
  );
}
export function RowError({ id, error }: { id?: string; error?: string }) { return error ? <p id={id} className="mt-0.5 text-2xs text-destructive">{error}</p> : null; }

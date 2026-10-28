'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { CampaignProgress, CampaignRole, DamageCause, DamageSeverity, Intervention, NeedPriority, Sector, TaskStatus, AccessStatus, CurrentUse } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { Callout } from '@/components/projects/registration/ui';
import { taskStatusTone, toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

/* ─── Catalogues ──────────────────────────────────────────────────────────── */
export const CAMPAIGN_ROLES: CampaignRole[] = ['TEAM_LEAD', 'ASSESSOR', 'ENGINEER', 'VERIFIER'];
export const INTERVENTIONS: Intervention[] = ['NO_ACTION', 'MINOR_REPAIR', 'REHABILITATION', 'RECONSTRUCTION', 'RELOCATION'];
export const NEED_PRIORITIES: NeedPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
export const DAMAGE_CAUSES: DamageCause[] = ['SHELLING', 'AIRSTRIKE', 'LOOTING', 'FIRE', 'VANDALISM', 'OCCUPATION', 'NEGLECT', 'FLOOD', 'OTHER'];
export const ACCESS: AccessStatus[] = ['ACCESSIBLE', 'PARTIAL', 'INACCESSIBLE'];
export const CURRENT_USES: CurrentUse[] = ['NORMAL_USE', 'PARTIAL_USE', 'IDP_SHELTER', 'MILITARY_USE', 'ABANDONED', 'OTHER'];

/** Building elements, utilities and equipment groups surveyed per sector (codes are stored; labels are translated). */
export const COMPONENTS: Record<Sector, string[]> = {
  EDUCATION: ['STRUCTURE', 'ROOF', 'WALLS', 'DOORS_WINDOWS', 'FLOORS', 'CLASSROOMS', 'LIBRARY_LAB', 'ELECTRICAL', 'WATER_SUPPLY', 'SANITATION', 'FURNITURE', 'TEACHING_MATERIALS', 'FENCE_COMPOUND'],
  HEALTH: ['STRUCTURE', 'ROOF', 'WALLS', 'DOORS_WINDOWS', 'ELECTRICAL', 'WATER_SUPPLY', 'SANITATION', 'MEDICAL_EQUIPMENT', 'COLD_CHAIN', 'PHARMACY_STOCK', 'MATERNITY_WARD', 'LABORATORY', 'FURNITURE', 'FENCE_COMPOUND'],
  MANUFACTURING: ['STRUCTURE', 'ROOF', 'WALLS', 'MACHINERY', 'PRODUCTION_LINE', 'POWER_SUPPLY', 'WATER_SUPPLY', 'STORAGE', 'OFFICE_EQUIPMENT', 'FENCE_COMPOUND'],
  AGRICULTURE: ['STRUCTURE', 'CANALS_STRUCTURES', 'PUMPS_MOTORS', 'STORAGE', 'EQUIPMENT', 'LIVESTOCK_FACILITIES', 'WATER_SUPPLY', 'FENCE_COMPOUND'],
};

/** Severity from the structural impact score, mirroring the assessment guidance bands. */
export const severityForScore = (score: number): DamageSeverity => (score >= 80 ? 'DESTROYED' : score >= 55 ? 'SEVERE' : score >= 30 ? 'MODERATE' : score >= 8 ? 'MINOR' : 'NONE');

/** Readable message from an API error: field messages first, then the problem detail. */
export function apiMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.errors?.map((x) => x.message).join(' ') || e.detail || e.title || fallback;
  return fallback;
}

/* ─── Progress ────────────────────────────────────────────────────────────── */
const SEGMENTS: { key: keyof CampaignProgress; status: TaskStatus }[] = [
  { key: 'verified', status: 'VERIFIED' }, { key: 'submitted', status: 'SUBMITTED' }, { key: 'returned', status: 'RETURNED' },
  { key: 'inProgress', status: 'IN_PROGRESS' }, { key: 'assigned', status: 'ASSIGNED' }, { key: 'planned', status: 'PLANNED' }, { key: 'inaccessible', status: 'INACCESSIBLE' },
];

/** Stacked bar of site states; the legend repeats the numbers so colour is never the only cue. */
export function CampaignProgressBar({ progress, legend = false, className }: { progress: CampaignProgress; legend?: boolean; className?: string }) {
  const t = useTranslations('enums.taskStatus');
  const total = Math.max(progress.total, 1);
  const segs = SEGMENTS.map((s) => ({ ...s, n: progress[s.key] as number })).filter((s) => s.n > 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={segs.map((s) => `${t(s.status)} ${s.n}`).join(', ')}>
        {segs.map((s) => <div key={s.key} style={{ width: `${(s.n / total) * 100}%`, background: s.status === 'ASSIGNED' || s.status === 'PLANNED' ? 'hsl(var(--muted-foreground) / 0.35)' : toneVar[taskStatusTone[s.status]] }} />)}
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {segs.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.status === 'ASSIGNED' || s.status === 'PLANNED' ? 'hsl(var(--muted-foreground) / 0.35)' : toneVar[taskStatusTone[s.status]] }} />{t(s.status)} <span className="font-semibold tabular">{s.n}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Reason dialog ───────────────────────────────────────────────────────── */
/** Confirmation that requires a written reason (10+ characters), used for cancelling, releasing and access problems. */
export function ReasonDialog({ open, onOpenChange, title, description, label, confirm, destructive, minLength = 10, onConfirm, warning }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; label: string; confirm: string; destructive?: boolean; minLength?: number;
  onConfirm: (reason: string) => Promise<unknown>; warning?: string;
}) {
  const tc = useTranslations('common');
  const td = useTranslations('damage');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setReason(''); setError(null); } }, [open]);
  const short = reason.trim().length < minLength;
  const submit = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim()); onOpenChange(false); } catch (e) { setError(apiMessage(e, tc('error'))); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <div className="space-y-3">
          {warning && <Callout tone="warning">{warning}</Callout>}
          <div className="space-y-1.5">
            <Label htmlFor="reason-text">{label}{minLength > 0 && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</Label>
            <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[110px]" maxLength={2000} />
            {minLength > 0 && <p className={cn('text-xs', short && reason ? 'text-destructive' : 'text-muted-foreground')}>{td('reasonMin', { n: minLength })}</p>}
          </div>
          {error && <Callout tone="error">{error}</Callout>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={submit} disabled={short || busy}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Label / value row used on detail pages. */
export function Fact({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <div className={className}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{children}</dd></div>;
}

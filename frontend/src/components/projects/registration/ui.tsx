'use client';
import * as React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, Label } from '@/components/ui/input';
import { toneVar } from '@/lib/domain';

export const errClass = (err?: string) => (err ? 'border-destructive focus-visible:ring-destructive' : undefined);

/** Labelled field with hint and error, wired for screen readers (aria-invalid / aria-describedby on the control). */
export function Field({ id, label, hint, error, required, className, children, aside }: {
  id: string; label: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean; className?: string; aside?: React.ReactNode;
  children: (a11y: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)} data-field={id}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-foreground/90">{label}{required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</Label>
        {aside}
      </div>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? <p id={`${id}-error`} className="flex items-start gap-1 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Amount input: raw digits while editing, grouped (12,500,000) when not focused. Value is the raw string. */
export const MoneyInput = React.forwardRef<HTMLInputElement, { value: string; onValueChange: (v: string) => void; error?: string; prefix?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'>>(
  ({ value, onValueChange, error, prefix = 'ETB', className, ...rest }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const shown = focused || !value ? value : (() => { const [i, d] = value.split('.'); return Number(i || 0).toLocaleString('en-US') + (d !== undefined ? `.${d}` : ''); })();
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2xs font-medium text-muted-foreground">{prefix}</span>
        <Input ref={ref} inputMode="decimal" autoComplete="off" value={shown} className={cn('pl-11 text-right tabular', errClass(error), className)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); onValueChange(v); }} {...rest} />
      </div>
    );
  });
MoneyInput.displayName = 'MoneyInput';

export function StepCard({ title, description, children, actions }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">{description}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="space-y-6 p-5">{children}</div>
    </section>
  );
}

export function SubHeading({ children, hint, actions }: { children: React.ReactNode; hint?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h3 className="text-sm font-semibold">{children}</h3>{hint && <p className="text-2xs text-muted-foreground">{hint}</p>}</div>
      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

/** Horizontal meter for "allocated vs target"; turns amber below, red above the target. */
export function Meter({ value, target, label, detail }: { value: number; target: number; label: React.ReactNode; detail?: React.ReactNode }) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const exact = Math.abs(value - target) <= Math.max(1, target * 0.0005);
  const color = exact ? toneVar.good : pct > 100 ? toneVar.critical : toneVar.warning;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular" style={{ color }}>{target > 0 ? `${Math.round(pct * 10) / 10}%` : '—'}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
      {detail && <div className="text-2xs text-muted-foreground tabular">{detail}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error'; children: React.ReactNode }) {
  const color = tone === 'error' ? toneVar.critical : tone === 'warning' ? toneVar.warning : 'var(--seq-450)';
  return <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} /><div className="min-w-0">{children}</div></div>;
}

/** Field-level error for list sections (e.g. "weights must add up to 100%"). */
export function GroupError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return <p id={id} data-field={id} role="alert" className="flex items-start gap-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>;
}

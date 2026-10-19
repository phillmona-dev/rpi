import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions, meta, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 laptop:flex-row laptop:items-end laptop:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight laptop:text-2xl truncate">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Section({ title, hint, actions, children, className, id }: { title: React.ReactNode; hint?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('rounded-lg border bg-card shadow-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-2">
        <div>
          <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold leading-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="px-5 pb-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border bg-background/60 px-3 py-2', className)}>
      <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular leading-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

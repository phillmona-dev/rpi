'use client';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, Info } from 'lucide-react';
import type { Readiness } from '@/lib/api/types';
import { toneVar } from '@/lib/domain';

const color = (r: Readiness) => r.warnings === 0 ? toneVar.good : r.warnings <= 2 ? toneVar.warning : toneVar.serious;

/** Compact "7 / 9" meter for queue rows. */
export function ReadinessMeter({ r }: { r: Readiness }) {
  const pct = r.total ? (r.passed / r.total) * 100 : 0;
  return (
    <div className="w-32" title={`${r.passed} / ${r.total}`}>
      <div className="flex items-baseline justify-between text-sm"><span className="font-semibold tabular" style={{ color: color(r) }}>{r.passed} / {r.total}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color(r) }} /></div>
    </div>
  );
}

/** Full checklist for the dossier. Failed warnings first, then informational items, then passed checks. */
export function ReadinessList({ r }: { r: Readiness }) {
  const t = useTranslations('approvals.check');
  const order = [...r.checks].sort((a, b) => Number(a.passed) - Number(b.passed) || (a.severity === 'WARN' ? -1 : 1));
  return (
    <ul className="divide-y">
      {order.map((c) => {
        const Icon = c.passed ? CheckCircle2 : c.severity === 'WARN' ? CircleAlert : Info;
        const col = c.passed ? toneVar.good : c.severity === 'WARN' ? toneVar.warning : toneVar.neutral;
        return (
          <li key={c.code} className="flex items-start gap-3 py-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: col }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t(c.code as 'RISKS')}</div>
              {c.detail && <div className="text-sm text-muted-foreground">{c.detail}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

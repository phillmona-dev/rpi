'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Copy, KeyRound, UserCheck } from 'lucide-react';
import type { AccessResponse } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Callout } from '@/components/projects/registration/ui';

/** Shows a newly issued temporary password exactly once, with copy buttons. */
export function Credentials({ access, name }: { access: AccessResponse; name: string }) {
  const t = useTranslations('fieldTeam.access');
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-5 w-5 text-primary" />{access.created ? t('created', { name }) : t('reset', { name })}</div>
      <dl className="grid gap-3 tablet:grid-cols-2">
        {([['username', access.username], ['password', access.temporaryPassword]] as const).map(([k, v]) => (
          <div key={k} className="rounded-md border bg-muted/30 p-3">
            <dt className="text-sm text-muted-foreground">{t(k)}</dt>
            <dd className="mt-1 flex items-center justify-between gap-2"><code className="select-all break-all font-mono text-lg font-semibold">{v}</code>
              <Button type="button" size="xs" variant="outline" onClick={() => copy(k, v)}>{copied === k ? <Check /> : <Copy />}{copied === k ? t('copied') : t('copy')}</Button></dd>
          </div>
        ))}
      </dl>
      <Callout tone="warning">{t('once')}</Callout>
    </div>
  );
}

/** Success screen after registration. */
export function AccessCard({ agentId, name, access }: { agentId: number; name: string; access: AccessResponse | null }) {
  const t = useTranslations('fieldTeam');
  return (
    <section className="mx-auto max-w-2xl space-y-6 rounded-lg border bg-card p-6 shadow-card">
      <div className="flex items-center gap-3"><UserCheck className="h-8 w-8" style={{ color: 'var(--status-good)' }} /><div><h2 className="text-xl font-semibold">{name}</h2><p className="text-sm text-muted-foreground">{t('form.onboardingHint')}</p></div></div>
      {access && <><Credentials access={access} name={name} /><p className="text-sm text-muted-foreground">{t('access.disabledNote')}</p></>}
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link href={`/field-team/${agentId}`}>{t('profile.overview')}<ArrowRight /></Link></Button>
        <Button asChild variant="ghost"><Link href="/field-team">{t('title')}</Link></Button>
      </div>
    </section>
  );
}

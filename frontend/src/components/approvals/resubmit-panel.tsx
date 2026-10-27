'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { ApprovalDossier } from '@/lib/api/types';
import { useResubmitProject } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Callout } from '@/components/projects/registration/ui';

/** Analyst's response to a return: answer the comments, optionally correct the narrative fields, resubmit. */
export function ResubmitPanel({ dossier }: { dossier: ApprovalDossier }) {
  const t = useTranslations('approvals.resubmit');
  const tc = useTranslations('common');
  const d = dossier.detail;
  const resubmit = useResubmitProject(d.project.id);
  const comments = [...d.approval.events].reverse().find((e) => e.action === 'RETURNED');
  const [note, setNote] = React.useState('');
  const [name, setName] = React.useState(d.project.name);
  const [description, setDescription] = React.useState(d.description ?? '');
  const [beneficiaries, setBeneficiaries] = React.useState(d.project.beneficiaries?.toString() ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  if (done) return <section className="rounded-lg border bg-card p-5 shadow-card"><Callout>{t('done')}</Callout></section>;
  const submit = async () => {
    setError(null);
    if (note.trim().length < 10) { setError(t('responseHint')); return; }
    try {
      await resubmit.mutateAsync({ note: note.trim(), name: name.trim() !== d.project.name ? name.trim() : undefined, description: description !== (d.description ?? '') ? description : undefined,
        beneficiaries: beneficiaries && Number(beneficiaries) !== d.project.beneficiaries ? Number(beneficiaries) : undefined });
      setDone(true);
    } catch (e) { setError(e instanceof ApiError ? (e.errors?.map((x) => x.message).join(' ') || e.detail || e.title) : tc('error')); }
  };
  return (
    <section className="rounded-lg border-2 border-primary/40 bg-card shadow-card">
      <header className="border-b px-5 py-4"><h2 className="text-lg font-semibold">{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></header>
      <div className="space-y-4 p-5">
        {comments?.note && <div><div className="text-sm font-medium">{t('comments')}</div><p className="mt-1 whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-sm">{comments.note}</p></div>}
        <div className="space-y-1.5"><Label htmlFor="rs-note">{t('response')}<span className="ml-0.5 text-destructive" aria-hidden>*</span></Label><Textarea id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[110px]" maxLength={4000} /><p className="text-xs text-muted-foreground">{t('responseHint')}</p></div>
        <div className="space-y-1.5"><Label htmlFor="rs-name">{t('name')}</Label><Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={220} /></div>
        <div className="space-y-1.5"><Label htmlFor="rs-desc">{t('description')}</Label><Textarea id="rs-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[110px]" maxLength={5000} /></div>
        <div className="space-y-1.5"><Label htmlFor="rs-ben">{t('beneficiaries')}</Label><Input id="rs-ben" inputMode="numeric" value={beneficiaries} onChange={(e) => setBeneficiaries(e.target.value.replace(/\D/g, ''))} /></div>
        <p className="text-xs text-muted-foreground">{t('editNote')}</p>
        {error && <Callout tone="error">{error}</Callout>}
        <Button className="w-full" size="lg" onClick={submit} disabled={resubmit.isPending}>{t('submit')}</Button>
      </div>
    </section>
  );
}

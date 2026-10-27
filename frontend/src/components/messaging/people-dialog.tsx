'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { useAddMembers, useChatPeople, useCreateGroup, useOpenDirect } from '@/lib/api/messaging';
import type { ChatPerson } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { PersonAvatar } from './util';

type Mode = { kind: 'direct' } | { kind: 'group' } | { kind: 'add'; conversationId: number; exclude: number[] };

/** Pick people to message directly, to start a group with, or to add to an existing group. */
export function PeopleDialog({ open, mode, onOpenChange, onDone }: { open: boolean; mode: Mode; onOpenChange: (o: boolean) => void; onDone: (conversationId: number) => void }) {
  const t = useTranslations('messaging');
  const tr = useTranslations('roles');
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [selected, setSelected] = React.useState<ChatPerson[]>([]);
  const [title, setTitle] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { const h = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(h); }, [q]);
  React.useEffect(() => { if (open) { setQ(''); setSelected([]); setTitle(''); setError(null); } }, [open, mode.kind]);
  const { data, isLoading } = useChatPeople(debounced, open);
  const direct = useOpenDirect();
  const group = useCreateGroup();
  const add = useAddMembers(mode.kind === 'add' ? mode.conversationId : -1);
  const exclude = mode.kind === 'add' ? mode.exclude : [];
  const people = (data ?? []).filter((p) => !exclude.includes(p.id));
  const multi = mode.kind !== 'direct';
  const busy = direct.isPending || group.isPending || add.isPending;

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.detail || e.title : t('errors.generic'));
  const toggle = (p: ChatPerson) => setSelected((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [...s, p]));

  const choose = async (p: ChatPerson) => {
    if (multi) { toggle(p); return; }
    try { const d = await direct.mutateAsync(p.id); onDone(d.id); onOpenChange(false); } catch (e) { fail(e); }
  };
  const confirm = async () => {
    setError(null);
    try {
      if (mode.kind === 'group') {
        if (!title.trim()) { setError(t('errors.groupTitle')); return; }
        const d = await group.mutateAsync({ title: title.trim(), memberIds: selected.map((p) => p.id) });
        onDone(d.id);
      } else if (mode.kind === 'add') {
        const d = await add.mutateAsync(selected.map((p) => p.id));
        onDone(d.id);
      }
      onOpenChange(false);
    } catch (e) { fail(e); }
  };

  const heading = mode.kind === 'direct' ? t('newDirect') : mode.kind === 'group' ? t('newGroup') : t('addPeople');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{mode.kind === 'direct' ? t('newDirectHint') : mode.kind === 'group' ? t('newGroupHint') : t('addPeopleHint')}</DialogDescription>
        </DialogHeader>
        {mode.kind === 'group' && (
          <div className="space-y-1"><Label htmlFor="group-title">{t('groupName')}</Label>
            <Input id="group-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('groupNamePlaceholder')} /></div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPeople')} aria-label={t('searchPeople')} className="pl-9" autoFocus />
        </div>
        {multi && selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((p) => <button key={p.id} type="button" onClick={() => toggle(p)} className="rounded-full border bg-accent px-2.5 py-0.5 text-sm hover:bg-accent/70" aria-label={t('removePerson', { name: p.fullName })}>{p.fullName} ×</button>)}
          </div>
        )}
        <ul className="max-h-80 overflow-y-auto rounded-md border" aria-label={t('people')}>
          {isLoading ? [0, 1, 2].map((i) => <li key={i} className="flex gap-3 p-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 flex-1" /></li>)
            : people.length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">{t('noPeople')}</li>
            : people.map((p) => {
              const on = selected.some((x) => x.id === p.id);
              return (
                <li key={p.id}>
                  <button type="button" disabled={busy} onClick={() => choose(p)} aria-pressed={multi ? on : undefined}
                    className={cn('flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/60', on && 'bg-accent')}>
                    <PersonAvatar person={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.fullName}</span>
                      <span className="block truncate text-sm text-muted-foreground">{p.roles.map((r) => tr(r as 'ADMIN')).join(', ')}{p.title ? ` · ${p.title}` : ''}</span>
                    </span>
                    {p.online && <span className="text-xs" style={{ color: 'var(--status-good)' }}>{t('online')}</span>}
                    {multi && on && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
        </ul>
        {error && <p className="text-sm" style={{ color: 'var(--status-critical)' }} role="alert">{error}</p>}
        {multi && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button onClick={confirm} disabled={busy || selected.length === 0}>{mode.kind === 'group' ? t('createGroup') : t('add')}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

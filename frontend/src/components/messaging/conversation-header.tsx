'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowUpRight, Bell, BellOff, Info, LogOut, MoreVertical, Pencil, UserMinus, UserPlus, Eye, EyeOff, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { ApiError } from '@/lib/api/client';
import { useConversationSettings, useFollow, useRemoveMember } from '@/lib/api/messaging';
import type { ConversationDetail } from '@/lib/api/types';
import { PersonAvatar, contextHref, kindIcon } from './util';
import { PeopleDialog } from './people-dialog';

export function ConversationHeader({ d, onBack, infoOpen, onToggleInfo, onLeft }: {
  d: ConversationDetail; onBack?: () => void; infoOpen: boolean; onToggleInfo: () => void; onLeft: () => void;
}) {
  const t = useTranslations('messaging');
  const tc = useTranslations('messaging.contextType');
  const tr = useTranslations('roles');
  const user = useUser();
  const settings = useConversationSettings(d.id);
  const follow = useFollow(d.id);
  const remove = useRemoveMember(d.id);
  const Icon = kindIcon(d.kind, d.context?.type);
  const online = d.members.filter((m) => m.person.online && m.person.id !== user.id).length;
  const sub = d.kind === 'DIRECT' && d.counterpart
    ? [d.counterpart.roles.map((r) => tr(r as 'ADMIN')).join(', '), d.counterpart.online ? t('online') : null].filter(Boolean).join(' · ')
    : d.kind === 'CONTEXT' && d.context ? `${tc(d.context.type)}${d.context.code ? ` · ${d.context.code}` : ''} · ${t('followers', { count: d.members.length })}`
    : `${t('members', { count: d.members.length })}${online ? ` · ${t('onlineCount', { count: online })}` : ''}`;

  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5 tablet:px-4">
      {onBack && <Button variant="ghost" size="icon" className="laptop:hidden" onClick={onBack} aria-label={t('backToList')}><ArrowLeft /></Button>}
      {d.kind === 'DIRECT' ? <PersonAvatar person={d.counterpart} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold leading-tight">{d.title ?? t('untitled')}</h2>
        <p className="truncate text-sm text-muted-foreground">{sub}</p>
      </div>
      {d.context && <Button asChild variant="outline" size="sm" className="hidden tablet:inline-flex"><Link href={contextHref(d.context.type, d.context.id)}>{t('openRecord')}<ArrowUpRight /></Link></Button>}
      <Button variant={infoOpen ? 'secondary' : 'ghost'} size="icon" onClick={onToggleInfo} aria-label={t('details')} aria-pressed={infoOpen}><Info /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('moreActions')}><MoreVertical /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {d.context && <DropdownMenuItem asChild className="tablet:hidden"><Link href={contextHref(d.context.type, d.context.id)}><ArrowUpRight />{t('openRecord')}</Link></DropdownMenuItem>}
          {d.kind === 'CONTEXT' && (d.following
            ? <DropdownMenuItem onSelect={() => follow.mutate(false)}><EyeOff />{t('unfollow')}</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => follow.mutate(true)}><Eye />{t('follow')}</DropdownMenuItem>)}
          {d.following && (d.muted
            ? <DropdownMenuItem onSelect={() => settings.mutate({ muted: false })}><Bell />{t('unmute')}</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => settings.mutate({ muted: true })}><BellOff />{t('mute')}</DropdownMenuItem>)}
          {d.kind === 'GROUP' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={async () => { await remove.mutateAsync(user.id); onLeft(); }} className="text-[color:var(--status-critical)]"><LogOut />{t('leaveGroup')}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Side panel: who is in the conversation, how far they have read, and group management. */
export function ConversationInfo({ d, onClose }: { d: ConversationDetail; onClose: () => void }) {
  const t = useTranslations('messaging');
  const tr = useTranslations('roles');
  const user = useUser();
  const settings = useConversationSettings(d.id);
  const remove = useRemoveMember(d.id);
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [title, setTitle] = React.useState(d.title ?? '');
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { setTitle(d.title ?? ''); setRenaming(false); setError(null); }, [d.id, d.title]);

  const rename = async () => {
    if (!title.trim()) return;
    try { await settings.mutateAsync({ title: title.trim() }); setRenaming(false); }
    catch (e) { setError(e instanceof ApiError ? e.detail || e.title : t('errors.generic')); }
  };

  return (
    <aside className="flex min-h-0 flex-col border-l bg-card" aria-label={t('details')}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">{t('details')}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {d.kind === 'GROUP' && d.canManage && (
          <div className="space-y-2">
            {renaming ? (
              <div className="flex gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label={t('groupName')} onKeyDown={(e) => e.key === 'Enter' && rename()} autoFocus /><Button size="sm" onClick={rename} disabled={settings.isPending}>{t('save')}</Button></div>
            ) : <Button variant="outline" size="sm" onClick={() => setRenaming(true)}><Pencil />{t('rename')}</Button>}
            {error && <p className="text-sm" style={{ color: 'var(--status-critical)' }}>{error}</p>}
          </div>
        )}
        {d.kind === 'GROUP' && <Button variant="outline" size="sm" onClick={() => setAdding(true)}><UserPlus />{t('addPeople')}</Button>}
        {d.kind === 'CONTEXT' && <p className="text-sm text-muted-foreground">{t('followersHint')}</p>}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.kind === 'CONTEXT' ? t('followers', { count: d.members.length }) : t('members', { count: d.members.length })}</h4>
          <ul className="space-y-1">
            {d.members.map((m) => (
              <li key={m.person.id} className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
                <PersonAvatar person={m.person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm font-medium">{m.person.fullName}{m.person.id === user.id && <span className="text-muted-foreground">({t('you')})</span>}{m.role === 'OWNER' && <Crown className="h-3.5 w-3.5 text-primary" aria-label={t('owner')} />}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.person.roles.map((r) => tr(r as 'ADMIN')).join(', ')}</span>
                </span>
                {d.kind === 'GROUP' && d.canManage && m.person.id !== user.id && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('removePerson', { name: m.person.fullName })} onClick={() => remove.mutate(m.person.id)}><UserMinus className="h-4 w-4" /></Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {adding && <PeopleDialog open={adding} onOpenChange={setAdding} mode={{ kind: 'add', conversationId: d.id, exclude: d.members.map((m) => m.person.id) }} onDone={() => undefined} />}
    </aside>
  );
}

'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AtSign, BellOff, Paperclip, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/providers/session';
import { useConversations } from '@/lib/api/messaging';
import type { ConversationSummary } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { PersonAvatar, kindIcon } from './util';

export type ListFilter = 'all' | 'unread' | 'direct' | 'groups' | 'discussions';
const FILTERS: ListFilter[] = ['all', 'unread', 'direct', 'groups', 'discussions'];

export function shortTime(iso: string, locale: string) {
  const d = new Date(iso); const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function ConversationList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const t = useTranslations('messaging');
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [filter, setFilter] = React.useState<ListFilter>('all');
  React.useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);
  const { data, isLoading } = useConversations(debounced);

  const rows = (data ?? []).filter((c) =>
    filter === 'all' ? true : filter === 'unread' ? c.unread > 0 || c.mentioned : filter === 'direct' ? c.kind === 'DIRECT' : filter === 'groups' ? c.kind === 'GROUP' : c.kind === 'CONTEXT');

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchConversations')} aria-label={t('searchConversations')} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('filter')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cn('rounded-full border px-2.5 py-0.5 text-sm transition-colors', filter === f ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              {t(`filters.${f}`)}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={t('conversations')}>
        {isLoading ? [0, 1, 2, 3].map((i) => <li key={i} className="flex gap-3 p-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /></div></li>)
          : rows.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">{debounced || filter !== 'all' ? t('noMatches') : t('noConversations')}</li>
          : rows.map((c) => <Row key={c.id} c={c} selected={c.id === selectedId} onSelect={onSelect} />)}
      </ul>
    </div>
  );
}

function Row({ c, selected, onSelect }: { c: ConversationSummary; selected: boolean; onSelect: (id: number) => void }) {
  const t = useTranslations('messaging');
  const tc = useTranslations('messaging.contextType');
  const locale = useLocale();
  const user = useUser();
  const Icon = kindIcon(c.kind, c.context?.type);
  const lm = c.lastMessage;
  const sender = lm && lm.kind === 'TEXT' ? (lm.senderName === user.fullName ? t('you') : c.kind === 'DIRECT' ? null : lm.senderName?.split(' ')[0]) : null;
  const preview = !lm ? t('noMessagesYet') : lm.deleted ? t('deletedMessage') : lm.kind === 'SYSTEM' ? t(`systemShort.${lm.body}` as 'systemShort.GROUP_CREATED')
    : lm.body || (lm.hasAttachments ? t('attachmentOnly') : '');
  const unread = c.unread > 0;
  return (
    <li>
      <button type="button" onClick={() => onSelect(c.id)} aria-current={selected ? 'true' : undefined}
        className={cn('flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-accent/60', selected && 'bg-accent')}>
        {c.kind === 'DIRECT' ? <PersonAvatar person={c.counterpart} name={c.title} /> : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>{c.title ?? t('untitled')}</span>
            <span className={cn('shrink-0 text-xs', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{shortTime(c.lastActivityAt, locale)}</span>
          </span>
          {c.context && <span className="block truncate text-xs text-muted-foreground">{tc(c.context.type)}{c.context.code ? ` · ${c.context.code}` : ''}</span>}
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>
              {lm?.hasAttachments && !lm.deleted && <Paperclip className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
              {sender && <span className="font-medium">{sender}: </span>}{preview}
            </span>
            {c.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('muted')} />}
            {c.mentioned && <AtSign className="h-4 w-4 shrink-0 text-primary" aria-label={t('mentionedYou')} />}
            {unread && <span className={cn('min-w-[1.25rem] shrink-0 rounded-full px-1.5 text-center text-xs font-semibold leading-5', c.muted ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground')} aria-label={t('unreadCount', { count: c.unread })}>{c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

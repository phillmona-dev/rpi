'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link, useRouter } from '@/i18n/navigation';
import { useChatUnread, useConversations } from '@/lib/api/messaging';
import type { ConversationSummary } from '@/lib/api/types';
import { shortTime } from './conversation-list';
import { PersonAvatar, kindIcon } from './util';

/** Top-bar entry point: unread badge and the most recent conversations. */
export function ChatIndicator() {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const router = useRouter();
  const { data: unread } = useChatUnread();
  const [open, setOpen] = React.useState(false);
  const { data } = useConversations();
  const recent = (data ?? []).slice(0, 6);
  const total = unread?.total ?? 0;
  const label = total ? t('unreadCount', { count: total }) : t('title');

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label}>
          <MessageSquare className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-2xs font-bold leading-[1.1rem] text-primary-foreground" aria-hidden>
              {total > 99 ? '99+' : total}
            </span>
          )}
          {!total && (unread?.mentions ?? 0) > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{t('title')}</span>
          {total > 0 && <span className="text-xs">{t('unreadCount', { count: total })}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t('noConversations')}</p> : recent.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => router.push(`/messages?c=${c.id}`)} className="items-start gap-2.5 py-2">
            <RowIcon c={c} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2"><span className={c.unread ? 'truncate font-semibold' : 'truncate'}>{c.title ?? t('untitled')}</span><span className="shrink-0 text-2xs text-muted-foreground">{shortTime(c.lastActivityAt, locale)}</span></span>
              <span className="block truncate text-xs text-muted-foreground">{c.lastMessage?.deleted ? t('deletedMessage') : c.lastMessage?.kind === 'SYSTEM' ? t(`systemShort.${c.lastMessage.body}` as 'systemShort.GROUP_CREATED') : c.lastMessage?.body ?? (c.lastMessage?.hasAttachments ? t('attachmentOnly') : t('noMessagesYet'))}</span>
            </span>
            {c.unread > 0 && <span className="mt-0.5 shrink-0 rounded-full bg-primary px-1.5 text-2xs font-semibold leading-5 text-primary-foreground">{c.unread}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/messages" className="justify-center font-medium">{t('openAll')}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowIcon({ c }: { c: ConversationSummary }) {
  const Icon = kindIcon(c.kind, c.context?.type);
  return c.kind === 'DIRECT' ? <PersonAvatar person={c.counterpart} name={c.title} size="sm" />
    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" /></span>;
}

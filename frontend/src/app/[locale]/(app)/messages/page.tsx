'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { MessageSquarePlus, Search, Users, MessageCircle, MessagesSquare } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { useChatSearch, useChatUnread, useConversation, useOpenDirect } from '@/lib/api/messaging';
import { ConversationList, shortTime } from '@/components/messaging/conversation-list';
import { ConversationHeader, ConversationInfo } from '@/components/messaging/conversation-header';
import { ChatThread } from '@/components/messaging/chat-thread';
import { PeopleDialog } from '@/components/messaging/people-dialog';
import { MessageBody } from '@/components/messaging/message-item';
import { useUser } from '@/providers/session';
import { cn } from '@/lib/utils';

export default function MessagesPage() {
  const t = useTranslations('messaging');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = params.get('c') ? Number(params.get('c')) : null;
  const [dialog, setDialog] = React.useState<'direct' | 'group' | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [toError, setToError] = React.useState<string | null>(null);
  const { data: unread } = useChatUnread();
  const openDirect = useOpenDirect();
  useBreadcrumbs([{ label: t('title') }]);

  const select = React.useCallback((id: number | null) => {
    const p = new URLSearchParams(params.toString());
    p.delete('to');
    if (id) p.set('c', String(id)); else p.delete('c');
    router.replace(`${pathname}?${p.toString()}` as '/');
  }, [params, pathname, router]);

  // ?to=<userId> opens (or starts) the direct conversation with that person, e.g. from a profile page.
  const to = params.get('to');
  React.useEffect(() => {
    if (!to) return;
    openDirect.mutateAsync(Number(to)).then((d) => select(d.id)).catch((e) => setToError(e instanceof ApiError ? e.detail || e.title : t('errors.generic')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  const { data: detail, isLoading, error } = useConversation(selected);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={unread && unread.total > 0 ? t('unreadSummary', { count: unread.total, conversations: unread.conversations }) : t('subtitle')}
        actions={<>
          <Button variant="outline" onClick={() => setSearchOpen(true)}><Search />{t('searchMessages')}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button><MessageSquarePlus />{t('newMessage')}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog('direct')}><MessageCircle />{t('newDirect')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('group')}><Users />{t('newGroup')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>}
      />
      {toError && <p className="text-sm" role="alert" style={{ color: 'var(--status-critical)' }}>{toError}</p>}

      <div className={cn('grid h-[calc(100dvh-13.5rem)] min-h-[520px] overflow-hidden rounded-lg border bg-card shadow-card',
        infoOpen && detail ? 'laptop:grid-cols-[22rem_1fr_18rem]' : 'laptop:grid-cols-[22rem_1fr]')}>
        <div className={cn('min-h-0 border-r', selected ? 'hidden laptop:flex laptop:flex-col' : 'flex flex-col')}>
          <ConversationList selectedId={selected} onSelect={select} />
        </div>
        <div className={cn('min-h-0 flex-col', selected ? 'flex' : 'hidden laptop:flex')}>
          {selected === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
              <MessagesSquare className="h-12 w-12 opacity-40" aria-hidden />
              <p className="text-lg font-medium text-foreground">{t('pickConversation')}</p>
              <p className="max-w-md text-sm">{t('pickConversationHint')}</p>
              <div className="mt-2 flex gap-2"><Button variant="outline" onClick={() => setDialog('direct')}><MessageCircle />{t('newDirect')}</Button><Button variant="outline" onClick={() => setDialog('group')}><Users />{t('newGroup')}</Button></div>
            </div>
          ) : isLoading ? (
            <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
          ) : error || !detail ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">{error instanceof ApiError ? error.detail || error.title : t('errors.generic')}</div>
          ) : (
            <>
              <ConversationHeader d={detail} onBack={() => select(null)} infoOpen={infoOpen} onToggleInfo={() => setInfoOpen((o) => !o)} onLeft={() => select(null)} />
              <ChatThread key={detail.id} detail={detail} className="flex-1" />
            </>
          )}
        </div>
        {infoOpen && detail && <div className="hidden min-h-0 laptop:flex laptop:flex-col"><ConversationInfo d={detail} onClose={() => setInfoOpen(false)} /></div>}
      </div>

      <PeopleDialog open={dialog !== null} mode={{ kind: dialog ?? 'direct' }} onOpenChange={(o) => !o && setDialog(null)} onDone={(id) => select(id)} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onPick={(id) => { setSearchOpen(false); select(id); }} />
    </>
  );
}

function SearchDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (conversationId: number) => void }) {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const user = useUser();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => { const h = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(h); }, [q]);
  const { data, isFetching } = useChatSearch(debounced);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('searchMessages')}</DialogTitle><DialogDescription>{t('searchHint')}</DialogDescription></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchMessages')} className="pl-9" autoFocus />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto rounded-md border" aria-busy={isFetching}>
          {debounced.trim().length < 2 ? <li className="p-4 text-center text-sm text-muted-foreground">{t('searchMin')}</li>
            : !data ? <li className="p-4"><Skeleton className="h-10" /></li>
            : data.length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">{t('noResults')}</li>
            : data.map((h) => (
              <li key={h.message.id}>
                <button type="button" onClick={() => onPick(h.message.conversationId)} className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/60">
                  <span className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-medium">{h.conversationTitle ?? t('untitled')}</span><span className="shrink-0 text-xs text-muted-foreground">{shortTime(h.message.createdAt, locale)}</span></span>
                  <span className="block text-xs text-muted-foreground">{h.message.senderName}</span>
                  <span className="mt-0.5 line-clamp-2 text-sm"><MessageBody body={h.message.body ?? ''} mentions={h.message.mentions} meId={user.id} /></span>
                </button>
              </li>
            ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, Loader2, Lock, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/providers/session';
import { useLive } from '@/components/layout/live-indicator';
import { flattenMessages, useChatPeople, useMarkRead, useMessages, useSendMessage } from '@/lib/api/messaging';
import type { ChatMessage, ChatPerson, ConversationDetail } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Composer, type ComposerHandle } from './composer';
import { MessageItem, SystemLine } from './message-item';
import { useVisibleConversation } from './util';

const GROUP_WINDOW_MS = 5 * 60_000;

/** Message history plus composer for one conversation. Used by the Messages page and by record discussions. */
export function ChatThread({ detail, className, compact }: { detail: ConversationDetail; className?: string; compact?: boolean }) {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const user = useUser();
  const live = useLive();
  const id = detail.id;
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(id);
  const messages = React.useMemo(() => flattenMessages(data), [data]);
  const send = useSendMessage(id);
  const markRead = useMarkRead(id);
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [typing, setTyping] = React.useState<Record<number, { name: string; until: number }>>({});
  const [atBottom, setAtBottom] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const composer = React.useRef<ComposerHandle>(null);
  const lastSeenCount = React.useRef(0);
  const prependAnchor = React.useRef<number | null>(null);
  useVisibleConversation(id);

  // Mention candidates: the members for private conversations; anyone (the server checks access) for record discussions.
  const directory = useChatPeople(undefined, detail.kind === 'CONTEXT' && detail.canPost);
  const people: ChatPerson[] = React.useMemo(() => {
    const members = detail.members.map((m) => m.person).filter((p) => p.id !== user.id);
    return detail.kind === 'CONTEXT' ? [...members, ...(directory.data ?? []).filter((p) => !members.some((m) => m.id === p.id))] : members;
  }, [detail, directory.data, user.id]);

  // Where "new messages" starts: the read position when the conversation was opened.
  const unreadFrom = React.useRef<{ conv: number; at: number | null }>({ conv: -1, at: null });
  if (unreadFrom.current.conv !== id) unreadFrom.current = { conv: id, at: detail.following ? detail.lastReadMessageId : null };

  React.useEffect(() => { setReplyTo(null); setTyping({}); lastSeenCount.current = 0; }, [id]);

  // Typing indicators from other members, each shown for a few seconds.
  React.useEffect(() => live?.onChatFrame((f) => {
    if (f.conversationId !== id) return;
    if (f.type === 'TYPING') {
      const p = f.payload as { userId: number; fullName: string };
      if (p.userId !== user.id) setTyping((x) => ({ ...x, [p.userId]: { name: p.fullName, until: Date.now() + 5000 } }));
    } else if (f.type === 'MESSAGE') {
      const m = f.payload as ChatMessage;
      if (m.senderId) setTyping((x) => { const n = { ...x }; delete n[m.senderId!]; return n; });
    }
  }), [live, id, user.id]);
  React.useEffect(() => {
    if (!Object.keys(typing).length) return;
    const h = setInterval(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => clearInterval(h);
  }, [typing]);

  const scrollToBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Keep the view pinned to the newest message unless the reader has scrolled up; keep position when older history loads.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prependAnchor.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    } else if (lastSeenCount.current === 0 || atBottom || messages[messages.length - 1]?.senderId === user.id) {
      scrollToBottom();
    }
    lastSeenCount.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const loadOlder = React.useCallback(() => {
    const el = scroller.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    prependAnchor.current = el.scrollHeight - el.scrollTop;
    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 120) loadOlder();
  };

  // Mark as read when the newest message is on screen and the tab is visible.
  const newest = messages[messages.length - 1]?.id ?? null;
  const mine = detail.members.find((m) => m.person.id === user.id);
  React.useEffect(() => {
    if (!newest || !mine || !atBottom) return;
    if (mine.lastReadMessageId >= newest) return;
    const fire = () => { if (document.visibilityState === 'visible' && !markRead.isPending) markRead.mutate(newest); };
    fire();
    document.addEventListener('visibilitychange', fire);
    return () => document.removeEventListener('visibilitychange', fire);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest, mine?.lastReadMessageId, atBottom]);

  // Read receipt under my latest message.
  const others = detail.members.filter((m) => m.person.id !== user.id);
  const lastMine = [...messages].reverse().find((m) => m.senderId === user.id && m.kind === 'TEXT' && !m.deleted);
  const receiptFor = (m: ChatMessage) => {
    if (m.id !== lastMine?.id) return undefined;
    const seen = others.filter((o) => o.lastReadMessageId >= m.id);
    if (detail.kind === 'DIRECT') return seen.length ? t('seen') : t('sent');
    return seen.length ? <span title={seen.map((s) => s.person.fullName).join(', ')}>{t('seenBy', { count: seen.length })}</span> : t('sent');
  };

  const typingNames = Object.values(typing).map((x) => x.name);
  const dayLabel = (iso: string) => {
    const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t('today');
    if (d.toDateString() === y.toDateString()) return t('yesterday');
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  };

  const canModerate = user.roles.includes('ADMIN');
  let dividerShown = false;

  return (
    <div
      className={cn('relative flex min-h-0 flex-col', className)}
      onDragOver={(e) => { if (detail.canPost && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (!detail.canPost) return; e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) composer.current?.addFiles(e.dataTransfer.files); }}
    >
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 tablet:px-4" role="log" aria-live="polite" aria-label={t('history')}>
        {isLoading ? (
          <div className="space-y-4 py-2">{[0, 1, 2].map((i) => <Skeleton key={i} className={cn('h-14', i % 2 ? 'ml-auto w-1/2' : 'w-2/3')} />)}</div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10 opacity-40" aria-hidden />
            <p className="text-base font-medium text-foreground">{t('emptyThread')}</p>
            <p className="max-w-sm text-sm">{detail.kind === 'CONTEXT' ? t('emptyContextHint') : t('emptyThreadHint')}</p>
          </div>
        ) : (
          <>
            {hasNextPage && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={isFetchingNextPage}>{isFetchingNextPage && <Loader2 className="animate-spin" />}{t('loadEarlier')}</Button>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const showDivider = !dividerShown && unreadFrom.current.at !== null && m.id > unreadFrom.current.at && m.senderId !== user.id && m.kind === 'TEXT';
              if (showDivider) dividerShown = true;
              const grouped = !newDay && !showDivider && !!prev && prev.kind === 'TEXT' && m.kind === 'TEXT' && prev.senderId === m.senderId
                && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
              return (
                <React.Fragment key={m.id}>
                  {newDay && <div className="my-4 flex justify-center"><span className="rounded-full border bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground">{dayLabel(m.createdAt)}</span></div>}
                  {showDivider && <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--status-critical)' }}><span className="h-px flex-1 bg-current opacity-40" />{t('newMessages')}<span className="h-px flex-1 bg-current opacity-40" /></div>}
                  {m.kind === 'SYSTEM' ? <SystemLine m={m} /> : (
                    <MessageItem m={m} mine={m.senderId === user.id} grouped={grouped} meId={user.id} canModerate={canModerate} canPost={detail.canPost}
                      onReply={(x) => { setReplyTo(x); composer.current?.focus(); }} receipt={receiptFor(m)} />
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {!atBottom && messages.length > 0 && (
        <Button size="sm" variant="secondary" className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 shadow-md" onClick={() => scrollToBottom(true)}>
          <ArrowDown />{t('jumpToLatest')}
        </Button>
      )}

      <div className="h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
        {typingNames.length > 0 && <span className="animate-pulse">{typingNames.length === 1 ? t('typingOne', { name: typingNames[0] }) : t('typingMany', { count: typingNames.length })}</span>}
      </div>

      {detail.canPost ? (
        <Composer ref={composer} conversationId={id} people={people} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} compact={compact}
          onSend={async (b) => { await send.mutateAsync(b); setAtBottom(true); }} />
      ) : (
        <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><Lock className="h-4 w-4" />{detail.cannotPostReason ?? t('readOnly')}</div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-base font-medium text-primary">{t('dropFiles')}</div>
      )}
    </div>
  );
}

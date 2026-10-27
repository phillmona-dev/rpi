'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Bell, BellOff, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { useChatPeople, useConversation, useConversationSettings, useFollow, useOpenContext } from '@/lib/api/messaging';
import type { ChatContextType } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { ChatThread } from './chat-thread';
import { PersonAvatar } from './util';

/**
 * The discussion attached to a record (project, approval request, alert, field team member), embedded on that
 * record's page. People with a stake in the record follow it automatically; anyone else follows by writing in it.
 */
export function RecordDiscussion({ type, id, title, hint, className, threadClassName = 'h-[520px]', bare }: {
  type: ChatContextType; id: number; title?: React.ReactNode; hint?: React.ReactNode; className?: string; threadClassName?: string; bare?: boolean;
}) {
  const t = useTranslations('messaging');
  const open = useOpenContext();
  const [convId, setConvId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setConvId(null); setError(null);
    open.mutateAsync({ type, id })
      .then((d) => { if (live) setConvId(d.id); })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.detail || e.title : t('errors.generic')); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  const { data: d } = useConversation(convId);
  const follow = useFollow(convId ?? -1);
  const settings = useConversationSettings(convId ?? -1);
  const shown = d?.members.slice(0, 5) ?? [];

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-tight">{title ?? t('discussion')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint ?? t(`contextHint.${type}`)}</p>
      </div>
      {d && (
        <div className="flex flex-wrap items-center gap-2">
          {shown.length > 0 && (
            <span className="flex -space-x-2" title={d.members.map((m) => m.person.fullName).join(', ')} aria-label={t('followers', { count: d.members.length })}>
              {shown.map((m) => <PersonAvatar key={m.person.id} person={{ ...m.person, online: false }} size="sm" className="rounded-full bg-card ring-2 ring-card" />)}
              {d.members.length > shown.length && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-2xs font-semibold ring-2 ring-card">+{d.members.length - shown.length}</span>}
            </span>
          )}
          {d.following ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => settings.mutate({ muted: !d.muted })} aria-pressed={d.muted}>{d.muted ? <BellOff /> : <Bell />}{d.muted ? t('unmute') : t('mute')}</Button>
              <Button variant="ghost" size="sm" onClick={() => follow.mutate(false)} disabled={follow.isPending}><EyeOff />{t('unfollow')}</Button>
            </>
          ) : <Button variant="outline" size="sm" onClick={() => follow.mutate(true)} disabled={follow.isPending}><Eye />{t('follow')}</Button>}
          <Button asChild variant="ghost" size="sm"><Link href={`/messages?c=${d.id}`}>{t('openInMessages')}<ArrowUpRight /></Link></Button>
        </div>
      )}
    </div>
  );

  return (
    <section className={cn(!bare && 'overflow-hidden rounded-lg border bg-card shadow-card', className)} aria-label={typeof title === 'string' ? title : t('discussion')}>
      {header}
      {error ? <p className="p-4 text-sm text-muted-foreground">{error}</p>
        : !d ? <div className="space-y-3 p-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-10" /></div>
        : <ChatThread key={d.id} detail={d} className={threadClassName} compact />}
    </section>
  );
}

/** Opens a direct conversation with a user known only by username (e.g. a field team member's account). */
export function MessagePersonButton({ username, label, size = 'default', variant = 'outline' }: { username: string; label?: string; size?: 'default' | 'sm'; variant?: 'outline' | 'ghost' | 'default' }) {
  const t = useTranslations('messaging');
  const { data } = useChatPeople(username);
  const person = data?.find((p) => p.username.toLowerCase() === username.toLowerCase());
  if (!person) return null;
  return <Button asChild variant={variant} size={size}><Link href={`/messages?to=${person.id}`}><MessageCircle />{label ?? t('messagePerson')}</Link></Button>;
}

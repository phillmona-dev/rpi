'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as Popover from '@radix-ui/react-popover';
import { Bell, BellOff, CheckCheck, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from '@/i18n/navigation';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationUnread, useNotifications } from '@/lib/api/notifications';
import type { AppNotification } from '@/lib/api/types';
import { desktopState } from '@/lib/notify/desktop';
import { useNotifyPrefs } from '@/lib/notify/prefs';
import { cn } from '@/lib/utils';
import { BellContext } from './notification-provider';
import { severityColor, useRenderNotification } from './render';
import { NotificationSettings } from './notification-settings';

function ago(iso: string, locale: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (s < 45) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86_400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 7 * 86_400) return rtf.format(-Math.round(s / 86_400), 'day');
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** The bell: unread count, the notification list, and the way into notification settings. */
export function NotificationCenter() {
  const t = useTranslations('notifications');
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'all' | 'unread'>('all');
  const [settings, setSettings] = React.useState(false);
  const { data: unread } = useNotificationUnread();
  const count = unread?.unread ?? 0;
  const ring = React.useContext(BellContext);
  const prefs = useNotifyPrefs();
  const quiet = !prefs.sound && !(prefs.desktop && desktopState() === 'granted');
  const markAll = useMarkAllNotificationsRead();

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={count ? t('bellUnread', { count }) : t('title')}>
            <span key={ring} className={ring ? 'bell-ring inline-flex' : 'inline-flex'}>{quiet ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span>
            {count > 0 && (
              <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full px-1 text-center text-2xs font-bold leading-[1.1rem] text-white" style={{ background: 'var(--status-critical)' }}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={8} collisionPadding={12}
            className="z-50 flex max-h-[min(36rem,calc(100dvh-5rem))] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-[0_16px_40px_-10px_rgba(0,0,0,0.5)] outline-none">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-base font-semibold">{t('title')}</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={!count || markAll.isPending}><CheckCheck />{t('markAllRead')}</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('settings.title')} onClick={() => { setOpen(false); setSettings(true); }}><Settings2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex gap-1 border-b px-3 py-2" role="tablist">
              {(['all', 'unread'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={cn('rounded-full px-3 py-1 text-sm transition-colors', tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                  {k === 'all' ? t('tabs.all') : t('tabs.unread', { count })}
                </button>
              ))}
            </div>
            <NotificationList unreadOnly={tab === 'unread'} onNavigate={() => setOpen(false)} />
            {desktopState() !== 'granted' && (
              <button type="button" onClick={() => { setOpen(false); setSettings(true); }} className="border-t bg-muted/40 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted">
                {t('desktopOffHint')}
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <NotificationSettings open={settings} onOpenChange={setSettings} />
    </>
  );
}

function NotificationList({ unreadOnly, onNavigate }: { unreadOnly: boolean; onNavigate: () => void }) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();
  const render = useRenderNotification();
  const markRead = useMarkNotificationRead();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications(unreadOnly);
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const today = new Date().toDateString();
  const groups: [string, AppNotification[]][] = [
    [t('today'), items.filter((n) => new Date(n.createdAt).toDateString() === today)],
    [t('earlier'), items.filter((n) => new Date(n.createdAt).toDateString() !== today)],
  ];

  if (isLoading) return <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /></div></div>)}</div>;
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Bell className="h-6 w-6" /></span>
        <p className="font-medium">{unreadOnly ? t('emptyUnread') : t('empty')}</p>
        <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.filter(([, g]) => g.length).map(([label, g]) => (
        <section key={label} aria-label={label}>
          <h3 className="sticky top-0 z-10 bg-popover/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{label}</h3>
          <ul>
            {g.map((n) => {
              const r = render(n);
              const Icon = r.icon;
              const color = severityColor[r.severity];
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => { if (!n.readAt) markRead.mutate(n.id); onNavigate(); router.push(r.url as '/'); }}
                    className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60', !n.readAt && 'bg-primary/[0.06]')}>
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}><Icon className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm leading-snug', !n.readAt ? 'font-semibold' : 'font-medium')}>{r.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{r.body}</span>
                      <span className="mt-1 block text-xs text-muted-foreground/80">{t(`categories.${r.category}`)} · <time dateTime={n.createdAt}>{ago(n.createdAt, locale)}</time></span>
                    </span>
                    {!n.readAt && <span aria-label={t('unread')} className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: 'hsl(var(--primary))' }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {hasNextPage && (
        <div className="flex justify-center p-3"><Button variant="ghost" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage && <Loader2 className="animate-spin" />}{t('loadMore')}</Button></div>
      )}
    </div>
  );
}

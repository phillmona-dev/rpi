'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { AtSign, BellRing, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { useLive } from '@/components/layout/live-indicator';
import { visibleConversations } from '@/components/messaging/util';
import { useChatUnread } from '@/lib/api/messaging';
import { useNotificationUnread } from '@/lib/api/notifications';
import type { ChatMessage, ConversationSummary, NotificationSeverity } from '@/lib/api/types';
import { getPrefs, type NotifyCategory } from '@/lib/notify/prefs';
import { playTone, unlockAudio, type ToneKind } from '@/lib/notify/sound';
import { desktopState, registerNotificationWorker, requestDesktopPermission, showDesktop } from '@/lib/notify/desktop';
import { useRenderNotification } from './render';
import { Toaster, toast, type ToastItem } from './toaster';

interface Presentable extends Omit<ToastItem, 'url'> { url: string; category: NotifyCategory; tone: ToneKind; tag: string }

/** Remote events → the right channel: an in-app toast while RPIS is in front, a system notification while it is not, plus a tone. */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('notifications');
  const live = useLive();
  const qc = useQueryClient();
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const render = useRenderNotification();
  const [ring, setRing] = React.useState(0);
  const { data: nUnread } = useNotificationUnread();
  const { data: cUnread } = useChatUnread();

  const navigate = React.useCallback((url: string) => router.push(url as '/'), [router]);

  const present = React.useCallback((p: Presentable) => {
    const prefs = getPrefs();
    if (!prefs.categories[p.category]) return;
    const foreground = document.visibilityState === 'visible' && document.hasFocus();
    const wantDesktop = prefs.desktop && desktopState() === 'granted' && (!foreground || !prefs.desktopOnlyInBackground);
    if (foreground) toast.push({ ...p });
    playTone(p.tone);
    setRing((r) => r + 1);
    if (wantDesktop) {
      showDesktop({ title: p.title, body: p.body ?? '', url: p.url, tag: p.tag, urgent: p.severity === 'CRITICAL' }, navigate).then((shown) => {
        if (!shown && !foreground) toast.push({ ...p });
      });
    } else if (!foreground) {
      toast.push({ ...p });   // waiting for them when they come back
    }
  }, [navigate]);

  // Personal notifications from the server.
  React.useEffect(() => live?.onNotificationFrame((f) => {
    if (f.type !== 'NEW' || !f.notification) return;
    const r = render(f.notification);
    present({
      key: `n-${f.notification.id}`, tag: `rpis-n-${f.notification.id}`, title: r.title, body: r.body, icon: r.icon, severity: r.severity,
      url: r.url, category: r.category, tone: r.tone, meta: t(`categories.${r.category}`),
    });
  }), [live, render, present, t]);

  // Chat messages (mentions arrive as notifications above, so they are not announced twice).
  React.useEffect(() => live?.onChatFrame((f) => {
    if (f.type !== 'MESSAGE') return;
    const m = f.payload as ChatMessage;
    if (m.kind !== 'TEXT' || m.senderId === user.id) return;
    if (m.mentions.some((x) => x.id === user.id)) return;
    if (visibleConversations.has(m.conversationId) && document.visibilityState === 'visible' && document.hasFocus()) return;
    const conv = qc.getQueriesData<ConversationSummary[]>({ queryKey: ['chatConversations'] }).flatMap(([, d]) => d ?? []).find((c) => c.id === m.conversationId);
    if (conv?.muted) return;
    const where = conv && conv.kind !== 'DIRECT' ? conv.title : null;
    present({
      key: `chat-${m.conversationId}`, tag: `rpis-chat-${m.conversationId}`, category: 'messages', tone: 'message', severity: 'INFO' as NotificationSeverity,
      title: where ? t('chat.inConversation', { name: m.senderName ?? t('someone'), conversation: where }) : m.senderName ?? t('someone'),
      body: m.body ? m.body.replace(/\s+/g, ' ').slice(0, 180) : t('chat.attachment'),
      icon: where ? AtSign : MessageCircle, url: `/messages?c=${m.conversationId}`, meta: t('categories.messages'),
    });
  }), [live, qc, user.id, present, t]);

  // Audio needs one user gesture; system notification clicks come back from the service worker.
  React.useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    if (desktopState() === 'granted') registerNotificationWorker();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'rpis:navigate') return;
      const u = new URL(e.data.url as string, window.location.origin);
      const path = u.pathname.replace(/^\/(en|am|ti)(?=\/|$)/, '') || '/';
      navigate(path + u.search);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [navigate]);

  // Unread count in the tab title, so it shows in the tab strip and taskbar.
  const total = (nUnread?.unread ?? 0) + (cUnread?.total ?? 0);
  React.useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
      const next = total ? `(${total > 99 ? '99+' : total}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const h = setTimeout(apply, 400);   // after the route's own title update
    return () => clearTimeout(h);
  }, [total, pathname]);

  return (
    <BellContext.Provider value={ring}>
      {children}
      <Toaster />
      <PermissionPrompt />
    </BellContext.Provider>
  );
}

/** Increments on every presented notification; the bell uses it to animate. */
export const BellContext = React.createContext(0);

const PROMPT_KEY = 'rpis.notify.promptDismissedAt';

/** One-time, polite offer to turn on system notifications (browsers require the click to come from the user). */
function PermissionPrompt() {
  const t = useTranslations('notifications');
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    let dismissed = 0;
    try { dismissed = Number(localStorage.getItem(PROMPT_KEY) ?? 0); } catch { /* ignore */ }
    if (desktopState() !== 'default' || !getPrefs().desktop || Date.now() - dismissed < 7 * 86_400_000) return;
    const h = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(h);
  }, []);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch { /* ignore */ } };
  const enable = async () => {
    unlockAudio();
    const s = await requestDesktopPermission();
    setShow(false);
    if (s === 'granted') {
      playTone('success', { force: true });
      showDesktop({ title: t('prompt.enabledTitle'), body: t('prompt.enabledBody'), url: '/', tag: 'rpis-enabled' }, () => undefined);
    } else close();
  };
  return (
    <div role="dialog" aria-labelledby="notify-prompt-title" className="toast-enter no-print fixed bottom-4 left-4 z-[60] w-[min(23rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="notify-prompt-title" className="text-sm font-semibold">{t('prompt.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('prompt.body')}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={enable}>{t('prompt.enable')}</Button>
            <Button size="sm" variant="ghost" onClick={close}>{t('prompt.later')}</Button>
          </div>
        </div>
        <button type="button" onClick={close} aria-label={t('dismiss')} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

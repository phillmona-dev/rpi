'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X, type LucideIcon } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import type { NotificationSeverity } from '@/lib/api/types';
import { severityColor } from './render';

export interface ToastItem {
  /** Same key replaces the earlier toast (e.g. several messages in one conversation). */
  key: string;
  title: string;
  body?: string;
  icon: LucideIcon;
  severity: NotificationSeverity;
  url?: string;
  /** Small context line, e.g. "Approvals · just now". */
  meta?: string;
  onOpen?: () => void;
}

const MAX = 4;
const DURATION_MS = 7000;

// Tiny global store so any part of the app can raise a toast without prop drilling.
let items: (ToastItem & { id: number })[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
  push(t: ToastItem) {
    items = [...items.filter((x) => x.key !== t.key), { ...t, id: ++seq }].slice(-MAX);
    emit();
  },
  dismiss(id: number) { items = items.filter((x) => x.id !== id); emit(); },
  clear() { items = []; emit(); },
};

function useToasts() {
  return React.useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => items, () => items);
}

export function Toaster() {
  const list = useToasts();
  const t = useTranslations('notifications');
  return (
    <section aria-label={t('toastRegion')} className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2.5">
      {list.map((x) => <Toast key={x.id} item={x} />)}
    </section>
  );
}

function Toast({ item }: { item: ToastItem & { id: number } }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const Icon = item.icon;
  const color = severityColor[item.severity];
  const persistent = item.severity === 'CRITICAL';
  const open = () => {
    toast.dismiss(item.id);
    item.onOpen?.();
    if (item.url) router.push(item.url as '/');
  };
  return (
    <div
      role={persistent ? 'alert' : 'status'}
      aria-live={persistent ? 'assertive' : 'polite'}
      className="toast-enter group pointer-events-auto relative overflow-hidden rounded-xl border bg-card/95 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur supports-[backdrop-filter]:bg-card/85"
      onKeyDown={(e) => { if (e.key === 'Escape') toast.dismiss(item.id); }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex items-start gap-3 py-3 pl-4 pr-2.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <button type="button" onClick={open} className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block text-sm font-semibold leading-snug">{item.title}</span>
          {item.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.body}</span>}
          {item.meta && <span className="mt-1 block text-xs text-muted-foreground/80">{item.meta}</span>}
        </button>
        <button type="button" onClick={() => toast.dismiss(item.id)} aria-label={t('dismiss')}
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100 focus-visible:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {item.url && (
        <div className="flex justify-end gap-1 px-3 pb-2.5 -mt-1">
          <button type="button" onClick={open} className="rounded-md px-2.5 py-1 text-sm font-medium hover:bg-muted" style={{ color }}>{t('open')}</button>
        </div>
      )}
      {!persistent && (
        <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-full origin-left opacity-60 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
          style={{ background: color, animation: `toast-progress ${DURATION_MS}ms linear forwards` }}
          onAnimationEnd={() => toast.dismiss(item.id)} />
      )}
    </div>
  );
}


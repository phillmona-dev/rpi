'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type * as T from './types';

export const notificationKeys = {
  list: (unreadOnly: boolean) => ['notifications', unreadOnly] as const,
  unread: ['notificationUnread'] as const,
};

export const useNotificationUnread = () => useQuery({ queryKey: notificationKeys.unread, queryFn: () => api<{ unread: number }>('notifications/unread'), staleTime: 30_000, refetchInterval: 180_000 });

export const useNotifications = (unreadOnly: boolean, enabled = true) => useInfiniteQuery({
  queryKey: notificationKeys.list(unreadOnly),
  queryFn: ({ pageParam }) => api<T.NotificationPage>('notifications', { query: { unreadOnly, before: pageParam ?? undefined, limit: 20 } }),
  initialPageParam: null as number | null,
  getNextPageParam: (last) => (last.hasMore && last.items.length ? last.items[last.items.length - 1].id : undefined),
  staleTime: 30_000,
  enabled,
});

type Pages = InfiniteData<T.NotificationPage, unknown>;

/** Applies a live frame from /user/queue/notifications to the caches. */
export function applyNotificationFrame(qc: QueryClient, f: T.NotificationFrame) {
  qc.setQueryData(notificationKeys.unread, { unread: f.unread });
  if (f.type === 'NEW' && f.notification) {
    const n = f.notification;
    for (const unreadOnly of [false, true]) {
      qc.setQueryData<Pages>(notificationKeys.list(unreadOnly), (old) => {
        if (!old || old.pages[0]?.items.some((x) => x.id === n.id)) return old;
        const [first, ...rest] = old.pages;
        return { ...old, pages: [{ ...first, items: [n, ...first.items], unread: f.unread }, ...rest] };
      });
    }
  } else {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }
}

function markLocally(qc: QueryClient, id: number | 'all') {
  const now = new Date().toISOString();
  qc.setQueriesData<Pages>({ queryKey: ['notifications'] }, (old) => old && ({
    ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((x) => (id === 'all' || x.id === id) && !x.readAt ? { ...x, readAt: now } : x) })),
  }));
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ unread: number }>(`notifications/${id}/read`, { method: 'POST' }),
    onMutate: (id) => markLocally(qc, id),
    onSuccess: (r) => qc.setQueryData(notificationKeys.unread, r),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ unread: number }>('notifications/read-all', { method: 'POST' }),
    onMutate: () => markLocally(qc, 'all'),
    onSuccess: (r) => { qc.setQueryData(notificationKeys.unread, r); qc.invalidateQueries({ queryKey: notificationKeys.list(true) }); },
  });
}

'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type * as T from './types';

/** Messaging data layer. Live frames (see applyChatFrame) write into these caches so threads update without refetching. */
export const chatKeys = {
  conversations: (q?: string) => ['chatConversations', q ?? ''] as const,
  unread: ['chatUnread'] as const,
  conversation: (id: number) => ['chatConversation', id] as const,
  messages: (id: number) => ['chatMessages', id] as const,
  people: (q?: string) => ['chatPeople', q ?? ''] as const,
  search: (q: string) => ['chatSearch', q] as const,
};

export const useConversations = (q?: string) => useQuery({ queryKey: chatKeys.conversations(q), queryFn: () => api<T.ConversationSummary[]>('messaging/conversations', { query: { q } }), staleTime: 15_000 });
export const useChatUnread = () => useQuery({ queryKey: chatKeys.unread, queryFn: () => api<T.ChatUnread>('messaging/unread'), staleTime: 15_000, refetchInterval: 120_000 });
export const useConversation = (id: number | null) => useQuery({ queryKey: chatKeys.conversation(id ?? -1), queryFn: () => api<T.ConversationDetail>(`messaging/conversations/${id}`), staleTime: 30_000, enabled: id !== null });
export const useChatPeople = (q?: string, enabled = true) => useQuery({ queryKey: chatKeys.people(q), queryFn: () => api<T.ChatPerson[]>('messaging/people', { query: { q } }), staleTime: 60_000, enabled });
export const useChatSearch = (q: string) => useQuery({ queryKey: chatKeys.search(q), queryFn: () => api<T.ChatSearchHit[]>('messaging/search', { query: { q } }), staleTime: 10_000, enabled: q.trim().length >= 2 });

type Pages = InfiniteData<T.MessagePage, number | null>;

/** Newest page first; fetchNextPage loads older history. */
export const useMessages = (id: number | null) => useInfiniteQuery({
  queryKey: chatKeys.messages(id ?? -1),
  queryFn: ({ pageParam }) => api<T.MessagePage>(`messaging/conversations/${id}/messages`, { query: { before: pageParam ?? undefined, limit: 50 } }),
  initialPageParam: null as number | null,
  getNextPageParam: (last) => (last.hasMore && last.items.length ? last.items[0].id : undefined),
  staleTime: 60_000,
  enabled: id !== null,
});

/** All loaded messages, oldest first. */
export const flattenMessages = (data: InfiniteData<T.MessagePage, unknown> | undefined): T.ChatMessage[] => (data ? [...data.pages].reverse().flatMap((p) => p.items) : []);

export function upsertMessage(qc: QueryClient, m: T.ChatMessage) {
  qc.setQueryData<Pages>(chatKeys.messages(m.conversationId), (old) => {
    if (!old) return old;
    let found = false;
    const pages = old.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === m.id ? ((found = true), m) : x)) }));
    if (!found) {
      const first = pages[0];
      pages[0] = { ...first, items: [...first.items, m].sort((a, b) => a.id - b.id) };
    }
    return { ...old, pages };
  });
}

/** Applies one live frame from /user/queue/chat to the caches. */
export function applyChatFrame(qc: QueryClient, f: T.ChatFrame) {
  switch (f.type) {
    case 'MESSAGE':
    case 'MESSAGE_UPDATED':
      upsertMessage(qc, f.payload as T.ChatMessage);
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
      qc.invalidateQueries({ queryKey: chatKeys.unread });
      if ((f.payload as T.ChatMessage).kind === 'SYSTEM') qc.invalidateQueries({ queryKey: chatKeys.conversation(f.conversationId) });
      break;
    case 'READ': {
      const { userId, lastReadMessageId } = f.payload as { userId: number; lastReadMessageId: number };
      qc.setQueryData<T.ConversationDetail>(chatKeys.conversation(f.conversationId), (old) => old && ({
        ...old,
        members: old.members.map((m) => (m.person.id === userId ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, lastReadMessageId) } : m)),
      }));
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
      qc.invalidateQueries({ queryKey: chatKeys.unread });
      break;
    }
    case 'CONVERSATION':
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
      qc.invalidateQueries({ queryKey: chatKeys.unread });
      qc.invalidateQueries({ queryKey: chatKeys.conversation(f.conversationId) });
      break;
    default:
      break;
  }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

function useConversationMutation<V>(fn: (v: V) => Promise<T.ConversationDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      qc.setQueryData(chatKeys.conversation(d.id), d);
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
      qc.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export const useOpenDirect = () => useConversationMutation((userId: number) => api<T.ConversationDetail>('messaging/conversations/direct', json({ userId })));
export const useCreateGroup = () => useConversationMutation((b: { title: string; memberIds: number[] }) => api<T.ConversationDetail>('messaging/conversations/group', json(b)));
export const useOpenContext = () => useConversationMutation((b: { type: T.ChatContextType; id: number }) => api<T.ConversationDetail>('messaging/conversations/context', json(b)));
export const useFollow = (id: number) => useConversationMutation((follow: boolean) => api<T.ConversationDetail>(`messaging/conversations/${id}/follow`, { method: follow ? 'PUT' : 'DELETE' }));
export const useConversationSettings = (id: number) => useConversationMutation((b: { muted?: boolean; title?: string }) => api<T.ConversationDetail>(`messaging/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(b) }));
export const useAddMembers = (id: number) => useConversationMutation((userIds: number[]) => api<T.ConversationDetail>(`messaging/conversations/${id}/members`, json({ userIds })));

export function useRemoveMember(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api<void>(`messaging/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => ['chatConversations', 'chatUnread', 'chatConversation'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useSendMessage(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { body: string; replyToId?: number; attachmentIds?: number[] }) => api<T.ChatMessage>(`messaging/conversations/${id}/messages`, json(b)),
    onSuccess: (m) => {
      upsertMessage(qc, m);
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
      qc.invalidateQueries({ queryKey: chatKeys.conversation(id) });
    },
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: number; body: string }) => api<T.ChatMessage>(`messaging/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }), onSuccess: (m) => upsertMessage(qc, m) });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => api<T.ChatMessage>(`messaging/messages/${id}`, { method: 'DELETE' }), onSuccess: (m) => { upsertMessage(qc, m); qc.invalidateQueries({ queryKey: ['chatConversations'] }); } });
}

export function useMarkRead(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => api<void>(`messaging/conversations/${id}/read`, json({ messageId })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatConversations'] }); qc.invalidateQueries({ queryKey: chatKeys.unread }); },
  });
}

export const attachmentUrl = (id: number) => `/api/proxy/messaging/attachments/${id}`;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Uploads raw bytes (the proxy forwards them untouched) and returns the attachment to send with the next message. */
export async function uploadAttachment(file: File): Promise<T.ChatAttachment> {
  const res = await fetch(`/api/proxy/messaging/attachments?name=${encodeURIComponent(file.name)}`, {
    method: 'POST', body: file, credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'application/octet-stream', Accept: 'application/json' },
  });
  if (!res.ok) {
    let b: Record<string, unknown> = {};
    try { b = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(res.status, String(b.title ?? res.statusText), String(b.detail ?? ''), undefined, b.code as string | undefined);
  }
  return (await res.json()) as T.ChatAttachment;
}

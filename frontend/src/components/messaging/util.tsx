'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Bell, Stamp, UserRound, Users, MessageCircle, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { ChatContextType, ChatMessage, ChatPerson, ConversationKind } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export const initials = (name: string | null | undefined) =>
  (name ?? '?').split(/\s+/).filter((p) => p && !p.startsWith('(')).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

export const contextIcon: Record<ChatContextType, LucideIcon> = { PROJECT: Briefcase, APPROVAL: Stamp, ALERT: Bell, FIELD_AGENT: UserRound };
export const kindIcon = (kind: ConversationKind, ctx?: ChatContextType | null): LucideIcon =>
  kind === 'GROUP' ? Users : kind === 'CONTEXT' && ctx ? contextIcon[ctx] : MessageCircle;

/** Where the record a discussion belongs to lives in the app. */
export const contextHref = (type: ChatContextType, id: number) =>
  type === 'PROJECT' ? `/projects/${id}` : type === 'APPROVAL' ? `/approvals/${id}` : type === 'ALERT' ? `/alerts?id=${id}` : `/field-team/${id}`;

export function PersonAvatar({ person, name, size = 'md', className }: { person?: Pick<ChatPerson, 'fullName' | 'online'> | null; name?: string | null; size?: 'sm' | 'md'; className?: string }) {
  const label = person?.fullName ?? name ?? '?';
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <Avatar className={size === 'sm' ? 'h-7 w-7 text-2xs' : 'h-9 w-9 text-xs'}><AvatarFallback>{initials(label)}</AvatarFallback></Avatar>
      {person?.online && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card" style={{ background: 'var(--status-good)' }} />}
    </span>
  );
}

/** Renders the event code of a SYSTEM message in the reader's language. */
export function useSystemText() {
  const t = useTranslations('messaging.system');
  return (m: Pick<ChatMessage, 'body' | 'meta'>) => {
    const meta = m.meta ?? {};
    const names = Array.isArray(meta.names) ? (meta.names as string[]).join(', ') : '';
    const params = { actor: String(meta.actor ?? ''), title: String(meta.title ?? ''), name: String(meta.name ?? ''), names, reference: String(meta.reference ?? '') };
    const known = ['GROUP_CREATED', 'MEMBERS_ADDED', 'MEMBER_LEFT', 'MEMBER_REMOVED', 'RENAMED', 'APPROVAL_APPROVED', 'APPROVAL_RETURNED', 'APPROVAL_REJECTED', 'APPROVAL_RESUBMITTED'];
    return known.includes(m.body ?? '') ? t(m.body as 'GROUP_CREATED', params) : (m.body ?? '');
  };
}

/** Conversations currently on screen; new-message toasts are suppressed for these. */
export const visibleConversations = new Set<number>();
export function useVisibleConversation(id: number | null) {
  React.useEffect(() => {
    if (id === null) return;
    visibleConversations.add(id);
    return () => { visibleConversations.delete(id); };
  }, [id]);
}

export function bytesLabel(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

'use client';
import { useTranslations } from 'next-intl';
import { AtSign, BadgeCheck, Bell, ClipboardList, FileWarning, MessageCircle, ShieldAlert, Siren, Stamp, Undo2, XOctagon, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationSeverity } from '@/lib/api/types';
import type { NotifyCategory } from '@/lib/notify/prefs';
import type { ToneKind } from '@/lib/notify/sound';

export interface Rendered { title: string; body: string; icon: LucideIcon; category: NotifyCategory; tone: ToneKind; severity: NotificationSeverity; url: string }

const ICONS: Record<string, LucideIcon> = {
  APPROVAL_REQUESTED: Stamp, APPROVAL_RESUBMITTED: Stamp, APPROVAL_APPROVED: BadgeCheck, APPROVAL_RETURNED: Undo2, APPROVAL_REJECTED: XOctagon,
  ALERT_CRITICAL: Siren, ALERT_ASSIGNED: ShieldAlert, ASSIGNMENT_NEW: ClipboardList,
  INSPECTION_VERIFIED: BadgeCheck, INSPECTION_DISPUTED: FileWarning, INSPECTION_REJECTED: XOctagon, INSPECTION_UNVERIFIED: FileWarning,
  CHAT_MENTION: AtSign, CHAT_MESSAGE: MessageCircle,
};

export const categoryOf = (type: string): NotifyCategory =>
  type.startsWith('APPROVAL_') ? 'approvals' : type.startsWith('ALERT_') ? 'alerts' : type.startsWith('ASSIGNMENT_') ? 'assignments'
    : type.startsWith('INSPECTION_') ? 'inspections' : type === 'CHAT_MENTION' ? 'mentions' : 'messages';

export const toneOf = (severity: NotificationSeverity, category: NotifyCategory): ToneKind =>
  severity === 'CRITICAL' ? 'critical' : severity === 'WARNING' ? 'warning' : severity === 'SUCCESS' ? 'success' : category === 'messages' ? 'message' : 'info';

export const severityColor: Record<NotificationSeverity, string> = {
  INFO: 'hsl(var(--primary))', SUCCESS: 'var(--status-good)', WARNING: 'var(--status-warning)', CRITICAL: 'var(--status-critical)',
};

/** Renders a stored notification (type + parameters) in the reader's language. */
export function useRenderNotification() {
  const t = useTranslations('notifications.types');
  const tr = useTranslations('enums.assignmentRole');
  return (n: AppNotification): Rendered => {
    const d = n.data ?? {};
    const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]));
    const role = s('role') ? safe(() => tr(s('role') as 'LEAD'), s('role')) : '';
    const params = {
      actor: n.actorName ?? t('someone'), code: s('code'), name: s('name'), title: s('title'), reference: s('reference'), role,
      subject: s('subject') || t('aSite'), conversation: s('conversation'), excerpt: s('excerpt'), wereda: s('wereda'),
    };
    const known = Object.prototype.hasOwnProperty.call(ICONS, n.type);
    const title = known ? t(`${n.type}.title` as 'ASSIGNMENT_NEW.title', params) : n.type;
    const body = known ? t(`${n.type}.body` as 'ASSIGNMENT_NEW.body', params) : '';
    const category = categoryOf(n.type);
    return { title, body, icon: ICONS[n.type] ?? Bell, category, tone: toneOf(n.severity, category), severity: n.severity, url: n.link ?? '/' };
  };
}

function safe(f: () => string, fallback: string) { try { return f(); } catch { return fallback; } }

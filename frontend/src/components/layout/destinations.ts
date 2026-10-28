import {
  Building2, Camera, ClipboardCheck, FileBarChart2, FileText, FolderKanban, Globe2, LayoutDashboard, Layers, Map,
  MessagesSquare, ScrollText, ShieldAlert, Stamp, Target, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { canAdmin, canSeeApprovals, canSeeAudit, canSeeBrief, canSeeDamage, canSeeFieldTeam, canSeeFinance, canSeeIntelligence, canSeeReports, isFieldTeam } from '@/lib/domain';

/** The three groups a person scans: things to act on, things to follow, records and administration. */
export type DestinationGroup = 'work' | 'follow' | 'records';
export const DESTINATION_GROUPS: DestinationGroup[] = ['work', 'follow', 'records'];

export interface Destination {
  href: string;
  /** nav.* key for the name; home.desc.* key for the one-line description */
  key: string;
  icon: LucideIcon;
  group: DestinationGroup;
}

/** Every section of the app this person may open, in the order they are most likely to need them. */
export function destinationsFor(roles: string[]): Destination[] {
  const field = isFieldTeam(roles) && !canSeeDamage(roles);
  const all: (Destination | false)[] = [
    canSeeApprovals(roles) && { href: '/approvals', key: 'approvals', icon: Stamp, group: 'work' },
    (canSeeDamage(roles) || isFieldTeam(roles)) && { href: field ? '/damage/my-tasks' : '/damage', key: field ? 'mySites' : 'damage', icon: ClipboardCheck, group: 'work' },
    { href: '/alerts', key: 'alerts', icon: ShieldAlert, group: 'work' },
    canSeeFieldTeam(roles) && { href: '/field-team', key: 'fieldTeam', icon: UsersRound, group: 'work' },
    { href: '/messages', key: 'messages', icon: MessagesSquare, group: 'work' },

    { href: '/dashboard', key: 'commandCenter', icon: LayoutDashboard, group: 'follow' },
    { href: '/projects', key: 'projects', icon: FolderKanban, group: 'follow' },
    { href: '/map', key: 'map', icon: Globe2, group: 'follow' },
    canSeeIntelligence(roles) && { href: '/intelligence', key: 'intelligence', icon: Target, group: 'follow' },
    canSeeFinance(roles) && { href: '/finance', key: 'finance', icon: Wallet, group: 'follow' },
    { href: '/facilities', key: 'facilities', icon: Building2, group: 'follow' },
    { href: '/evidence', key: 'evidence', icon: Camera, group: 'follow' },
    { href: '/sectors', key: 'sectors', icon: Layers, group: 'follow' },
    { href: '/geography', key: 'geography', icon: Map, group: 'follow' },

    canSeeBrief(roles) && { href: '/briefing', key: 'briefing', icon: FileText, group: 'records' },
    canSeeReports(roles) && { href: '/reports', key: 'reports', icon: FileBarChart2, group: 'records' },
    canAdmin(roles) && { href: '/admin/users', key: 'users', icon: Users, group: 'records' },
    canSeeAudit(roles) && { href: '/admin/audit', key: 'audit', icon: ScrollText, group: 'records' },
  ];
  return all.filter(Boolean) as Destination[];
}

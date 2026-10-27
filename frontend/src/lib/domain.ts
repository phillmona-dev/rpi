import type { AgentStatus, ApprovalStatus, AssignmentStatus, CoverageGap, AlertSeverity, DamageSeverity, LifecycleStage, OperationalStatus, ProjectHealth, ProjectStatus, RiskBand, Sector, VerificationStatus } from './api/types';

/** Semantic mapping of domain states to the reserved status palette. Always paired with a label/icon in UI. */
export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'info';

export const healthTone: Record<ProjectHealth, Tone> = { ON_TRACK: 'good', AT_RISK: 'warning', DELAYED: 'serious', STALLED: 'critical', COMPLETED: 'info', NOT_STARTED: 'neutral' };
export const statusTone: Record<ProjectStatus, Tone> = { PLANNED: 'neutral', PROCUREMENT: 'neutral', ACTIVE: 'info', SUSPENDED: 'critical', COMPLETED: 'good', CANCELLED: 'neutral' };
export const severityTone: Record<DamageSeverity, Tone> = { NONE: 'good', MINOR: 'neutral', MODERATE: 'warning', SEVERE: 'serious', DESTROYED: 'critical' };
export const alertTone: Record<AlertSeverity, Tone> = { CRITICAL: 'critical', HIGH: 'serious', MEDIUM: 'warning', LOW: 'neutral' };
export const operationalTone: Record<OperationalStatus, Tone> = { NON_FUNCTIONAL: 'critical', PARTIALLY_FUNCTIONAL: 'warning', FUNCTIONAL: 'good' };
export const verificationTone: Record<VerificationStatus, Tone> = { UNVERIFIED: 'neutral', VERIFIED: 'good', DISPUTED: 'serious', REJECTED: 'critical' };
export const riskBandTone: Record<RiskBand, Tone> = { LOW: 'good', MODERATE: 'warning', HIGH: 'serious', CRITICAL: 'critical' };
export const stageTone: Record<LifecycleStage, Tone> = { PLANNING: 'neutral', APPROVAL: 'neutral', FUNDING: 'info', PROCUREMENT: 'info', IMPLEMENTATION: 'info', MONITORING: 'warning', COMPLETION: 'good', CANCELLED: 'critical' };
export const approvalTone: Record<ApprovalStatus, Tone> = { PENDING: 'warning', RETURNED: 'serious', APPROVED: 'good', REJECTED: 'critical' };
export const agentStatusTone: Record<AgentStatus, Tone> = { PENDING_ONBOARDING: 'warning', ACTIVE: 'good', ON_LEAVE: 'info', SUSPENDED: 'critical', DEACTIVATED: 'neutral' };
export const assignmentStatusTone: Record<AssignmentStatus, Tone> = { ACTIVE: 'info', COMPLETED: 'good', RELEASED: 'neutral' };
export const coverageGapTone: Record<CoverageGap, Tone> = { NO_TEAM: 'critical', NO_LEAD: 'serious', OVERDUE: 'warning', NO_VERIFIER: 'warning', NOT_STARTED: 'neutral', OK: 'good' };
export const riskBand = (score: number | null | undefined): RiskBand | null => score === null || score === undefined ? null : score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MODERATE' : 'LOW';

export const toneVar: Record<Tone, string> = {
  good: 'var(--status-good)', warning: 'var(--status-warning)', serious: 'var(--status-serious)', critical: 'var(--status-critical)', neutral: 'var(--status-neutral)', info: 'var(--seq-450)',
};

export const sectorVar: Record<Sector, string> = {
  EDUCATION: 'var(--sector-education)', HEALTH: 'var(--sector-health)', MANUFACTURING: 'var(--sector-manufacturing)', AGRICULTURE: 'var(--sector-agriculture)',
};
export const sectorSlug: Record<Sector, string> = { EDUCATION: 'education', HEALTH: 'health', MANUFACTURING: 'manufacturing', AGRICULTURE: 'agriculture' };
export const slugSector: Record<string, Sector> = { education: 'EDUCATION', health: 'HEALTH', manufacturing: 'MANUFACTURING', agriculture: 'AGRICULTURE' };

export const ROLE = { EXECUTIVE: 'EXECUTIVE', SECTOR_HEAD: 'SECTOR_HEAD', ANALYST: 'ANALYST', PMO_FEDERAL: 'PMO_FEDERAL', FIELD_OFFICER: 'FIELD_OFFICER', SITE_MANAGER: 'SITE_MANAGER', ADMIN: 'ADMIN' } as const;
export const canActOnAlerts = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'SECTOR_HEAD', 'ANALYST', 'ADMIN'].includes(r));
export const canSeeFinance = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'ANALYST', 'PMO_FEDERAL', 'ADMIN', 'SECTOR_HEAD'].includes(r));
export const canSeeBrief = canSeeFinance;
/** Intelligence & risk analytics: oversight and decision roles; field/site roles use the sync API only. */
export const canSeeIntelligence = canSeeFinance;
export const canSeeAudit = (roles: string[]) => roles.some((r) => ['ADMIN', 'EXECUTIVE'].includes(r));
export const canAdmin = (roles: string[]) => roles.includes('ADMIN');
/** Registering projects is a data-entry duty: analysts and administrators. */
export const canCreateProject = (roles: string[]) => roles.some((r) => ['ANALYST', 'ADMIN'].includes(r));
export const canRecordProgress = (roles: string[]) => roles.some((r) => ['ANALYST', 'SITE_MANAGER', 'ADMIN'].includes(r));
export const canVerifyEvidence = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'SECTOR_HEAD', 'ANALYST', 'ADMIN'].includes(r));
export const canTransitionStage = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'SECTOR_HEAD', 'ANALYST', 'ADMIN'].includes(r));
export const canReviewInsights = canVerifyEvidence;
export const canExportReports = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'SECTOR_HEAD', 'ANALYST', 'ADMIN'].includes(r));
/** Executive approval gate: only the Chief Executive decides; registrars and oversight roles can follow the queue. */
export const canDecideApprovals = (roles: string[]) => roles.includes('EXECUTIVE');
export const canSeeApprovals = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'SECTOR_HEAD', 'ANALYST', 'ADMIN'].includes(r));
export const canResubmitProjects = canCreateProject;
/** Field team: oversight roles read; analysts and administrators register members and assign projects. */
export const canSeeFieldTeam = canSeeApprovals;
export const canManageFieldTeam = (roles: string[]) => roles.some((r) => ['ANALYST', 'ADMIN'].includes(r));
export const canSeeReports = (roles: string[]) => roles.some((r) => ['EXECUTIVE', 'ANALYST', 'PMO_FEDERAL', 'ADMIN', 'SECTOR_HEAD'].includes(r));

/** Media URLs: API-relative paths go through the BFF proxy (cookie auth); static demo assets and absolute URLs pass through. */
export const mediaSrc = (url: string | null | undefined) => !url ? '' : url.startsWith('/api/v1/') ? `/api/proxy/${url.slice('/api/v1/'.length)}` : url;

/** Freshness thresholds (days) used for the stale-data chip. */
export const STALE_WARN_DAYS = 7;
export const STALE_CRITICAL_DAYS = 21;

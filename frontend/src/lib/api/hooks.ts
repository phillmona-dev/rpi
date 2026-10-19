'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type * as T from './types';

export const STALE = 30_000;

export interface Scope { sector?: T.Sector | null; zoneId?: number | null; weredaId?: number | null }
const scopeQ = (s?: Scope) => ({ sector: s?.sector ?? undefined, zoneId: s?.zoneId ?? undefined, weredaId: s?.weredaId ?? undefined });

export const qk = {
  session: ['session'] as const,
  overview: (s?: Scope) => ['overview', scopeQ(s)] as const,
  stream: (s?: Scope, limit?: number) => ['stream', scopeQ(s), limit] as const,
  zones: ['zones'] as const,
  weredas: ['weredas'] as const,
  weredaMetrics: (s?: Scope) => ['weredaMetrics', scopeQ(s)] as const,
  wereda: (id: number) => ['wereda', id] as const,
  geojson: (s?: Scope) => ['geojson', scopeQ(s)] as const,
  projects: (p: Record<string, unknown>) => ['projects', p] as const,
  project: (id: number) => ['project', id] as const,
  facilities: (p: Record<string, unknown>) => ['facilities', p] as const,
  facility: (id: number) => ['facility', id] as const,
  assessments: (p: Record<string, unknown>) => ['assessments', p] as const,
  alerts: (p: Record<string, unknown>) => ['alerts', p] as const,
  alert: (id: number) => ['alert', id] as const,
  alertCounts: (sector?: T.Sector | null) => ['alertCounts', sector ?? null] as const,
  finance: (s?: Scope) => ['finance', scopeQ(s)] as const,
  brief: (sector?: T.Sector | null) => ['brief', sector ?? null] as const,
  search: (q: string) => ['search', q] as const,
  users: (p: Record<string, unknown>) => ['users', p] as const,
  audit: (p: Record<string, unknown>) => ['audit', p] as const,
  timeline: (id: number) => ['timeline', id] as const,
  inspections: (p: Record<string, unknown>) => ['inspections', p] as const,
  inspection: (id: number) => ['inspection', id] as const,
  media: (p: Record<string, unknown>) => ['media', p] as const,
  evidenceSummary: (p: Record<string, unknown>) => ['evidenceSummary', p] as const,
  intelligence: (id: number) => ['intelligence', id] as const,
  insights: (p: Record<string, unknown>) => ['insights', p] as const,
  briefing: (s?: Scope) => ['briefing', scopeQ(s)] as const,
  report: (p: Record<string, unknown>) => ['report', p] as const,
  reportCatalog: ['reportCatalog'] as const,
  reportRuns: ['reportRuns'] as const,
  geoProjects: (p: Record<string, unknown>) => ['geoProjects', p] as const,
  geoFacilities: (p: Record<string, unknown>) => ['geoFacilities', p] as const,
  geoEvidence: (p: Record<string, unknown>) => ['geoEvidence', p] as const,
  geoBoundaries: (p: Record<string, unknown>) => ['geoBoundaries', p] as const,
};

export const useSession = () => useQuery({ queryKey: qk.session, queryFn: () => fetch('/api/auth/session', { credentials: 'same-origin' }).then(async (r) => { if (!r.ok) throw new Error('unauthenticated'); return (await r.json()) as T.UserProfile; }), staleTime: 5 * 60_000, retry: false });
export const useOverview = (s?: Scope) => useQuery({ queryKey: qk.overview(s), queryFn: () => api<T.Overview>('dashboard/overview', { query: scopeQ(s) }), staleTime: STALE, placeholderData: keepPreviousData });
export const useStream = (s?: Scope, limit = 40) => useQuery({ queryKey: qk.stream(s, limit), queryFn: () => api<T.StreamItem[]>('dashboard/stream', { query: { ...scopeQ(s), limit } }), staleTime: STALE });
export const useZones = () => useQuery({ queryKey: qk.zones, queryFn: () => api<T.ZoneSummary[]>('geo/zones'), staleTime: 10 * 60_000 });
export const useWeredas = () => useQuery({ queryKey: qk.weredas, queryFn: () => api<T.WeredaRef[]>('geo/weredas'), staleTime: 10 * 60_000 });
export const useWeredaMetrics = (s?: Scope) => useQuery({ queryKey: qk.weredaMetrics(s), queryFn: () => api<T.WeredaMetrics[]>('geo/weredas/metrics', { query: scopeQ(s) }), staleTime: STALE });
export const useWereda = (id: number) => useQuery({ queryKey: qk.wereda(id), queryFn: () => api<T.WeredaDetail>(`geo/weredas/${id}`), staleTime: STALE, enabled: Number.isFinite(id) });
export const useProjects = (p: Record<string, unknown>) => useQuery({ queryKey: qk.projects(p), queryFn: () => api<T.PageResponse<T.ProjectSummary>>('projects', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useProject = (id: number) => useQuery({ queryKey: qk.project(id), queryFn: () => api<T.ProjectDetail>(`projects/${id}`), staleTime: STALE, enabled: Number.isFinite(id) });
export const useFacilities = (p: Record<string, unknown>) => useQuery({ queryKey: qk.facilities(p), queryFn: () => api<T.PageResponse<T.FacilitySummary>>('facilities', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useFacility = (id: number) => useQuery({ queryKey: qk.facility(id), queryFn: () => api<T.FacilityDetail>(`facilities/${id}`), staleTime: STALE, enabled: Number.isFinite(id) });
export const useAssessments = (p: Record<string, unknown>) => useQuery({ queryKey: qk.assessments(p), queryFn: () => api<T.PageResponse<T.AssessmentSummary>>('damage/assessments', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useAlerts = (p: Record<string, unknown>) => useQuery({ queryKey: qk.alerts(p), queryFn: () => api<T.PageResponse<T.AlertSummary>>('alerts', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useAlert = (id: number | null) => useQuery({ queryKey: qk.alert(id ?? 0), queryFn: () => api<T.AlertDetail>(`alerts/${id}`), enabled: id !== null, staleTime: 10_000 });
export const useAlertCounts = (sector?: T.Sector | null) => useQuery({ queryKey: qk.alertCounts(sector), queryFn: () => api<T.AlertCounts>('alerts/counts', { query: { sector: sector ?? undefined } }), staleTime: STALE });
export const useFinance = (s?: Scope) => useQuery({ queryKey: qk.finance(s), queryFn: () => api<T.FinanceOverview>('finance/overview', { query: { sector: s?.sector ?? undefined, zoneId: s?.zoneId ?? undefined } }), staleTime: STALE });
export const useBrief = (sector?: T.Sector | null) => useQuery({ queryKey: qk.brief(sector), queryFn: () => api<T.DailyBrief>('reports/daily-brief', { query: { sector: sector ?? undefined } }), staleTime: STALE });
export const useSearch = (q: string) => useQuery({ queryKey: qk.search(q), queryFn: () => api<T.SearchHit[]>('search', { query: { q } }), enabled: q.trim().length >= 2, staleTime: 60_000 });
export const useAssignableUsers = () => useQuery({ queryKey: ['assignable-users'], queryFn: () => api<{ id: number; fullName: string; title: string | null; roles: string[]; sectorScope: string | null }[]>('users/assignable'), staleTime: 5 * 60_000 });
export const useUsers = (p: Record<string, unknown>) => useQuery({ queryKey: qk.users(p), queryFn: () => api<T.PageResponse<T.UserSummary>>('admin/users', { query: p }), staleTime: STALE });
export const useAudit = (p: Record<string, unknown>) => useQuery({ queryKey: qk.audit(p), queryFn: () => api<T.PageResponse<T.AuditEntry>>('admin/audit', { query: p }), staleTime: 10_000, placeholderData: keepPreviousData });

// ── V3 · lifecycle, evidence, intelligence, reports, GIS ───────────────────
export const useProjectTimeline = (id: number) => useQuery({ queryKey: qk.timeline(id), queryFn: () => api<T.TimelineEvent[]>(`projects/${id}/timeline`), staleTime: STALE, enabled: Number.isFinite(id) });
export const useInspections = (p: Record<string, unknown>) => useQuery({ queryKey: qk.inspections(p), queryFn: () => api<T.PageResponse<T.InspectionSummary>>('evidence/inspections', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useInspection = (id: number | null) => useQuery({ queryKey: qk.inspection(id ?? 0), queryFn: () => api<T.InspectionDetail>(`evidence/inspections/${id}`), enabled: id !== null, staleTime: 10_000 });
export const useMedia = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: qk.media(p), queryFn: () => api<T.PageResponse<T.MediaDto>>('evidence/media', { query: p }), staleTime: STALE, placeholderData: keepPreviousData, enabled });
export const useEvidenceSummary = (p: { projectId?: number | null; facilityId?: number | null }) => useQuery({ queryKey: qk.evidenceSummary(p), queryFn: () => api<T.EvidenceSummary>('evidence/summary', { query: p }), staleTime: STALE, enabled: Boolean(p.projectId || p.facilityId) });
export const useProjectIntelligence = (id: number) => useQuery({ queryKey: qk.intelligence(id), queryFn: () => api<T.ProjectIntelligence>(`analytics/projects/${id}`), staleTime: STALE, enabled: Number.isFinite(id) });
export const useInsights = (p: Record<string, unknown>) => useQuery({ queryKey: qk.insights(p), queryFn: () => api<T.PageResponse<T.InsightDto>>('analytics/insights', { query: p }), staleTime: STALE, placeholderData: keepPreviousData });
export const useBriefing = (s?: Scope) => useQuery({ queryKey: qk.briefing(s), queryFn: () => api<T.Briefing>('intelligence/briefing', { query: { sector: s?.sector ?? undefined, zoneId: s?.zoneId ?? undefined } }), staleTime: STALE, placeholderData: keepPreviousData });
export const useReportCatalog = () => useQuery({ queryKey: qk.reportCatalog, queryFn: () => api<T.ReportCatalogEntry[]>('reports/catalog'), staleTime: 10 * 60_000 });
export const useReport = (type: T.ReportType | null, p: Record<string, unknown>) => useQuery({ queryKey: qk.report({ type, ...p }), queryFn: () => api<T.Report>(`reports/${type}`, { query: p }), staleTime: STALE, enabled: Boolean(type), placeholderData: keepPreviousData });
export const useReportRuns = () => useQuery({ queryKey: qk.reportRuns, queryFn: () => api<T.ReportRun[]>('reports/runs', { query: { size: 50 } }), staleTime: 10_000 });
export const useProjectsGeo = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: qk.geoProjects(p), queryFn: () => api<T.GeoCollection<T.ProjectFeatureProps>>('geo/projects.geojson', { query: p }), staleTime: STALE, enabled, placeholderData: keepPreviousData });
export const useFacilitiesGeo = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: qk.geoFacilities(p), queryFn: () => api<T.GeoCollection<T.FacilityFeatureProps>>('geo/facilities.geojson', { query: p }), staleTime: STALE, enabled, placeholderData: keepPreviousData });
export const useEvidenceGeo = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: qk.geoEvidence(p), queryFn: () => api<T.GeoCollection<T.EvidenceFeatureProps>>('geo/evidence.geojson', { query: p }), staleTime: STALE, enabled });
export const useBoundaries = (level: 'zone' | 'wereda', zoneId?: number | null) => useQuery({ queryKey: qk.geoBoundaries({ level, zoneId }), queryFn: () => api<T.GeoCollection>('geo/boundaries.geojson', { query: { level, zoneId: zoneId ?? undefined } }), staleTime: 10 * 60_000 });

export function useVerifyInspection(id: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: T.VerificationStatus; note?: string }) => api<T.InspectionDetail>(`evidence/inspections/${id}/verify`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inspections'] }); qc.invalidateQueries({ queryKey: ['inspection'] }); qc.invalidateQueries({ queryKey: ['media'] }); qc.invalidateQueries({ queryKey: ['evidenceSummary'] }); qc.invalidateQueries({ queryKey: ['project'] }); qc.invalidateQueries({ queryKey: ['timeline'] }); qc.invalidateQueries({ queryKey: ['briefing'] }); },
  });
}
export function useStageTransition(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { toStage: T.LifecycleStage; note?: string; reference?: string; effectiveOn?: string }) => api<T.ProjectSummary>(`projects/${projectId}/stage`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: qk.timeline(projectId) }); qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['overview'] }); },
  });
}
export function useReviewInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; status: T.InsightStatus; note?: string }) => api<T.InsightDto>(`analytics/insights/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insights'] }); qc.invalidateQueries({ queryKey: ['intelligence'] }); qc.invalidateQueries({ queryKey: ['briefing'] }); },
  });
}
export function useRecordReportRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: T.ReportType; period: T.ReportPeriod; title: string; scope: Record<string, unknown>; format: 'JSON' | 'CSV'; rowCount?: number }) => api<T.ReportRun>('reports/runs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reportRuns }),
  });
}

export function useAlertAction(id: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: T.AlertAction; note?: string; assigneeUserId?: number }) => api<T.AlertDetail>(`alerts/${id}/actions`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alert'] }); qc.invalidateQueries({ queryKey: ['alertCounts'] }); qc.invalidateQueries({ queryKey: ['overview'] }); },
  });
}

export function useRecordProgress(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { logDate: string; physicalProgressPct: number; workforceCount?: number; notes?: string }) => api<T.ProjectSummary>(`projects/${projectId}/progress`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['overview'] }); },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }), onSuccess: () => qc.clear() });
}

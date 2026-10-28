'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { STALE } from './hooks';
import type * as T from './types';

/** Damage assessment data layer: campaigns, team, sites, assessments and their review, and verified needs. */
export const damageKeys = {
  overview: (sector?: T.Sector | null) => ['damageOverview', sector ?? null] as const,
  campaigns: (p: Record<string, unknown>) => ['campaigns', p] as const,
  campaign: (id: number) => ['campaign', id] as const,
  tasks: (id: number, p: Record<string, unknown>) => ['campaignTasks', id, p] as const,
  task: (id: number) => ['assessmentTask', id] as const,
  myTasks: ['myAssessmentTasks'] as const,
  results: (id: number) => ['campaignResults', id] as const,
  activity: (id: number) => ['campaignActivity', id] as const,
  memberCandidates: (id: number, role: T.CampaignRole) => ['memberCandidates', id, role] as const,
  siteCandidates: (id: number, p: Record<string, unknown>) => ['siteCandidates', id, p] as const,
  assessment: (id: number) => ['assessment', id] as const,
  needs: (p: Record<string, unknown>) => ['damageNeeds', p] as const,
};

/** Everything a workflow step can change; cheap to refetch, so mutations invalidate broadly. */
const invalidateDamage = (qc: QueryClient) =>
  ['damageOverview', 'campaigns', 'campaign', 'campaignTasks', 'assessmentTask', 'myAssessmentTasks', 'campaignResults', 'campaignActivity', 'memberCandidates', 'siteCandidates',
   'assessment', 'assessments', 'damageNeeds', 'facility', 'facilities', 'overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export const useDamageOverview = (sector?: T.Sector | null, enabled = true) => useQuery({ queryKey: damageKeys.overview(sector), queryFn: () => api<T.DamageOverview>('damage/overview', { query: { sector: sector ?? undefined } }), staleTime: STALE, enabled });
export const useCampaigns = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: damageKeys.campaigns(p), queryFn: () => api<T.CampaignSummary[]>('damage/campaigns', { query: p }), staleTime: STALE, placeholderData: keepPreviousData, enabled });
export const useCampaign = (id: number) => useQuery({ queryKey: damageKeys.campaign(id), queryFn: () => api<T.CampaignDetail>(`damage/campaigns/${id}`), staleTime: 10_000, enabled: Number.isFinite(id) });
export const useCampaignTasks = (id: number, p: Record<string, unknown>) => useQuery({ queryKey: damageKeys.tasks(id, p), queryFn: () => api<T.AssessmentTask[]>(`damage/campaigns/${id}/tasks`, { query: p }), staleTime: 10_000, placeholderData: keepPreviousData, enabled: Number.isFinite(id) });
export const useAssessmentTask = (id: number | null) => useQuery({ queryKey: damageKeys.task(id ?? -1), queryFn: () => api<T.AssessmentTask>(`damage/tasks/${id}`), staleTime: 10_000, enabled: id !== null && Number.isFinite(id) });
export const useMyAssessmentTasks = (enabled = true) => useQuery({ queryKey: damageKeys.myTasks, queryFn: () => api<T.AssessmentTask[]>('damage/tasks/mine'), staleTime: 15_000, enabled });
export const useCampaignResults = (id: number, enabled = true) => useQuery({ queryKey: damageKeys.results(id), queryFn: () => api<T.CampaignResults>(`damage/campaigns/${id}/results`), staleTime: STALE, enabled });
export const useCampaignActivity = (id: number, enabled = true) => useQuery({ queryKey: damageKeys.activity(id), queryFn: () => api<T.CampaignActivity[]>(`damage/campaigns/${id}/activity`, { query: { limit: 200 } }), staleTime: 15_000, enabled });
export const useMemberCandidates = (id: number, role: T.CampaignRole, enabled = true) => useQuery({ queryKey: damageKeys.memberCandidates(id, role), queryFn: () => api<T.MemberCandidate[]>(`damage/campaigns/${id}/member-candidates`, { query: { role } }), staleTime: 10_000, enabled });
export const useSiteCandidates = (id: number, p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: damageKeys.siteCandidates(id, p), queryFn: () => api<T.SiteCandidate[]>(`damage/campaigns/${id}/site-candidates`, { query: p }), staleTime: 10_000, placeholderData: keepPreviousData, enabled });
export const useAssessment = (id: number) => useQuery({ queryKey: damageKeys.assessment(id), queryFn: () => api<T.AssessmentDetail>(`damage/assessments/${id}`), staleTime: 10_000, enabled: Number.isFinite(id) });
export const useNeeds = (p: Record<string, unknown>, enabled = true) => useQuery({ queryKey: damageKeys.needs(p), queryFn: () => api<T.NeedsResponse>('damage/needs', { query: p }), staleTime: STALE, placeholderData: keepPreviousData, enabled });

function useDamageMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateDamage(qc) });
}
const post = <R,>(path: string, body?: unknown) => api<R>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const useCreateCampaign = () => useDamageMutation((b: T.CampaignRequest) => post<T.CampaignDetail>('damage/campaigns', b));
export const useUpdateCampaign = (id: number) => useDamageMutation((b: T.CampaignRequest) => api<T.CampaignDetail>(`damage/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(b) }));
export const useCampaignAction = (id: number) => useDamageMutation((a: { action: 'start' | 'close-fieldwork' } | { action: 'endorse'; decision: 'APPROVE' | 'RETURN'; note?: string } | { action: 'cancel'; reason: string }) => {
  if (a.action === 'endorse') return post<T.CampaignDetail>(`damage/campaigns/${id}/endorse`, { decision: a.decision, note: a.note });
  if (a.action === 'cancel') return post<T.CampaignDetail>(`damage/campaigns/${id}/cancel`, { reason: a.reason });
  return post<T.CampaignDetail>(`damage/campaigns/${id}/${a.action}`);
});
export const useAddMember = (id: number) => useDamageMutation((b: { agentId: number; role: T.CampaignRole }) => post<T.CampaignDetail>(`damage/campaigns/${id}/members`, b));
export const useReleaseMember = (id: number) => useDamageMutation((b: { memberId: number; reason: string }) => post<T.CampaignDetail>(`damage/campaigns/${id}/members/${b.memberId}/release`, { reason: b.reason }));
export const useAddSites = (id: number) => useDamageMutation((b: { facilityIds: number[]; priority?: T.AssignmentPriority; dueOn?: string | null }) => post<T.BulkResult>(`damage/campaigns/${id}/sites`, b));
export const useRegisterSite = (id: number) => useDamageMutation((b: T.NewFacilityRequest) => post<T.AssessmentTask>(`damage/campaigns/${id}/facilities`, b));
export const useAssignSites = (id: number) => useDamageMutation((b: T.AssignSitesRequest) => post<T.BulkResult>(`damage/campaigns/${id}/assign`, b));
export const useTaskStatus = () => useDamageMutation((b: { taskId: number; status: T.TaskStatus; note?: string }) => post<T.AssessmentTask>(`damage/tasks/${b.taskId}/status`, { status: b.status, note: b.note }));
export const useCreateAssessment = () => useDamageMutation((b: T.CreateAssessmentRequest) => post<T.AssessmentSummary>('damage/assessments', b));
export const useReviseAssessment = (id: number) => useDamageMutation((b: T.CreateAssessmentRequest) => api<T.AssessmentDetail>(`damage/assessments/${id}`, { method: 'PUT', body: JSON.stringify(b) }));
export const useReviewAssessment = (id: number) => useDamageMutation((b: { decision: T.ReviewDecision; note?: string }) => post<T.AssessmentDetail>(`damage/assessments/${id}/review`, b));

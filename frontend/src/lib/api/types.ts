/** API contract types. Mirrors backend DTOs (docs/04-domain-model.md). Enum codes are stable; labels are translated client-side. */
export type Sector = 'EDUCATION' | 'HEALTH' | 'MANUFACTURING' | 'AGRICULTURE';
export const SECTORS: Sector[] = ['EDUCATION', 'HEALTH', 'MANUFACTURING', 'AGRICULTURE'];
export type ProjectStatus = 'PLANNED' | 'PROCUREMENT' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'CANCELLED';
export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'STALLED' | 'COMPLETED' | 'NOT_STARTED';
export type DamageSeverity = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' | 'DESTROYED';
export type OperationalStatus = 'NON_FUNCTIONAL' | 'PARTIALLY_FUNCTIONAL' | 'FUNCTIONAL';
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'RESOLVED' | 'DISMISSED';
export type AlertRule = 'SCHEDULE_SLIPPAGE' | 'COST_OVERRUN' | 'STALLED_REPORTING' | 'MILESTONE_OVERDUE' | 'DISBURSEMENT_LAG' | 'SEVERE_DAMAGE_UNADDRESSED' | 'QUALITY_NONCONFORMANCE';
export type AlertAction = 'ACKNOWLEDGE' | 'ASSIGN' | 'RESOLVE' | 'DISMISS' | 'COMMENT';
export type EntityType = 'PROJECT' | 'FACILITY' | 'WEREDA';
export type FundingSource = 'REGIONAL_TREASURY' | 'FEDERAL_TRANSFER' | 'DONOR_GRANT' | 'DEVELOPMENT_LOAN' | 'DIASPORA_FUND' | 'PRIVATE_INVESTMENT';
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'ACHIEVED' | 'OVERDUE';
export type DisbursementStatus = 'PLANNED' | 'REQUESTED' | 'APPROVED' | 'RELEASED';
export type DataSource = 'WEB' | 'FIELD_APP' | 'SITE_APP' | 'IMPORT' | 'SIMULATED';
export type Level = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PageResponse<T> { content: T[]; page: number; size: number; totalElements: number; totalPages: number; last: boolean }
export interface GeoPoint { lat: number; lng: number }
export interface LocalizedName { en: string; ti: string | null; am: string | null }
export interface WeredaRef { id: number; code: string; name: LocalizedName; zoneId: number; zoneCode: string; zoneName: LocalizedName }
export interface ZoneSummary { id: number; code: string; name: LocalizedName; centroid: GeoPoint | null; weredaCount: number }

export interface UserProfile { id: number; username: string; fullName: string; title: string | null; email: string; locale: string; roles: string[]; sectorScope: Sector | null; lastLoginAt: string | null }

export interface WeredaMetrics {
  id: number; code: string; name: LocalizedName; zoneId: number; zoneName: LocalizedName; urban: boolean; population: number | null; centroid: GeoPoint; hasBoundary: boolean;
  facilitiesTotal: number; facilitiesSevere: number; facilitiesFunctional: number; avgImpactScore: number | null; replacementEstimateEtb: number;
  projectsTotal: number; projectsActive: number; projectsDelayed: number; projectsCompleted: number; avgProgressPct: number | null; budgetEtb: number; disbursedEtb: number; openAlerts: number; criticalAlerts: number;
}
export interface SectorSlice { facilities: number; facilitiesSevere: number; projects: number; projectsDelayed: number; avgProgressPct: number | null; budgetEtb: number }
export interface WeredaDetail { metrics: WeredaMetrics; bySector: Record<Sector, SectorSlice> }

export interface Kpis {
  projectsTotal: number; projectsActive: number; projectsCompleted: number; projectsDelayed: number; projectsAtRisk: number; projectsStalled: number;
  avgPhysicalProgressPct: number | null; avgPlannedProgressPct: number | null; budgetEtb: number; disbursedEtb: number; expendedEtb: number;
  facilitiesTotal: number; facilitiesSevere: number; facilitiesFunctional: number; facilitiesRestored: number; replacementEstimateEtb: number;
  beneficiariesTargeted: number; assessmentsLast7Days: number; progressReportsLast7Days: number; lastFieldDataAt: string | null; lastProgressDataAt: string | null;
}
export interface AlertCounts { open: number; critical: number; high: number; decisionRequired: number; acknowledged: number; assigned: number; resolvedLast7Days: number }
export interface SectorSummary {
  sector: Sector; projectsTotal: number; projectsActive: number; projectsCompleted: number; projectsDelayed: number; avgPhysicalProgressPct: number | null; avgPlannedProgressPct: number | null;
  budgetEtb: number; disbursedEtb: number; expendedEtb: number; facilitiesTotal: number; facilitiesSevere: number; facilitiesFunctional: number; openAlerts: number; criticalAlerts: number; progressSparkline: (number | null)[];
}
export interface TrendPoint { period: string; plannedPct: number | null; actualPct: number | null; disbursedCumulativeEtb: number; expendedCumulativeEtb: number; reports: number }
export interface FundingSlice { key: string; budgetEtb: number; disbursedEtb: number; expendedEtb: number; projects: number }
export interface StreamItem { id: string; kind: 'ASSESSMENT' | 'PROGRESS' | 'ALERT'; occurredAt: string; title: string; detail: string | null; sector: Sector | null; entityType: EntityType; entityId: number; weredaName: string | null; severity: string | null; data: Record<string, unknown> }
export interface StatusCounts { planned: number; procurement: number; active: number; suspended: number; completed: number; cancelled: number }

export interface ProjectSummary {
  id: number; code: string; name: string; sector: Sector; wereda: WeredaRef; status: ProjectStatus; health: ProjectHealth; contractorName: string | null; implementingAgency: string | null;
  plannedStart: string; plannedEnd: string; revisedEnd: string | null; forecastEnd: string | null; actualStart: string | null; actualEnd: string | null;
  totalBudgetEtb: number; fundingSource: FundingSource; physicalProgressPct: number; plannedProgressPct: number; scheduleVariancePp: number; spi: number | null; cpi: number | null;
  disbursedEtb: number; expendedEtb: number; lastProgressReportAt: string | null; daysSinceReport: number | null; beneficiaries: number | null; location: GeoPoint | null;
  lifecycleStage: LifecycleStage; riskScore: number | null; lastVerifiedAt: string | null; approvalStatus: ApprovalStatus;
}
export interface AlertSummary {
  id: number; rule: AlertRule; severity: AlertSeverity; status: AlertStatus; title: string; detail: string | null; entityType: EntityType; entityId: number; entityName: string | null; entityCode: string | null;
  sector: Sector | null; weredaId: number | null; weredaName: string | null; triggeredAt: string; acknowledgedAt: string | null; assignedToUserId: number | null; assignedToName: string | null; resolvedAt: string | null;
  decisionRequired: boolean; ageHours: number; metrics: Record<string, unknown> | null;
}
export interface AlertActionDto { id: number; action: AlertAction; note: string | null; actorName: string | null; createdAt: string }
export interface AlertDetail { alert: AlertSummary; history: AlertActionDto[] }

export interface Overview {
  generatedAt: string; scope: { sector: Sector | null; zoneId: number | null; weredaId: number | null }; kpis: Kpis; alertCounts: AlertCounts; decisionQueue: AlertSummary[]; sectors: SectorSummary[];
  trend: TrendPoint[]; budgetBySector: FundingSlice[]; budgetByFundingSource: FundingSlice[]; attentionProjects: ProjectSummary[]; weredas: WeredaMetrics[]; stream: StreamItem[]; statusCounts: StatusCounts;
}

export interface MilestoneDto { id: number; sequence: number; name: string; plannedDate: string; actualDate: string | null; weightPct: number; status: MilestoneStatus; slipDays: number | null }
export interface ProgressPoint { date: string; physicalPct: number; plannedPct: number; workforce: number | null; notes: string | null; reportedBy: string | null; source: DataSource }
export interface BudgetLineDto { category: string; allocatedEtb: number }
export interface DisbursementDto { id: number; trancheNo: number; plannedDate: string; releasedDate: string | null; amountEtb: number; fundingSource: FundingSource; status: DisbursementStatus; lagDays: number | null }
export interface ExpenditureDto { id: number; periodStart: string; periodEnd: string; amountEtb: number; certifiedBy: string | null; certifiedOn: string | null }
export interface RiskDto { id: number; title: string; category: string; likelihood: Level; impact: Level; mitigation: string | null; owner: string | null; status: string; raisedOn: string }
export interface IssueDto { id: number; title: string; description: string | null; severity: Level; status: string; raisedOn: string; resolvedOn: string | null; owner: string | null }
export interface DocumentDto { id: number; docType: string; title: string; url: string; mediaType: string | null; uploadedBy: string | null; uploadedAt: string; sizeBytes: number | null }
export interface ForecastDto { provider: string; computedAt: string; forecastEnd: string | null; forecastCostEtb: number | null; confidence: number | null; rationale: string | null }
export interface LinkedFacility { id: number; code: string; name: string; facilityType: string; latestSeverity: DamageSeverity | null; operationalStatus: OperationalStatus }
export interface FinanceSummary {
  budgetEtb: number; allocatedLinesEtb: number; disbursedEtb: number; expendedEtb: number; disbursementPct: number; expenditurePct: number; earnedValueEtb: number; costVarianceEtb: number; forecastCostEtb: number | null;
  budgetLines: BudgetLineDto[]; disbursements: DisbursementDto[]; expenditures: ExpenditureDto[];
}
export interface ProjectDetail { project: ProjectSummary; description: string | null; milestones: MilestoneDto[]; progress: ProgressPoint[]; finance: FinanceSummary; risks: RiskDto[]; issues: IssueDto[]; documents: DocumentDto[]; facilities: LinkedFacility[]; forecast: ForecastDto | null; openAlerts: number; governance: Governance; risk: RiskProfile; evidence: EvidenceSnapshot; approval: ApprovalInfo }

export interface FacilitySummary {
  id: number; code: string; name: string; sector: Sector; facilityType: string; wereda: WeredaRef; kebele: string | null; location: GeoPoint | null; operationalStatus: OperationalStatus; latestSeverity: DamageSeverity | null;
  latestImpactScore: number | null; lastAssessedOn: string | null; replacementEstimateEtb: number | null; preCrisisCapacity: number | null; capacityUnit: string | null; beneficiaries: number | null; linkedProjects: number;
}
export interface FacilityRef { id: number; code: string; name: string; sector: Sector; facilityType: string; wereda: WeredaRef }
export interface AssessmentSummary {
  id: number; facility: FacilityRef; assessedOn: string; assessorName: string; severity: DamageSeverity; structuralImpactScore: number; inventoryLossPct: number | null; functionalCapacityPct: number | null;
  estimatedRepairCostEtb: number | null; estimatedReplacementCostEtb: number | null; source: DataSource; syncedAt: string | null; createdAt: string; photoCount: number;
  status: AssessmentStatus; campaignId: number | null; campaignCode: string | null; taskId: number | null; recommendedIntervention: Intervention | null;
  interventionPriority: NeedPriority | null; beneficiariesAffected: number | null; submittedAt: string | null; verifiedAt: string | null; projectId: number | null;
}
export interface AssessmentDetail {
  summary: AssessmentSummary; notes: string | null; audioNoteUrl: string | null; location: GeoPoint | null; photos: { id: number; url: string; caption: string | null; takenAt: string | null }[];
  revision: number; accessStatus: AccessStatus | null; currentUse: CurrentUse | null; uxoSuspected: boolean; damageCauses: DamageCause[]; equipmentLossEtb: number | null;
  components: AssessmentComponent[]; componentRepairTotalEtb: number; submittedByName: string | null; verifiedByName: string | null; reviewNote: string | null;
  campaign: { id: number; code: string; name: string } | null; project: { id: number; code: string; name: string } | null;
  history: { kind: string; occurredAt: string; actorName: string | null; note: string | null }[];
  permissions: { canReview: boolean; cannotReviewReason: string | null; canRevise: boolean; canCreateProject: boolean };
}
export interface LinkedProject { id: number; code: string; name: string; status: ProjectStatus; health: ProjectHealth; physicalProgressPct: number; plannedEnd: string }
export interface FacilityDetail { facility: FacilitySummary; latestAssessment: AssessmentSummary | null; assessmentHistory: AssessmentSummary[]; projects: LinkedProject[] }

export interface PipelineItem { projectId: number; projectCode: string; projectName: string; sector: Sector; weredaName: string; trancheNo: number; plannedDate: string; amountEtb: number; fundingSource: FundingSource; status: DisbursementStatus; lagDays: number }
export interface ZoneSlice { zoneId: number; zoneName: string; budgetEtb: number; disbursedEtb: number; expendedEtb: number; projects: number }
export interface VarianceItem { projectId: number; projectCode: string; projectName: string; sector: Sector; budgetEtb: number; expendedEtb: number; physicalPct: number; cpi: number | null; forecastCostEtb: number | null }
export interface FinanceOverview { bySector: FundingSlice[]; byFundingSource: FundingSlice[]; byStatus: FundingSlice[]; byZone: ZoneSlice[]; pendingDisbursements: PipelineItem[]; costVariance: VarianceItem[] }

export interface BriefChange { label: string; last24h: number; last7d: number }
export interface BriefProjectLine { id: number; code: string; name: string; sector: Sector; weredaName: string; physicalPct: number; plannedPct: number; variancePp: number; health: ProjectHealth; plannedEnd: string }
export interface BriefDecision { alertId: number; title: string; actor: string | null; action: string; note: string | null; at: string }
export interface DailyBrief { generatedAt: string; preparedFor: string; scope: Sector | null; kpis: Kpis; alertCounts: AlertCounts; changes: BriefChange[]; newCriticalAlerts: AlertSummary[]; newlyDelayed: BriefProjectLine[]; completedRecently: BriefProjectLine[]; decisionsTaken: BriefDecision[]; sectors: SectorSummary[] }

export interface SearchHit { type: EntityType; id: number; code: string; title: string; subtitle: string | null; sector: Sector | null }
export interface UserSummary { id: number; username: string; email: string; fullName: string; title: string | null; enabled: boolean; roles: string[]; sectorScope: Sector | null; locale: string; lastLoginAt: string | null; locked: boolean }
export interface AuditEntry { id: number; occurredAt: string; actor: string | null; roles: string | null; action: string; entityType: string | null; entityId: string | null; httpMethod: string | null; path: string | null; ip: string | null; correlationId: string | null; detail: Record<string, unknown> | null }

export interface GeoFeatureCollection { type: 'FeatureCollection'; features: { type: 'Feature'; id: number; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Record<string, unknown> }[] }

// ── V3 · command platform ─────────────────────────────────────────────────
export type LifecycleStage = 'PLANNING' | 'APPROVAL' | 'FUNDING' | 'PROCUREMENT' | 'IMPLEMENTATION' | 'MONITORING' | 'COMPLETION' | 'CANCELLED';
export const LIFECYCLE_STAGES: LifecycleStage[] = ['PLANNING', 'APPROVAL', 'FUNDING', 'PROCUREMENT', 'IMPLEMENTATION', 'MONITORING', 'COMPLETION'];
export type OrganizationRole = 'IMPLEMENTING_AGENCY' | 'CONTRACTOR' | 'SUPERVISING_CONSULTANT' | 'FUNDER' | 'BENEFICIARY_INSTITUTION' | 'OVERSIGHT';
export type OrganizationType = 'GOVERNMENT_BUREAU' | 'CONTRACTOR' | 'CONSULTANT' | 'DONOR' | 'FEDERAL_AGENCY' | 'NGO' | 'COMMUNITY' | 'PRIVATE';
export type InspectionType = 'SITE_VISIT' | 'PROGRESS_VERIFICATION' | 'QUALITY_INSPECTION' | 'DAMAGE_VERIFICATION' | 'HANDOVER_INSPECTION' | 'SAFETY_AUDIT';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED' | 'REJECTED';
export type MediaKind = 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
export type InsightKind = 'DELAY_PREDICTION' | 'COMPLETION_FORECAST' | 'COST_RISK' | 'SUPPLY_RISK' | 'RISK_SCORE' | 'DAMAGE_PRIORITY' | 'FUNDING_PRIORITY' | 'ANOMALY' | 'RECOMMENDATION';
export type InsightStatus = 'ACTIVE' | 'SUPERSEDED' | 'DISMISSED' | 'ACTIONED';
export type RiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type ReportType = 'EXECUTIVE_SUMMARY' | 'SECTOR' | 'GEOGRAPHIC' | 'PROJECT_PROGRESS' | 'FINANCIAL' | 'RISK' | 'DECISION_LOG' | 'FIELD_EVIDENCE';
export type ReportPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'CUSTOM';
export type ReportFormat = 'JSON' | 'CSV';

export interface StageEventDto { id: number; fromStage: LifecycleStage | null; toStage: LifecycleStage; occurredAt: string; actorName: string | null; note: string | null; reference: string | null }
export interface OrganizationDto { id: number; code: string; name: string; orgType: OrganizationType; role: OrganizationRole; contact: string | null }
export interface Governance {
  stage: LifecycleStage; allowedTransitions: LifecycleStage[]; approvedOn: string | null; approvalReference: string | null; fundingSecuredOn: string | null; contractSignedOn: string | null;
  contractValueEtb: number | null; procurementMethod: string | null; handoverOn: string | null; defectsLiabilityEnd: string | null; stageEvents: StageEventDto[]; organizations: OrganizationDto[];
}
export interface RiskComponent { key: string; score: number; weight: number; value: string; note: string }
export interface RiskComponents { band?: RiskBand; asOf?: string; components?: RiskComponent[] }
export interface RiskProfile { score: number | null; band: RiskBand | null; computedAt: string | null; components: RiskComponents | null }
export interface EvidenceSnapshot { inspections: number; verified: number; disputed: number; unverified: number; mediaItems: number; photos: number; videos: number; lastInspectionAt: string | null; lastVerifiedAt: string | null; daysSinceEvidence: number | null; coverage: 'NONE' | 'STALE' | 'RECENT' }
export interface TimelineEvent { id: string; kind: 'STAGE' | 'MILESTONE' | 'PROGRESS' | 'DISBURSEMENT' | 'ALERT' | 'DECISION' | 'INSPECTION' | 'DOCUMENT'; occurredAt: string; title: string; detail: string | null; actor: string | null; tone: string; data: Record<string, unknown> }

export interface InspectionSummary {
  id: number; inspectionType: InspectionType; visitedOn: string; startedAt: string | null; endedAt: string | null; inspectorName: string; organization: string | null;
  projectId: number | null; projectCode: string | null; projectName: string | null; facilityId: number | null; facilityName: string | null; sector: Sector | null; wereda: WeredaRef;
  location: GeoPoint | null; gpsAccuracyM: number | null; distanceFromSiteM: number | null; farFromSite: boolean; observedProgressPct: number | null; reportedProgressPct: number | null; progressGapPp: number | null;
  workforceObserved: number | null; qualityRating: number | null; safetyRating: number | null; verificationStatus: VerificationStatus; verifiedByName: string | null; verifiedAt: string | null;
  source: DataSource; syncedAt: string | null; createdAt: string; mediaCount: number; photoCount: number;
}
export interface MediaDto {
  id: number; kind: MediaKind; url: string; thumbnailUrl: string | null; mediaType: string | null; sizeBytes: number | null; width: number | null; height: number | null; durationSeconds: number | null;
  caption: string | null; capturedAt: string | null; location: GeoPoint | null; gpsAccuracyM: number | null; capturedBy: string | null; verificationStatus: VerificationStatus;
  inspectionId: number | null; assessmentId: number | null; projectId: number | null; facilityId: number | null; origin: 'INSPECTION' | 'ASSESSMENT' | 'PROGRESS'; subjectName: string | null; geotagged: boolean; timestamped: boolean;
}
export interface InspectionDetail { summary: InspectionSummary; findings: string | null; recommendedAction: string | null; verificationNote: string | null; media: MediaDto[] }
export interface EvidenceSummary { inspections: number; verified: number; disputed: number; unverified: number; mediaItems: number; photos: number; videos: number; lastInspectionAt: string | null; lastVerifiedAt: string | null; daysSinceEvidence: number | null; coverage: 'NONE' | 'STALE' | 'RECENT' }

export interface InsightFeature { name: string; value: string; weight?: number }
export interface InsightDto {
  id: number; kind: InsightKind; entityType: EntityType; entityId: number; entityName: string | null; entityCode: string | null; sector: Sector | null; weredaId: number | null; weredaName: string | null;
  provider: string; modelVersion: string | null; basis: 'RULE' | 'MODEL'; computedAt: string; severity: AlertSeverity | null; score: number | null; confidence: number | null; horizonDays: number | null;
  title: string; summary: string | null; explanation: { basis?: string; features?: InsightFeature[]; items?: { code: string; severity: string; title: string; detail: string }[]; components?: RiskComponent[]; band?: string } | null;
  status: InsightStatus; reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null;
}
export interface ForecastPoint { computedAt: string; provider: string; forecastEnd: string | null; forecastCostEtb: number | null; confidence: number | null }
export interface ProjectIntelligence { projectId: number; riskScore: number | null; riskBand: RiskBand | null; riskComputedAt: string | null; riskComponents: RiskComponents | null; insights: InsightDto[]; forecastHistory: ForecastPoint[]; disclaimer: { text: string; providers: string[] } }

export interface Signal { code: string; severity: AlertSeverity; value: number | null; unit: string; display: string; trend: string | null; explanation: string; href: string | null }
export interface ActionEvidence { label: string; value: string }
export interface ActionCard {
  id: string; priority: number; kind: 'DECISION' | 'FUNDING' | 'VERIFICATION' | 'ESCALATION' | 'REALLOCATION' | 'REVIEW'; severity: AlertSeverity; title: string; rationale: string; evidence: ActionEvidence[]; suggestedAction: string;
  entityType: EntityType | null; entityId: number | null; entityName: string | null; entityCode: string | null; sector: Sector | null; weredaName: string | null; alertId: number | null; insightId: number | null; basis: string; ageHours: number;
}
export interface UnitComparison { key: string; label: string; projectsActive: number; projectsDelayed: number; avgVariancePp: number | null; avgCpi: number | null; reportingCoveragePct: number | null; verifiedCoveragePct: number | null; disbursementPct: number | null; avgRiskScore: number | null; criticalAlerts: number; rank: number }
export interface ContractorPerformance { contractor: string; projects: number; active: number; delayed: number; completed: number; avgVariancePp: number | null; avgCpi: number | null; budgetEtb: number; onTimeRatePct: number | null; rank: number }
export interface FundingPriority { facilityId: number; code: string; name: string; sector: Sector; facilityType: string; weredaName: string; severity: DamageSeverity; impactScore: number | null; beneficiaries: number | null; replacementEstimateEtb: number | null; priorityScore: number; insightId: number | null; explanation: { features?: InsightFeature[] } }
export interface RiskEntry { projectId: number; code: string; name: string; sector: Sector; weredaName: string; status: ProjectStatus; health: ProjectHealth; riskScore: number; band: RiskBand; variancePp: number; cpi: number | null; daysSinceReport: number | null; daysSinceVerified: number | null; budgetEtb: number; components: RiskComponents; riskType: RiskType; severity: AlertSeverity; recommendedAction: string }
export type RiskType = 'SCHEDULE' | 'COST' | 'REPORTING' | 'MILESTONES' | 'ISSUES' | 'FUNDING' | 'VERIFICATION';
export type FundingRecommendation = 'RELEASE' | 'CONDITIONAL' | 'HOLD';
export interface ProjectFundingPriority { projectId: number; code: string; name: string; sector: Sector; weredaName: string; health: ProjectHealth; physicalPct: number; budgetEtb: number; disbursedEtb: number; pendingEtb: number; nextDueDate: string; lagDays: number; riskScore: number | null; daysSinceVerified: number | null; priorityScore: number; recommendation: FundingRecommendation; rationale: string }
export interface Briefing { generatedAt: string; sector: Sector | null; zoneId: number | null; signals: Signal[]; actions: ActionCard[]; sectors: UnitComparison[]; zones: UnitComparison[]; contractors: ContractorPerformance[]; projectFundingPriorities: ProjectFundingPriority[]; fundingPriorities: FundingPriority[]; riskRegister: RiskEntry[]; disclaimer: string }

export interface ReportKpi { label: string; value: string; hint: string | null; tone: string | null }
export interface ReportColumn { key: string; label: string; align: 'left' | 'right'; format: 'text' | 'int' | 'num' | 'money' | 'date' | 'datetime' }
export interface ReportSection { id: string; title: string; kind: 'KPIS' | 'TABLE' | 'LIST' | 'TEXT'; hint: string | null; kpis: ReportKpi[] | null; columns: ReportColumn[] | null; rows: Record<string, unknown>[] | null; items: string[] | null; text: string | null }
export interface Report { type: ReportType; title: string; subtitle: string | null; period: ReportPeriod; from: string; to: string; generatedAt: string; generatedBy: string | null; scope: { sector: Sector | null; zoneId: number | null; zoneName: string | null; weredaId: number | null; weredaName: string | null; projectId: number | null; projectCode: string | null }; sections: ReportSection[]; classification: string }
export interface ReportCatalogEntry { type: ReportType; title: string; description: string; periods: ReportPeriod[]; scopes: string[]; formats: ReportFormat[] }
export interface ReportRun { id: number; reportType: ReportType; period: ReportPeriod; title: string; scope: Record<string, unknown> | null; format: ReportFormat | 'PDF'; generatedAt: string; generatedBy: string | null; rowCount: number | null; sha256: string | null }

export interface GeoFeature<P = Record<string, unknown>> { type: 'Feature'; id: number | string; geometry: { type: string; coordinates: unknown }; properties: P }
export interface GeoCollection<P = Record<string, unknown>> { type: 'FeatureCollection'; features: GeoFeature<P>[] }
export interface ProjectFeatureProps { kind: 'PROJECT'; code: string; name: string; sector: Sector; status: ProjectStatus; health: ProjectHealth; stage: LifecycleStage; physicalPct: number; plannedPct: number; variancePp: number; budgetEtb: number; disbursedEtb: number; riskScore: number | null; contractor: string | null; plannedEnd: string | null; forecastEnd: string | null; lastReportAt: string | null; lastVerifiedAt: string | null; weredaId: number; wereda: string; zone: string; openAlerts: number; severity: DamageSeverity | null }
export interface FacilityFeatureProps { kind: 'FACILITY'; code: string; name: string; sector: Sector; facilityType: string; operationalStatus: OperationalStatus; severity: DamageSeverity | null; impactScore: number | null; assessedOn: string | null; replacementEstimateEtb: number | null; beneficiaries: number | null; weredaId: number; wereda: string; zone: string; projects: number; media: number; unaddressed: boolean }
export interface EvidenceFeatureProps { kind: 'INSPECTION' | 'MEDIA'; type: string; at: string | null; who: string | null; verificationStatus: VerificationStatus; distanceOrAccuracyM: number | null; url: string | null; subject: string | null; projectId: number | null; facilityId: number | null; ref: number | null }

// ── Project registration ─────────────────────────────────────────────────
export type BudgetCategory = 'WORKS' | 'GOODS' | 'SERVICES' | 'CONTINGENCY' | 'SUPERVISION';
export interface OrganizationAssignment { role: OrganizationRole; organizationId?: number | null; newName?: string | null; newType?: OrganizationType | null; newContact?: string | null }
export interface CreateProjectRequest {
  code?: string | null; name: string; sector: Sector; weredaId: number; description?: string | null; beneficiaries?: number | null; latitude?: number | null; longitude?: number | null;
  initialStage: LifecycleStage; plannedStart: string; plannedEnd: string; actualStart?: string | null; totalBudgetEtb: number; fundingSource: FundingSource;
  procurementMethod?: string | null; contractValueEtb?: number | null; approvedOn?: string | null; approvalReference?: string | null; fundingSecuredOn?: string | null; contractSignedOn?: string | null;
  registrationNote?: string | null; organizations: OrganizationAssignment[]; milestones: { name: string; plannedDate: string; weightPct: number }[];
  budgetLines: { category: BudgetCategory; allocatedEtb: number }[]; tranches: { plannedDate: string; amountEtb: number; fundingSource?: FundingSource | null }[];
  facilityIds: number[]; risks: { title: string; category: string; likelihood: Level; impact: Level; mitigation?: string | null; owner?: string | null }[];
  assessmentIds?: number[];
}
export interface FieldIssue { field: string; message: string }
export interface RegistrationValidation { valid: boolean; suggestedCode: string | null; errors: FieldIssue[]; warnings: FieldIssue[] }
export interface SimilarProject { id: number; code: string; name: string; weredaName: string; status: ProjectStatus }
export interface OrganizationOption { id: number; code: string; name: string; orgType: OrganizationType; contact: string | null; projects: number }

// ── V4 · executive approval ─────────────────────────────────────────────────
export type ApprovalStatus = 'PENDING' | 'RETURNED' | 'APPROVED' | 'REJECTED';
export type ApprovalAction = 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED';
export type ApprovalDecision = 'APPROVE' | 'RETURN' | 'REJECT';
export interface ApprovalEventDto { id: number; action: ApprovalAction; occurredAt: string; actorName: string | null; note: string | null; conditions: string | null; reference: string | null }
export interface ApprovalInfo { status: ApprovalStatus; submittedAt: string | null; submittedByName: string | null; decidedAt: string | null; decidedByName: string | null; decisionReference: string | null; conditions: string | null; events: ApprovalEventDto[] }
export interface ReadinessCheck { code: string; passed: boolean; severity: 'WARN' | 'INFO'; detail: string | null }
export interface Readiness { passed: number; total: number; warnings: number; checks: ReadinessCheck[] }
export interface ApprovalQueueItem { project: ProjectSummary; status: ApprovalStatus; submittedAt: string | null; submittedByName: string | null; waitingDays: number | null; decidedAt: string | null; decidedByName: string | null; decisionReference: string | null; lastNote: string | null; resubmissions: number; readiness: Readiness }
export interface ApprovalCounts { pending: number; returned: number; approvedLast30: number; rejectedLast30: number; returnedLast30: number; oldestPendingDays: number | null; pendingBudgetEtb: number; medianDecisionDays: number | null }
export interface ApprovalContext { sectorApprovedProjects: number; sectorApprovedBudgetEtb: number; shareOfSectorBudgetPct: number | null; weredaActiveProjects: number; weredaSevereFacilities: number; sameContractorActiveProjects: number; contractorName: string | null }
export interface ApprovalDossier { detail: ProjectDetail; readiness: Readiness; context: ApprovalContext; similar: SimilarProject[]; canDecide: boolean; cannotDecideReason: string | null; canResubmit: boolean }

// ── V4 · field team ─────────────────────────────────────────────────────────
export type AgentType = 'DATA_COLLECTOR' | 'FIELD_ANALYST' | 'FIELD_SUPERVISOR';
export type AgentStatus = 'PENDING_ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'DEACTIVATED';
export type EmploymentType = 'STAFF' | 'CONTRACT' | 'SECONDED' | 'VOLUNTEER';
export type AssignmentRole = 'LEAD' | 'DATA_COLLECTOR' | 'FIELD_ANALYST' | 'VERIFIER';
export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'RELEASED';
export type AssignmentPriority = 'NORMAL' | 'HIGH' | 'URGENT';
export type CoverageGap = 'NO_TEAM' | 'NO_LEAD' | 'OVERDUE' | 'NO_VERIFIER' | 'NOT_STARTED' | 'OK';
export interface AgentRef { id: number; code: string; fullName: string; agentType: AgentType; status: AgentStatus }
export interface WeredaLite { id: number; name: LocalizedName; zoneId: number; zoneName: LocalizedName }
export interface AgentSummary {
  id: number; code: string; fullName: string; agentType: AgentType; status: AgentStatus; phone: string; email: string | null; organizationName: string | null;
  homeWereda: WeredaLite | null; coverageWeredas: number; coverageZones: string[]; sectors: Sector[]; activeAssignments: number; maxActiveAssignments: number;
  overdueVisits: number; inspections30d: number; acceptanceRate90d: number | null; lastInspectionOn: string | null; lastSyncAt: string | null;
  hasAccount: boolean; username: string | null; onboarded: boolean; contractEnd: string | null; supervisorName: string | null;
}
export interface MonthCount { month: string; count: number }
export interface AgentPerformance { inspectionsTotal: number; inspections30d: number; inspections90d: number; verified90d: number; disputed90d: number; rejected90d: number; acceptanceRate90d: number | null; avgDistanceFromSiteM: number | null; avgGpsAccuracyM: number | null; onScheduleRate: number | null; monthly: MonthCount[] }
export interface RecentInspection { id: number; visitedOn: string; inspectionType: InspectionType; projectId: number | null; subjectName: string | null; verificationStatus: VerificationStatus; distanceFromSiteM: number | null }
export interface AgentEventDto { id: number; kind: string; occurredAt: string; actorName: string | null; note: string | null; data: Record<string, unknown> | null }
export interface DeviceDto { id: number; deviceUid: string; label: string | null; platform: string | null; appVersion: string | null; lastSyncAt: string | null; enabled: boolean }
export interface AgentDetail {
  summary: AgentSummary; gender: 'FEMALE' | 'MALE' | null; altPhone: string | null; nationalId: string | null; employeeNumber: string | null; employmentType: EmploymentType | null;
  organization: { id: number; code: string; name: string } | null; supervisor: AgentRef | null; educationLevel: string | null; yearsExperience: number | null;
  skills: string[]; languages: string[]; contractStart: string | null; trainingCompletedOn: string | null; codeOfConductSignedOn: string | null; backgroundCheckOn: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null; notes: string | null; statusReason: string | null; statusChangedAt: string | null;
  registeredByName: string | null; createdAt: string; coverage: WeredaLite[]; team: AgentRef[]; assignments: AssignmentDto[]; performance: AgentPerformance;
  recentInspections: RecentInspection[]; events: AgentEventDto[]; device: DeviceDto | null; allowedTransitions: AgentStatus[];
}
export interface AgentRequest {
  fullName: string; gender?: 'FEMALE' | 'MALE' | null; phone: string; altPhone?: string | null; email?: string | null; nationalId?: string | null; employeeNumber?: string | null;
  agentType: AgentType; organizationId?: number | null; employmentType?: EmploymentType | null; homeWeredaId?: number | null; supervisorId?: number | null;
  educationLevel?: string | null; yearsExperience?: number | null; sectors: Sector[]; skills?: string[]; languages?: string[]; maxActiveAssignments?: number | null;
  contractStart?: string | null; contractEnd?: string | null; trainingCompletedOn?: string | null; codeOfConductSignedOn?: string | null; backgroundCheckOn?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; coverageWeredaIds: number[]; notes?: string | null; createAccount?: boolean; username?: string | null;
}
export interface AccessResponse { username: string; temporaryPassword: string; created: boolean }
export interface RegisterAgentResponse { agent: AgentDetail; access: AccessResponse | null }
export interface TeamSummary {
  totalAgents: number; active: number; pendingOnboarding: number; onLeave: number; suspended: number; activeByType: Record<AgentType, number>;
  activeAssignments: number; overdueVisits: number; projectsNeedingCoverage: number; projectsWithoutTeam: number; projectsWithoutLead: number; coveragePct: number | null;
  availableSlots: number; agentsAtCapacity: number; contractsEndingSoon: number; withoutAccount: number;
}
export interface AssignmentProjectRef { id: number; code: string; name: string; sector: Sector; weredaName: string; zoneName: string; lifecycleStage: LifecycleStage; status: ProjectStatus; health: ProjectHealth; approvalStatus: ApprovalStatus; riskScore: number | null }
export interface AssignmentDto {
  id: number; project: AssignmentProjectRef; agent: AgentRef; role: AssignmentRole; status: AssignmentStatus; priority: AssignmentPriority; startOn: string; endOn: string | null;
  visitFrequencyDays: number; requiredInspectionTypes: InspectionType[]; instructions: string | null; overrideNote: string | null; assignedByName: string | null; assignedAt: string;
  visits: number; lastVisitOn: string | null; nextDueOn: string | null; overdueDays: number | null; closedAt: string | null; closedByName: string | null; closeReason: string | null;
}
export interface AssignmentRequest { projectId: number; agentId: number; role: AssignmentRole; priority?: AssignmentPriority; startOn: string; endOn?: string | null; visitFrequencyDays: number; requiredInspectionTypes?: InspectionType[]; instructions?: string | null; overrideNote?: string | null }
export interface AssignmentCheck { valid: boolean; errors: FieldIssue[]; warnings: FieldIssue[] }
export interface ScorePart { code: 'AREA' | 'SECTOR' | 'CAPACITY' | 'QUALITY' | 'PROXIMITY'; points: number; max: number }
export interface Candidate { agent: AgentSummary; score: number; parts: ScorePart[]; flags: string[]; eligible: boolean; distanceKm: number | null }
export interface CoverageRow { project: AssignmentProjectRef; lastVerifiedAt: string | null; daysSinceVerified: number | null; needsCoverage: boolean; gap: CoverageGap; team: AssignmentDto[]; overdue: number }

// ── Messaging ──────────────────────────────────────────────────────────────
export type ConversationKind = 'DIRECT' | 'GROUP' | 'CONTEXT';
export type ChatContextType = 'PROJECT' | 'APPROVAL' | 'ALERT' | 'FIELD_AGENT';
export interface ChatPerson { id: number; username: string; fullName: string; title: string | null; roles: string[]; sectorScope: Sector | null; online: boolean }
export interface ChatContextRef { type: ChatContextType; id: number; code: string | null }
export interface MessagePreview { id: number; senderName: string | null; kind: 'TEXT' | 'SYSTEM'; body: string | null; deleted: boolean; hasAttachments: boolean; createdAt: string }
export interface ConversationSummary { id: number; kind: ConversationKind; title: string | null; context: ChatContextRef | null; counterpart: ChatPerson | null; memberCount: number; lastMessage: MessagePreview | null; lastActivityAt: string; unread: number; mentioned: boolean; muted: boolean }
export interface ChatMember { person: ChatPerson; role: 'OWNER' | 'MEMBER'; lastReadMessageId: number; lastReadAt: string | null }
export interface ConversationDetail { id: number; kind: ConversationKind; title: string | null; context: ChatContextRef | null; counterpart: ChatPerson | null; members: ChatMember[]; following: boolean; muted: boolean; canPost: boolean; cannotPostReason: string | null; canManage: boolean; lastReadMessageId: number | null }
export interface ChatMention { id: number; username: string; fullName: string }
export interface ChatAttachment { id: number; fileName: string; mediaType: string; sizeBytes: number }
export interface ChatReplyRef { id: number; senderName: string | null; excerpt: string | null; deleted: boolean }
export interface ChatMessage { id: number; conversationId: number; senderId: number | null; senderName: string | null; kind: 'TEXT' | 'SYSTEM'; body: string | null; meta: Record<string, unknown>; replyTo: ChatReplyRef | null; mentions: ChatMention[]; attachments: ChatAttachment[]; createdAt: string; editedAt: string | null; deleted: boolean }
export interface MessagePage { items: ChatMessage[]; hasMore: boolean }
export interface ChatUnread { total: number; conversations: number; mentions: number }
export interface ChatSearchHit { message: ChatMessage; conversationTitle: string | null; kind: ConversationKind }
export interface ChatFrame { type: 'MESSAGE' | 'MESSAGE_UPDATED' | 'READ' | 'TYPING' | 'CONVERSATION'; conversationId: number; payload: unknown }

// ── Notifications ──────────────────────────────────────────────────────────
export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
export interface AppNotification { id: number; type: string; severity: NotificationSeverity; link: string | null; actorName: string | null; data: Record<string, unknown>; createdAt: string; readAt: string | null }
export interface NotificationPage { items: AppNotification[]; hasMore: boolean; unread: number }
export interface NotificationFrame { type: 'NEW' | 'READ'; notification: AppNotification | null; unread: number }

// ── V7 · damage assessment campaigns ───────────────────────────────────────
export type CampaignStatus = 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
export type CampaignRole = 'TEAM_LEAD' | 'ASSESSOR' | 'ENGINEER' | 'VERIFIER';
export type TaskStatus = 'PLANNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'RETURNED' | 'VERIFIED' | 'INACCESSIBLE' | 'CANCELLED';
export type AssessmentStatus = 'SUBMITTED' | 'RETURNED' | 'VERIFIED' | 'REJECTED';
export type ReviewDecision = 'VERIFY' | 'RETURN' | 'REJECT';
export type AccessStatus = 'ACCESSIBLE' | 'PARTIAL' | 'INACCESSIBLE';
export type CurrentUse = 'NORMAL_USE' | 'PARTIAL_USE' | 'IDP_SHELTER' | 'MILITARY_USE' | 'ABANDONED' | 'OTHER';
export type DamageCause = 'SHELLING' | 'AIRSTRIKE' | 'LOOTING' | 'FIRE' | 'VANDALISM' | 'OCCUPATION' | 'NEGLECT' | 'FLOOD' | 'OTHER';
export type Intervention = 'NO_ACTION' | 'MINOR_REPAIR' | 'REHABILITATION' | 'RECONSTRUCTION' | 'RELOCATION';
export type NeedPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export interface AssessmentComponent { component: string; condition: DamageSeverity; repairCostEtb: number | null; note: string | null }
export interface CreateAssessmentRequest {
  facilityId: number; clientReference?: string | null; assessedOn: string; assessorName: string; severity: DamageSeverity; structuralImpactScore: number;
  inventoryLossPct?: number | null; functionalCapacityPct?: number | null; estimatedRepairCostEtb?: number | null; estimatedReplacementCostEtb?: number | null;
  notes?: string | null; location?: GeoPoint | null; photos?: { url: string; caption?: string | null; takenAt?: string | null; location?: GeoPoint | null }[] | null;
  taskId?: number | null; accessStatus?: AccessStatus | null; currentUse?: CurrentUse | null; uxoSuspected?: boolean; damageCauses?: DamageCause[];
  recommendedIntervention?: Intervention | null; interventionPriority?: NeedPriority | null; beneficiariesAffected?: number | null; equipmentLossEtb?: number | null;
  components?: AssessmentComponent[];
}
export interface Need { assessment: AssessmentSummary; campaignName: string | null; estimateEtb: number | null; ageDays: number }
export interface NeedsResponse { summary: { count: number; totalEstimateEtb: number; urgent: number; beneficiaries: number }; items: Need[] }

export interface CampaignProgress { total: number; planned: number; assigned: number; inProgress: number; submitted: number; returned: number; verified: number; inaccessible: number; cancelled: number; overdue: number; completionPct: number }
export interface CampaignSummary {
  id: number; code: string; name: string; sector: Sector | null; status: CampaignStatus; plannedStart: string; plannedEnd: string; coordinatorName: string | null;
  weredaCount: number; memberCount: number; progress: CampaignProgress; verifiedEstimateEtb: number; endorsedAt: string | null; endorsementReference: string | null; daysLeft: number | null;
}
export interface CampaignMember {
  id: number; agentId: number; agentCode: string; fullName: string; agentType: AgentType; role: CampaignRole; phone: string | null; hasLogin: boolean; coversScope: boolean;
  openTasks: number; verifiedTasks: number; pendingReviews: number; active: boolean; addedAt: string; addedByName: string | null; releasedAt: string | null; releaseReason: string | null;
}
export interface CampaignPermissions { canManage: boolean; canStart: boolean; cannotStartReason: string | null; canCloseFieldwork: boolean; cannotCloseReason: string | null; canEndorse: boolean; cannotEndorseReason: string | null; canCancel: boolean }
export interface CampaignDetail {
  summary: CampaignSummary; objective: string | null; methodology: string | null; weredas: WeredaRef[]; coordinatorUserId: number | null; createdByName: string | null; createdAt: string;
  startedAt: string | null; fieldworkClosedAt: string | null; endorsedByName: string | null; endorsementNote: string | null; cancelReason: string | null;
  members: CampaignMember[]; permissions: CampaignPermissions;
}
export interface CampaignRequest { name: string; sector: Sector | null; objective?: string | null; methodology?: string | null; plannedStart: string; plannedEnd: string; coordinatorUserId?: number | null; weredaIds: number[] }
export interface MemberCandidate { agentId: number; code: string; fullName: string; agentType: AgentType; sectors: Sector[]; hasLogin: boolean; coveredWeredas: number; openTasks: number; currentRoles: CampaignRole[]; eligible: boolean; ineligibleReason: string | null }
export interface TaskPerson { agentId: number; fullName: string; userId: number | null }
export interface AssessmentTask {
  id: number; campaignId: number; campaignCode: string; campaignName: string; campaignStatus: CampaignStatus; facility: FacilityRef; status: TaskStatus; priority: AssignmentPriority;
  assessor: TaskPerson | null; verifier: TaskPerson | null; dueOn: string | null; overdue: boolean; instructions: string | null; statusNote: string | null;
  assessmentId: number | null; assessmentStatus: AssessmentStatus | null; severity: DamageSeverity | null; replacementEstimateEtb: number | null;
  previousSeverity: DamageSeverity | null; previousAssessedOn: string | null; assignedAt: string | null; submittedAt: string | null; verifiedAt: string | null;
  latitude: number | null; longitude: number | null;
}
export interface SiteCandidate { facilityId: number; code: string; name: string; sector: Sector; facilityType: string; wereda: WeredaRef; latestSeverity: DamageSeverity | null; lastAssessedOn: string | null; beneficiaries: number | null; inOtherCampaign: string | null }
export interface NewFacilityRequest { name: string; facilityType: string; weredaId: number; kebele?: string | null; latitude?: number | null; longitude?: number | null; preCrisisCapacity?: number | null; capacityUnit?: string | null; beneficiaries?: number | null; priority?: AssignmentPriority }
export interface AssignSitesRequest { taskIds: number[]; assessorAgentId?: number | null; verifierAgentId?: number | null; dueOn?: string | null; priority?: AssignmentPriority | null; instructions?: string | null }
export interface BulkResult { updated: number; skipped: string[] }
export interface ResultBucket { key: string; sites: number; estimateEtb: number; beneficiaries: number }
export interface CampaignResults {
  progress: CampaignProgress; assessed: number; repairEstimateEtb: number; replacementEstimateEtb: number; equipmentLossEtb: number; beneficiariesAffected: number; uxoSites: number; idpShelterSites: number;
  bySeverity: ResultBucket[]; byIntervention: ResultBucket[]; byPriority: ResultBucket[]; byWereda: ResultBucket[]; byFacilityType: ResultBucket[]; byCause: ResultBucket[]; componentsDamaged: ResultBucket[];
  needsLinkedToProjects: number;
}
export interface CampaignActivity { id: number; kind: string; occurredAt: string; actorName: string | null; note: string | null; taskId: number | null; assessmentId: number | null; facilityName: string | null; data: Record<string, unknown> | null }
export interface DamageOverview {
  campaignsPlanning: number; campaignsActive: number; campaignsInReview: number; campaignsCompleted: number; sitesTotal: number; sitesVerified: number; sitesOutstanding: number; sitesInaccessible: number;
  awaitingReview: number; oldestAwaitingDays: number | null; returned: number; facilitiesBySeverity: Record<DamageSeverity, number>; facilitiesAssessed: number; facilitiesNeverAssessed: number;
  verifiedReplacementEtb: number; needsAwaitingProject: number; needsEstimateEtb: number; mine: { toAssess: number; returned: number; toReview: number };
}

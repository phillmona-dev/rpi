import type { BudgetCategory, CreateProjectRequest, FundingSource, LifecycleStage, Level, OrganizationRole, OrganizationType, Sector } from '@/lib/api/types';

/* ─── Form state ─────────────────────────────────────────────────────────────
   Inputs hold strings (what the user typed); conversion to numbers happens once, in toRequest().
   Field paths in errors mirror the API ("milestones[2].plannedDate") so server issues land on the same inputs. */

export const STEPS = ['basics', 'location', 'schedule', 'budget', 'parties', 'risks', 'review'] as const;
export type StepKey = (typeof STEPS)[number];

export const REGISTRABLE_STAGES: LifecycleStage[] = ['PLANNING', 'APPROVAL', 'FUNDING', 'PROCUREMENT', 'IMPLEMENTATION'];
export const stageRank = (s: LifecycleStage) => REGISTRABLE_STAGES.indexOf(s);
export const BUDGET_CATEGORIES: BudgetCategory[] = ['WORKS', 'GOODS', 'SERVICES', 'SUPERVISION', 'CONTINGENCY'];
export const FUNDING_SOURCES: FundingSource[] = ['REGIONAL_TREASURY', 'FEDERAL_TRANSFER', 'DONOR_GRANT', 'DEVELOPMENT_LOAN', 'DIASPORA_FUND', 'PRIVATE_INVESTMENT'];
export const PROCUREMENT_METHODS = ['ICB', 'NCB', 'RESTRICTED', 'RFQ', 'DIRECT', 'FRAMEWORK', 'FORCE_ACCOUNT', 'COMMUNITY'] as const;
export const RISK_CATEGORIES = ['SCOPE', 'FINANCIAL', 'SUPPLY', 'MARKET', 'RESOURCE', 'SAFETY', 'SECURITY', 'ENVIRONMENT', 'TECHNICAL', 'PROCUREMENT', 'SOCIAL'] as const;
export const LEVELS: Level[] = ['LOW', 'MEDIUM', 'HIGH'];
export const ORG_ROLES: OrganizationRole[] = ['IMPLEMENTING_AGENCY', 'CONTRACTOR', 'SUPERVISING_CONSULTANT', 'FUNDER', 'BENEFICIARY_INSTITUTION', 'OVERSIGHT'];
export const ORG_TYPES: OrganizationType[] = ['GOVERNMENT_BUREAU', 'CONTRACTOR', 'CONSULTANT', 'DONOR', 'FEDERAL_AGENCY', 'NGO', 'COMMUNITY', 'PRIVATE'];
/** Sensible organisation type when a new organisation is typed for a role. */
export const ROLE_DEFAULT_TYPE: Record<OrganizationRole, OrganizationType> = {
  IMPLEMENTING_AGENCY: 'GOVERNMENT_BUREAU', CONTRACTOR: 'CONTRACTOR', SUPERVISING_CONSULTANT: 'CONSULTANT', FUNDER: 'DONOR', BENEFICIARY_INSTITUTION: 'GOVERNMENT_BUREAU', OVERSIGHT: 'GOVERNMENT_BUREAU',
};
export const SINGLE_ROLES: OrganizationRole[] = ['IMPLEMENTING_AGENCY', 'CONTRACTOR', 'SUPERVISING_CONSULTANT'];
/** Tigray envelope used by the server; mirrored here for instant feedback. */
export const BOUNDS = { latMin: 12.2, latMax: 14.95, lngMin: 36.3, lngMax: 40.1 };

export interface MilestoneRow { key: string; name: string; plannedDate: string; weightPct: string }
export interface BudgetRow { key: string; category: BudgetCategory | ''; allocatedEtb: string }
export interface TrancheRow { key: string; plannedDate: string; amountEtb: string; fundingSource: FundingSource | '' }
export interface OrgRow { key: string; role: OrganizationRole; mode: 'existing' | 'new'; organizationId: number | null; newName: string; newType: OrganizationType | ''; newContact: string }
export interface RiskRow { key: string; title: string; category: string; likelihood: Level; impact: Level; mitigation: string; owner: string }

export interface FormState {
  code: string; codeAuto: boolean; name: string; sector: Sector | ''; description: string; beneficiaries: string; initialStage: LifecycleStage; registrationNote: string;
  zoneId: number | null; weredaId: number | null; latitude: string; longitude: string; facilityIds: number[];
  plannedStart: string; plannedEnd: string; actualStart: string; milestones: MilestoneRow[];
  totalBudgetEtb: string; fundingSource: FundingSource | ''; budgetLines: BudgetRow[]; tranches: TrancheRow[];
  organizations: OrgRow[]; procurementMethod: string; contractValueEtb: string; approvedOn: string; approvalReference: string; fundingSecuredOn: string; contractSignedOn: string;
  risks: RiskRow[];
  /** Verified damage assessments the project responds to (set when registering from a need). */
  assessmentIds: number[];
}

let seq = 0;
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyForm = (): FormState => ({
  code: '', codeAuto: true, name: '', sector: '', description: '', beneficiaries: '', initialStage: 'PLANNING', registrationNote: '',
  zoneId: null, weredaId: null, latitude: '', longitude: '', facilityIds: [],
  plannedStart: '', plannedEnd: '', actualStart: '', milestones: [],
  totalBudgetEtb: '', fundingSource: '', budgetLines: [], tranches: [],
  organizations: [{ key: rowKey(), role: 'IMPLEMENTING_AGENCY', mode: 'existing', organizationId: null, newName: '', newType: 'GOVERNMENT_BUREAU', newContact: '' }],
  procurementMethod: '', contractValueEtb: '', approvedOn: '', approvalReference: '', fundingSecuredOn: '', contractSignedOn: '',
  risks: [],
  assessmentIds: [],
});

/* ─── Number & date helpers ───────────────────────────────────────────────── */
export const toNum = (s: string): number | null => { const t = s.replace(/[, ]/g, ''); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
export const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
export const isoToday = () => new Date().toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
export const addDays = (iso: string, d: number) => new Date(day(iso) + d * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / 86_400_000);
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(day(s));
export const monthsBetween = (a: string, b: string) => Math.max(0, Math.round(daysBetween(a, b) / 30.44));
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Templates ───────────────────────────────────────────────────────────── */
const MILESTONE_TEMPLATES: Record<Sector, [string, number][]> = {
  EDUCATION: [['Site mobilisation & demolition', 10], ['Substructure complete', 20], ['Superstructure complete', 30], ['Roofing & finishes', 20], ['Furniture, water & sanitation', 10], ['Handover to education bureau', 10]],
  HEALTH: [['Site mobilisation & demolition', 10], ['Substructure complete', 15], ['Superstructure complete', 25], ['Finishes & MEP installation', 20], ['Medical equipment installed & tested', 20], ['Commissioning & handover', 10]],
  MANUFACTURING: [['Damage audit & salvage', 10], ['Civil & structural works', 25], ['Machinery procured & delivered', 25], ['Installation & utilities', 20], ['Trial production', 10], ['Commissioning & handover', 10]],
  AGRICULTURE: [['Survey & design validation', 10], ['Earthworks', 25], ['Structures & civil works', 30], ['Equipment & inputs delivered', 15], ['Community training', 10], ['Handover to users', 10]],
};
/** Milestones from the sector template, dated along the schedule by cumulative weight. */
export function milestoneTemplate(sector: Sector, start: string, end: string): MilestoneRow[] {
  const span = daysBetween(start, end);
  let cum = 0;
  return MILESTONE_TEMPLATES[sector].map(([name, w]) => { cum += w; return { key: rowKey(), name, weightPct: String(w), plannedDate: addDays(start, Math.round((span * cum) / 100)) }; });
}
/** Re-dates existing milestones by cumulative weight (keeps names and weights). */
export function distributeMilestones(rows: MilestoneRow[], start: string, end: string): MilestoneRow[] {
  const span = daysBetween(start, end);
  const total = sum(rows.map((r) => toNum(r.weightPct))) || 100;
  let cum = 0;
  return rows.map((r) => { cum += toNum(r.weightPct) ?? 0; return { ...r, plannedDate: addDays(start, Math.round((span * cum) / total)) }; });
}
export const STANDARD_SPLIT: [BudgetCategory, number][] = [['WORKS', 75], ['GOODS', 8], ['SERVICES', 4], ['SUPERVISION', 5], ['CONTINGENCY', 8]];
export function budgetSplit(total: number): BudgetRow[] {
  let used = 0;
  return STANDARD_SPLIT.map(([c, p], i) => {
    const v = i === STANDARD_SPLIT.length - 1 ? round2(total - used) : round2(Math.round((total * p) / 100));
    used += v;
    return { key: rowKey(), category: c, allocatedEtb: String(v) };
  });
}
export type TrancheTemplate = 'advance' | 'quarterly' | 'single';
export function trancheTemplate(kind: TrancheTemplate, total: number, start: string, end: string, source: FundingSource | ''): TrancheRow[] {
  const span = daysBetween(start, end);
  const make = (share: number, at: number): TrancheRow => ({ key: rowKey(), plannedDate: addDays(start, Math.round(span * at)), amountEtb: String(round2(total * share)), fundingSource: source });
  if (kind === 'single') return [make(1, 0)];
  if (kind === 'advance') {
    const rows = [make(0.3, 0), make(0.4, 0.45), make(0.3, 0.85)];
    rows[2].amountEtb = String(round2(total - (toNum(rows[0].amountEtb) ?? 0) - (toNum(rows[1].amountEtb) ?? 0)));
    return rows;
  }
  const n = Math.max(1, Math.min(24, Math.ceil(span / 91)));
  const each = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({ key: rowKey(), plannedDate: addDays(start, Math.round((span * i) / n)), amountEtb: String(i === n - 1 ? round2(total - each * (n - 1)) : each), fundingSource: source }));
}
export const RISK_SUGGESTIONS: Record<Sector | 'COMMON', Omit<RiskRow, 'key' | 'owner'>[]> = {
  COMMON: [
    { title: 'Cement, rebar and fuel supply delays', category: 'SUPPLY', likelihood: 'HIGH', impact: 'MEDIUM', mitigation: 'Pre-order long-lead materials; agree price-adjustment clauses.' },
    { title: 'Inflation erodes the approved budget', category: 'FINANCIAL', likelihood: 'HIGH', impact: 'HIGH', mitigation: 'Hold an indexed contingency; re-baseline costs at each tranche.' },
    { title: 'Insecurity restricts site access', category: 'SECURITY', likelihood: 'MEDIUM', impact: 'HIGH', mitigation: 'Coordinate access with local administration; plan remote verification.' },
    { title: 'Contractor capacity overstretched', category: 'RESOURCE', likelihood: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Check the contractor’s active portfolio before award; monitor workforce.' },
  ],
  EDUCATION: [{ title: 'Classes displaced during works', category: 'SOCIAL', likelihood: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Phase works; provide temporary learning spaces.' }],
  HEALTH: [{ title: 'Medical equipment import lead time', category: 'PROCUREMENT', likelihood: 'HIGH', impact: 'HIGH', mitigation: 'Tender equipment in parallel with civil works.' }],
  MANUFACTURING: [{ title: 'Foreign-currency shortage for imported machinery', category: 'MARKET', likelihood: 'HIGH', impact: 'HIGH', mitigation: 'Secure FX allocation before contract award.' }],
  AGRICULTURE: [{ title: 'Rainy season halts earthworks', category: 'ENVIRONMENT', likelihood: 'HIGH', impact: 'MEDIUM', mitigation: 'Schedule earthworks for the dry season (Oct–May).' }],
};
export const riskScore = (r: Pick<RiskRow, 'likelihood' | 'impact'>) => (LEVELS.indexOf(r.likelihood) + 1) * (LEVELS.indexOf(r.impact) + 1);

/* ─── Which step owns which field ─────────────────────────────────────────── */
export function stepOf(field: string): StepKey {
  const f = field.replace(/\[.*$/, '').replace(/\..*$/, '');
  if (['code', 'name', 'sector', 'description', 'beneficiaries', 'initialStage', 'registrationNote'].includes(f)) return 'basics';
  if (['weredaId', 'zoneId', 'latitude', 'longitude', 'facilityIds', 'assessmentIds'].includes(f)) return 'location';
  if (['plannedStart', 'plannedEnd', 'actualStart', 'milestones'].includes(f)) return 'schedule';
  if (['totalBudgetEtb', 'fundingSource', 'budgetLines', 'tranches'].includes(f)) return 'budget';
  if (['organizations', 'procurementMethod', 'contractValueEtb', 'approvedOn', 'approvalReference', 'fundingSecuredOn', 'contractSignedOn'].includes(f)) return 'parties';
  if (f === 'risks') return 'risks';
  return 'review';
}

/* ─── Client validation (instant feedback; the server re-checks everything) ─ */
export type Errors = Record<string, string>;
export interface Msg { (key: string, values?: Record<string, string | number>): string }

export function validateStep(step: StepKey, s: FormState, m: Msg): Errors {
  const e: Errors = {};
  const today = isoToday();
  const rank = stageRank(s.initialStage);
  const total = toNum(s.totalBudgetEtb);
  if (step === 'basics') {
    if (s.name.trim().length < 5) e.name = m('v.nameShort');
    if (!s.sector) e.sector = m('v.required');
    if (!s.codeAuto && s.code && !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(s.code)) e.code = m('v.codeFormat');
    if (s.beneficiaries && (toNum(s.beneficiaries) === null || (toNum(s.beneficiaries) ?? 0) < 0)) e.beneficiaries = m('v.number');
  }
  if (step === 'location') {
    if (!s.weredaId) e.weredaId = m('v.required');
    const lat = toNum(s.latitude), lng = toNum(s.longitude);
    if ((s.latitude === '') !== (s.longitude === '')) e[s.latitude ? 'longitude' : 'latitude'] = m('v.bothCoords');
    if (s.latitude && (lat === null || lat < BOUNDS.latMin || lat > BOUNDS.latMax)) e.latitude = m('v.latRange', { min: BOUNDS.latMin, max: BOUNDS.latMax });
    if (s.longitude && (lng === null || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax)) e.longitude = m('v.lngRange', { min: BOUNDS.lngMin, max: BOUNDS.lngMax });
  }
  if (step === 'schedule') {
    if (!validDate(s.plannedStart)) e.plannedStart = m('v.required');
    if (!validDate(s.plannedEnd)) e.plannedEnd = m('v.required');
    else if (validDate(s.plannedStart) && daysBetween(s.plannedStart, s.plannedEnd) <= 0) e.plannedEnd = m('v.endAfterStart');
    else if (validDate(s.plannedStart) && daysBetween(s.plannedStart, s.plannedEnd) > 3652) e.plannedEnd = m('v.tooLong');
    if (rank >= 4) { if (!validDate(s.actualStart)) e.actualStart = m('v.requiredForStage'); else if (s.actualStart > today) e.actualStart = m('v.notFuture'); }
    if (!s.milestones.length) e.milestones = m('v.oneMilestone');
    const names = new Set<string>();
    s.milestones.forEach((r, i) => {
      if (!r.name.trim()) e[`milestones[${i}].name`] = m('v.required');
      else if (names.has(r.name.trim().toLowerCase())) e[`milestones[${i}].name`] = m('v.unique');
      names.add(r.name.trim().toLowerCase());
      if (!validDate(r.plannedDate)) e[`milestones[${i}].plannedDate`] = m('v.required');
      else if (validDate(s.plannedStart) && validDate(s.plannedEnd) && (r.plannedDate < s.plannedStart || r.plannedDate > s.plannedEnd)) e[`milestones[${i}].plannedDate`] = m('v.withinSchedule');
      const w = toNum(r.weightPct);
      if (w === null || w <= 0 || w > 100) e[`milestones[${i}].weightPct`] = m('v.weight');
    });
    const ws = sum(s.milestones.map((r) => toNum(r.weightPct)));
    if (s.milestones.length && Math.abs(ws - 100) > 0.05) e.milestones = m('v.weightsSum', { value: round2(ws) });
  }
  if (step === 'budget') {
    if (total === null || total < 1000) e.totalBudgetEtb = m('v.budgetMin');
    if (!s.fundingSource) e.fundingSource = m('v.required');
    const cats = new Set<string>();
    s.budgetLines.forEach((r, i) => {
      if (!r.category) e[`budgetLines[${i}].category`] = m('v.required');
      else if (cats.has(r.category)) e[`budgetLines[${i}].category`] = m('v.unique');
      cats.add(r.category);
      if (toNum(r.allocatedEtb) === null || (toNum(r.allocatedEtb) ?? 0) < 0) e[`budgetLines[${i}].allocatedEtb`] = m('v.number');
    });
    const alloc = sum(s.budgetLines.map((r) => toNum(r.allocatedEtb)));
    if (s.budgetLines.length && total !== null && Math.abs(alloc - total) > 1) e.budgetLines = m('v.linesSum');
    s.tranches.forEach((r, i) => {
      if (!validDate(r.plannedDate)) e[`tranches[${i}].plannedDate`] = m('v.required');
      if (!(toNum(r.amountEtb) ?? 0)) e[`tranches[${i}].amountEtb`] = m('v.number');
    });
    if (total !== null && sum(s.tranches.map((r) => toNum(r.amountEtb))) - total > 1) e.tranches = m('v.tranchesExceed');
  }
  if (step === 'parties') {
    const roles: Record<string, number> = {};
    s.organizations.forEach((o, i) => {
      roles[o.role] = (roles[o.role] ?? 0) + 1;
      if (o.mode === 'existing' && !o.organizationId) e[`organizations[${i}].organizationId`] = m('v.chooseOrg');
      if (o.mode === 'new' && o.newName.trim().length < 2) e[`organizations[${i}].newName`] = m('v.required');
      if (o.mode === 'new' && !o.newType) e[`organizations[${i}].newType`] = m('v.required');
    });
    SINGLE_ROLES.forEach((r) => { if ((roles[r] ?? 0) > 1) e.organizations = m('v.singleRole'); });
    if (!roles.IMPLEMENTING_AGENCY) e.organizations = m('v.needAgency');
    else if (rank >= 4 && !roles.CONTRACTOR) e.organizations = m('v.needContractor');
    const need = (field: keyof FormState, from: number) => { if (rank >= from && !String(s[field]).trim()) e[field] = m('v.requiredForStage'); };
    need('approvedOn', 2); need('approvalReference', 2); need('fundingSecuredOn', 3); need('procurementMethod', 3); need('contractSignedOn', 4); need('contractValueEtb', 4);
    (['approvedOn', 'fundingSecuredOn', 'contractSignedOn'] as const).forEach((f) => { if (s[f] && s[f] > today) e[f] = m('v.notFuture'); });
    if (s.approvedOn && s.fundingSecuredOn && s.fundingSecuredOn < s.approvedOn) e.fundingSecuredOn = m('v.afterApproval');
    if (s.fundingSecuredOn && s.contractSignedOn && s.contractSignedOn < s.fundingSecuredOn) e.contractSignedOn = m('v.afterFunding');
    const cv = toNum(s.contractValueEtb);
    if (cv !== null && total !== null && cv > total) e.contractValueEtb = m('v.contractExceeds');
  }
  if (step === 'risks') {
    s.risks.forEach((r, i) => {
      if (!r.title.trim()) e[`risks[${i}].title`] = m('v.required');
      if (!r.category) e[`risks[${i}].category`] = m('v.required');
    });
  }
  return e;
}

export const validateAll = (s: FormState, m: Msg): Errors => STEPS.slice(0, -1).reduce<Errors>((acc, st) => ({ ...acc, ...validateStep(st, s, m) }), {});

/** Values beyond the chosen stage are dropped rather than sent, so changing the stage back never leaves stale governance data. */
export function toRequest(s: FormState): CreateProjectRequest {
  const rank = stageRank(s.initialStage);
  const keep = <T,>(from: number, v: T) => (rank >= from ? v : null);
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    code: s.codeAuto ? null : blank(s.code), name: s.name.trim(), sector: s.sector as Sector, weredaId: s.weredaId as number,
    description: blank(s.description), beneficiaries: toNum(s.beneficiaries), latitude: toNum(s.latitude), longitude: toNum(s.longitude),
    initialStage: s.initialStage, plannedStart: s.plannedStart, plannedEnd: s.plannedEnd, actualStart: keep(4, blank(s.actualStart)),
    totalBudgetEtb: toNum(s.totalBudgetEtb) ?? 0, fundingSource: s.fundingSource as FundingSource,
    procurementMethod: keep(3, blank(s.procurementMethod)), contractValueEtb: keep(4, toNum(s.contractValueEtb)),
    approvedOn: keep(2, blank(s.approvedOn)), approvalReference: keep(2, blank(s.approvalReference)), fundingSecuredOn: keep(3, blank(s.fundingSecuredOn)), contractSignedOn: keep(4, blank(s.contractSignedOn)),
    registrationNote: blank(s.registrationNote),
    organizations: s.organizations.map((o) => o.mode === 'existing'
      ? { role: o.role, organizationId: o.organizationId }
      : { role: o.role, newName: o.newName.trim(), newType: (o.newType || null) as OrganizationType | null, newContact: blank(o.newContact) }),
    milestones: s.milestones.map((r) => ({ name: r.name.trim(), plannedDate: r.plannedDate, weightPct: toNum(r.weightPct) ?? 0 })),
    budgetLines: s.budgetLines.filter((r) => r.category).map((r) => ({ category: r.category as BudgetCategory, allocatedEtb: toNum(r.allocatedEtb) ?? 0 })),
    tranches: s.tranches.map((r) => ({ plannedDate: r.plannedDate, amountEtb: toNum(r.amountEtb) ?? 0, fundingSource: (r.fundingSource || null) as FundingSource | null })),
    facilityIds: s.facilityIds,
    assessmentIds: s.assessmentIds,
    risks: s.risks.map((r) => ({ title: r.title.trim(), category: r.category, likelihood: r.likelihood, impact: r.impact, mitigation: blank(r.mitigation), owner: blank(r.owner) })),
  };
}

/** True once the user has typed anything worth keeping as a draft. */
export const isDirty = (s: FormState) => Boolean(s.name || s.sector || s.weredaId || s.plannedStart || s.totalBudgetEtb || s.milestones.length || s.risks.length || s.description);

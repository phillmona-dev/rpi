# 10 · Damage Assessment Campaigns

**Date:** 28 October 2026 · **Status:** implemented (Flyway `V7__damage_assessment_campaigns.sql`)

Reconstruction in Tigray starts from a damage assessment: before a project is registered, the damaged
facility is visited, its condition recorded, and the finding checked by someone other than the person
who recorded it. Before this increment RPIS only kept a flat list of assessments that updated the
facility register the moment they arrived. This record describes the workflow that replaces it.

## 1. Workflow

```
Campaign  PLANNING ──start──▶ ACTIVE ──close fieldwork──▶ REVIEW ──endorse──▶ COMPLETED
            │ scope (weredas), team, sites     │ assess + verify        │ sector head / CE
            └────────────── cancel ────────────┘                        └─return──▶ ACTIVE

Site task  PLANNED ─assign─▶ ASSIGNED ─▶ IN_PROGRESS ─submit─▶ SUBMITTED ─verify─▶ VERIFIED
                                  │                                  │ return ▲ revise
                                  └─▶ INACCESSIBLE / CANCELLED       └─▶ RETURNED
                                                                     └─reject─▶ back to ASSIGNED (fresh visit)
```

- **Campaign** (`assessment_campaign`, code `DA-YYYY-NNN`): a planned round over a set of weredas, for one
  sector or several, with a coordinator, dates, objective and method.
- **Team** (`assessment_campaign_member`): field agents from the Field Team module in campaign roles.
  A person may hold several roles.
- **Site** (`assessment_task`): one facility per campaign, with an assessor, an optional named verifier,
  due date, priority and instructions. Facilities found in the field are registered from the campaign.
- **Assessment** (`damage_assessment`, extended): severity and structural score, functional capacity,
  access and safety (UXO), current use (e.g. IDP shelter), causes, per-element condition and repair cost
  (`assessment_component`), costs, recommended response and priority, people affected, photos, GPS.
- **Activity log** (`assessment_event`): every campaign, site and review step with actor and note.

## 2. Roles and separation of duties

| Who | May |
|---|---|
| Analyst, Administrator | Plan, edit, start, close and cancel campaigns; manage team and sites; record or revise on an assessor's behalf (paper forms); verify assessments they did not record; register projects from verified needs |
| Team lead (field) | Record or verify any site of the campaign |
| Assessor, Engineer (field) | Record and revise their own sites; report a site inaccessible |
| Verifier (field) | Verify, return or reject submissions in the campaign |
| Sector head | Verify assessments in their sector; endorse sector campaigns |
| Chief Executive | Endorse any campaign (the only endorser of multi-sector campaigns) |
| Federal PMO observer | Read only; field staff phone numbers are hidden |

Rules enforced on the server: nobody verifies an assessment they recorded or a site they were assigned to
assess; a site's assessor and verifier are different people; team leads and verifiers must be field
analysts or supervisors; the endorser is neither the campaign's coordinator nor its creator. Fieldwork can
only start with sites, an assessor on every site, and at least one verifier; it can only close when every
site is verified, inaccessible or removed.

## 3. What verification changes

Only **verified** assessments update the facility register (latest severity, operational status,
replacement estimate), feed campaign results, and become **verified needs**. A late verification of an
older visit never overwrites a newer verified picture. Assessments recorded by system feeds without a
signed-in person (demo simulator, imports) are taken as verified, as before.

## 4. From need to project

`GET /damage/needs` lists the latest verified finding of each damaged facility that no live project
covers, highest priority first. "Register project" opens the registration wizard pre-filled from the
assessment (sector, wereda, facility, coordinates, people affected, cost estimate, a description of the
finding) and sends `assessmentIds` with the request. Registration then:

- **rejects** an assessment that is not verified, is already the basis of a live project, or belongs to
  another sector, and **rejects** linking a facility that has no verified assessment;
- **warns** when no assessment or facility is linked at all, or the assessment recommends no action;
- links the assessment to the project (`damage_assessment.project_id`) and its facility to the project.

The approval dossier gains the readiness check **Damage verified by assessment**.

## 5. API

`/api/v1/damage/overview`, `/needs`, `/campaigns` (CRUD, `start`, `close-fieldwork`, `endorse`, `cancel`,
`results`, `activity`, `members`, `member-candidates`, `tasks`, `site-candidates`, `sites`, `facilities`,
`assign`), `/tasks/mine`, `/tasks/{id}`, `/tasks/{id}/status`, `/assessments` (search with `status`,
`campaignId`, `facilityId`; create; `PUT` revise; `POST {id}/review`). The field app keeps using
`POST /sync/damage-assessments`; items may now carry `taskId` and the new fields.

## 6. Notifications

Assessor: new sites, verified / returned / rejected. Verifier (else coordinator, else sector analysts):
submissions and resubmissions. Coordinator: site inaccessible, campaign endorsed or returned. Executives
and sector heads: campaign ready for endorsement. Team: added to a campaign, fieldwork started.

## 7. Open points

- Photo upload on the web uses the existing media tickets; thumbnails and offline capture wait for the field app.
- Component catalogue and score bands (`components/damage/shared.tsx`) should be reviewed with the sector bureaus.
- The executive stream and "assessments received" counts still include unverified submissions (they report intake).

# 02 · Information Architecture & Executive UX

## Design principles
1. **One screen answers "where do we stand, what is broken, what must I decide today".** The overview is a complete briefing without scrolling on a 1440 px desktop; depth is one click away.
2. **Three-level drill-down, always visible as breadcrumbs:** Region → Sector or Zone/Wereda → Project / Facility.
3. **Status language is uniform across the system:** `ON_TRACK`, `AT_RISK`, `DELAYED`, `STALLED`, `COMPLETED`, `NOT_STARTED`, `SUSPENDED`. Colours are semantic (green / amber / red / grey) and always paired with text or an icon (WCAG 1.4.1).
4. **Numbers carry context.** Every KPI shows the comparison (vs plan, vs last period) and a freshness timestamp.
5. **Nothing dead-ends.** Every table row, map symbol and chart segment navigates somewhere.
6. **Desktop first, tablet complete.** Layout grid: 12 columns ≥1280 px, 8 columns 1024–1279 px (tablet landscape), 4 columns 768–1023 px (tablet portrait). Minimum touch target 40 px.

## Navigation (left rail, collapsible, grouped)
| Group | Item | Route | Audience |
|---|---|---|---|
| Command | Command Center | `/` | all |
| Command | Decision Support (signals, action cards, risk register, comparisons, funding priorities, predictive insights) | `/intelligence` | all |
| Command | Geospatial Command (layered map: boundaries, weredas, projects, facilities, evidence) | `/map` | all |
| Command | Decision Queue (Alerts) | `/alerts` | all (actions: EXECUTIVE, SECTOR_HEAD, ANALYST, ADMIN) |
| Analysis | Field Evidence (inspections, verification, gallery) | `/evidence` | all (verify: EXECUTIVE, SECTOR_HEAD, ANALYST, ADMIN) |
| Records | Reports (typed, periodised, CSV export, print, run history) | `/reports` | EXECUTIVE, ANALYST, PMO_FEDERAL, ADMIN, SECTOR_HEAD |

Original items (unchanged routes):
| Item | Route | Audience |
|---|---|---|
| Sectors → Education / Health / Manufacturing / Agriculture | `/sectors/{sector}` | all (sector heads land here) |
| Geography → Zones → Weredas | `/geography`, `/zones/{id}`, `/weredas/{id}` | all |
| Projects | `/projects`, `/projects/{id}` | all |
| Facilities & Damage | `/facilities`, `/facilities/{id}`, `/damage` | all |
| Finance | `/finance` | EXECUTIVE, ANALYST, PMO_FEDERAL, ADMIN |
| Decision Queue (Alerts) | `/alerts` | all (actions: EXECUTIVE, SECTOR_HEAD, ADMIN) |
| Daily Brief | `/briefing` | EXECUTIVE, ANALYST, PMO_FEDERAL, ADMIN |
| Administration → Users, Audit Log | `/admin/users`, `/admin/audit` | ADMIN (audit also EXECUTIVE) |

Top bar: global search (⌘K), live-connection indicator, language switcher (EN / አማ / ትግ), notifications, user menu.

## Screen inventory

### Command Center (`/`)
The page is ordered to answer, in sequence: *What is happening? → Where? → Why? → What is at risk? → What requires my decision?*
Row 1 – Executive KPI strip (6 tiles): Active projects · Overall physical progress vs plan · Budget disbursed / allocated · Expenditure certified · Facilities restored / damaged · Decisions pending.
Row 1b – *Requires your attention*: early-warning signal strip (10 indicators, each explained on hover and linked to its view) and the top four executive action cards (what, evidence, suggested action, open alert / entity).
Row 2 – Left: *Decision Queue* (top 5 critical/high alerts with one-click open). Right: *Sector summary* (4 cards: projects, progress, budget utilisation, delayed count, trend sparkline).
Row 3 – Left (8 cols): *Map* (proportional symbols per wereda, metric switch: damage severity / projects delayed / progress). Right (4 cols): *Wereda heat table* sorted by the same metric.
Row 4 – *Progress S-curve* (planned vs actual, regional) · *Budget utilisation by sector* (allocated / disbursed / spent) · *Live incident & progress stream*.
Row 5 – *Delayed & at-risk projects* table (top 10, sortable).

### Sector view (`/sectors/{sector}`)
KPI strip scoped to sector → facility status by type (stacked bar) → projects by status (donut) + wereda breakdown table → projects table with filters → damage assessments for the sector.

### Wereda view (`/weredas/{id}`)
Header with zone breadcrumb and population → KPIs → map focused on wereda → facilities list grouped by sector with damage score and project status → projects table → recent field reports.

### Project detail (`/projects/{id}`) — the project passport
Header: name, sector, wereda, contractor, status, health, composite risk chip, open alerts, freshness.
Lifecycle stepper: Planning → Approval → Funding → Procurement → Implementation → Monitoring → Completion with dates; authorised roles move the stage (validated, audited, with reference and note).
Tabs: Overview (progress curve, milestones, scope, facilities, composite risk components, evidence snapshot, site map with geotagged evidence, governance dates and responsible organisations) · Timeline (unified passport stream: stages, milestones, reports, disbursements, alerts, decisions, inspections, documents) · Evidence (gallery, inspections, verification, site map) · Intelligence (risk breakdown, delay / completion / cost / supply insights, anomalies, forecast history, provider disclaimer) · Milestones · Progress log · Finance · Risks & Issues · Documents & media · Audit trail.

### Geospatial Command (`/map`)
Left panel: layer toggles, colour mode for projects (health / risk / progress / sector) and facilities (severity / operational / sector), filters (sector, zone, health, status, minimum risk, severity, unaddressed-only), legend. Map: clustered project symbols sized by budget, facility points, boundary polygons when loaded, evidence points for the selected entity. Selection card: key figures and a path to the detail page.

### Decision Support (`/intelligence`)
Signal strip → tabs: Briefing (ranked action cards) · Risk register (composite score with component drivers) · Comparisons (sector, zone, contractor performance with rank) · Funding priorities (unaddressed severe damage ranked by reach per ETB and severity) · Predictive insights (rule-based today, AI-labelled later; human review recorded).

### Field Evidence (`/evidence`)
Inspections table (type, inspector, observed vs reported, gap, ratings, distance from site, media, verification) with drawer (findings, media, verify / dispute / reject) · Gallery (all media newest first with geotag / timestamp / verification badges, lightbox with metadata).

### Reports (`/reports`)
Report type catalogue with descriptions · period (daily / weekly / monthly / quarterly / custom) · scope (sector, zone, wereda, project) · rendered report (KPI grids, tables, lists) · Export CSV (Excel) · Print / PDF · generation history with content digest.

### Facility detail (`/facilities/{id}`)
Facility profile → latest damage assessment (impact score, structural score, inventory loss, replacement estimate, photos) → assessment history → linked projects → site map (facility and geotagged evidence) → evidence summary and gallery → inspections with verification.

### Decision Queue (`/alerts`)
Filter by severity / sector / status. Row: rule, entity, triggered date, age. Drawer: context, rule explanation, actions (Acknowledge, Assign, Resolve with note). Federal role sees read-only.

### Finance (`/finance`)
Allocation vs disbursement vs expenditure by sector, by funding source, by zone; disbursement pipeline (pending releases); projects with cost variance > threshold.

### Daily Brief (`/briefing`)
Print-optimised one-pager: headline numbers, changes in last 24 h / 7 d, new critical alerts, decisions taken, projects completed, projects newly delayed. "Print / Save as PDF" button.

## States every data panel implements
Loading (skeleton matching layout) · Empty (explanatory, with next action) · Error (retry, correlation id) · Stale (amber "last updated" chip when data older than threshold) · Live (green pulse when a WebSocket update was applied in the last 30 s) · Offline (banner under the top bar while the browser is offline; cached data stays visible, actions disabled).

## Accessibility & usability commitments
- Keyboard-operable navigation, tables and drawers; visible focus rings; skip-to-content link.
- Colour contrast ≥ 4.5:1 for text, ≥ 3:1 for UI components; status never conveyed by colour alone.
- Charts expose a data table alternative (toggle) and `aria-label` summaries.
- `prefers-reduced-motion` respected (no pulse / transitions).
- Ethiopic script rendered with Noto Sans Ethiopic; number and date formatting through `Intl` per locale.
- Font sizes 14 px minimum in dense tables, 16 px body.

## Localisation strategy
- All UI strings in `frontend/messages/{en,am,ti}.json` (ICU message format).
- Domain enumerations (sector, status, severity, facility type) are translated client-side from stable codes returned by the API; the API never returns display text.
- Dates: API returns ISO-8601 UTC; client formats per locale. Ethiopian calendar display is a planned toggle (library hook present, not enabled by default).
- Currency: ETB with `Intl.NumberFormat`; large numbers abbreviated (M / B) with full value in tooltips.

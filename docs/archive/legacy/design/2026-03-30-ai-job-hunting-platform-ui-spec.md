# AI Job Hunting Platform UI And UX Spec

Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)  
Document status: Proposed frontend experience and interface architecture for `apps/jobs-ops`.

## 1. Product Surface

`apps/jobs-ops` is an operator console, not a marketing site. The interface should feel like a control room for opportunity operations: dense, fast, explainable, and calm under pressure.

The visual target is premium enterprise operations software rather than a consumer job board.

## 2. Frontend Stack

Recommended stack, aligned with the repo direction:

- Bun
- React 18
- TypeScript
- Vite
- TanStack Query
- Zustand
- React Hook Form plus Zod
- Tailwind plus Radix UI
- Recharts for analytics

## 3. Design Direction

### Look and feel

- high-density desktop-first operator layout
- mobile-friendly review mode for alerts and approvals
- deliberate contrast and status colors
- restrained motion that clarifies system state
- strong evidence and timeline views

### Typography

- headings: `Space Grotesk`
- body and data tables: `IBM Plex Sans`
- tabular numeric views: `IBM Plex Mono`

### Color system

Use semantic tokens, not raw hex in components.

| Token | Role |
| --- | --- |
| `bg.canvas` | warm near-white main background |
| `bg.panel` | pale slate panel background |
| `fg.default` | deep graphite text |
| `fg.muted` | subdued operational text |
| `accent.primary` | cobalt for active controls and links |
| `accent.success` | deep teal for healthy or approved states |
| `accent.warning` | amber for caution and review states |
| `accent.danger` | oxblood red for blocked or failed states |
| `accent.insight` | pine green for AI explanations and strategy callouts |

This deliberately avoids generic purple-on-white dashboard styling.

## 4. App Information Architecture

Primary navigation:

- Overview
- Jobs Inbox
- Job Detail
- Job Applications
- Automation Runs
- Outreach CRM
- Email Ops
- Resume Lab
- Integrations
- Source Health
- Reports
- Review Workbench
- Audit Log

Secondary utility surfaces:

- global command palette
- notification center
- quick approve tray
- pinned opportunities rail

## 5. Route Map

Illustrative route tree:

```tsx
// illustrative only
/
/jobs
/jobs/:jobId
/job-applications
/job-applications/:applicationId
/automation/runs
/automation/runs/:runId
/outreach/contacts
/outreach/campaigns
/email/threads
/documents/resumes
/documents/variants
/integrations
/sources
/reports
/review
/audit
```

## 6. Page Specifications

### Overview

Purpose:

- current funnel state
- urgent approvals
- new high-match jobs
- response summary
- source health

Widgets:

- funnel trend
- approvals queue
- top matches
- recent replies
- adapter health grid
- daily digest preview

### Jobs Inbox

Purpose:

- triage discovered jobs quickly
- compare fit and urgency
- batch approve or dismiss

Required modules:

- saved filters
- dense table plus card toggle
- bulk actions
- AI explanation preview
- risk badges
- salary and geography chips

### Job Detail

Purpose:

- one canonical operating view for a single role

Required modules:

- job description
- fit explanation
- document recommendations
- company research
- application timeline
- source lineage
- activity feed
- related contacts

### Review Workbench

Purpose:

- handle ambiguous or risky work fast

Required modules:

- side-by-side original text and AI proposal
- redline diff
- approve, edit, or reject actions
- blocker explanation
- evidence drawer

### Resume Lab

Purpose:

- manage master resume, variants, templates, and generated assets

Required modules:

- master resume
- variant catalog
- cover letter templates
- answer bank
- change history

## 7. Layout Model

### Desktop

- left rail for primary navigation
- top utility bar for search, command palette, notifications, and global status
- main content region with adaptive grid
- optional right context rail for evidence, activity, or AI assistant

### Mobile

- bottom sheet or stacked review patterns
- compact status chips
- sticky action bar for approve, pause, resume, and send
- avoid horizontal overflow in tables by switching to stacked record cards

## 8. Key UX Patterns

### Job triage pattern

- keyboard-friendly table navigation
- open job detail in split pane or full page
- support quick actions without losing filter state

### Evidence-first automation pattern

- every run displays current step, last successful step, next checkpoint, and artifacts
- blocked steps show clear reason and required human action

### AI explainability pattern

- show `why this job fits`
- show `what is missing`
- show `what changed in the generated document`
- show `why automation paused`

### Timeline pattern

- one timeline model across jobs, applications, outreach, and email threads
- each event entry supports status, actor, timestamp, and attached evidence

## 9. Frontend Component Architecture

Suggested app structure:

```text
apps/jobs-ops/
  src/
    app/
      router.tsx
      providers.tsx
      layout/
    features/
      jobs/
      job-applications/
      automation/
      outreach/
      email/
      documents/
      integrations/
      analytics/
      review/
      audit/
    components/
      data-display/
      evidence/
      feedback/
      navigation/
    services/
    stores/
    lib/
    styles/
```

Recommended state split:

- TanStack Query for server state
- Zustand for local operator state, command palette state, pinned items, and draft UI filters
- React Hook Form plus Zod for editing flows and approval forms

## 10. Required Components

- `JobsTable`
- `JobFitExplanationCard`
- `OpportunityTimeline`
- `EvidenceDrawer`
- `AutomationRunStepper`
- `ResumeDiffViewer`
- `ApprovalBar`
- `HealthStatusGrid`
- `OutreachComposer`
- `DigestPreviewPanel`
- `CommandPalette`

Illustrative shell:

```tsx
<JobsOpsShell>
  <PrimarySidebar />
  <TopUtilityBar />
  <RouteOutlet />
  <NotificationCenter />
  <CommandPalette />
</JobsOpsShell>
```

## 11. Accessibility Rules

- full keyboard support for inbox, detail, and review workbench
- visible focus states on every actionable element
- 44px minimum touch targets on mobile review actions
- semantic color never used as the only signal
- diff views and charts require text labels and legends
- command palette and modals must trap focus and restore it correctly

## 12. Motion Rules

- 150ms to 250ms for micro interactions
- use opacity and transform, not layout-affecting animation
- stagger only lists that benefit from state comprehension
- no decorative animation during critical review tasks

## 13. Frontend Acceptance Criteria

- operator can review high-match jobs, approve tailored documents, and inspect evidence from a phone
- jobs inbox remains usable at dense data volumes
- every critical action has success, error, loading, and undo or recovery states
- diff and evidence views are comprehensible without reading raw JSON
- the UI communicates trust, control, and accountability rather than novelty


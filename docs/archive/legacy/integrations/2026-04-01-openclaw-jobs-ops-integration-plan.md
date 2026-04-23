# OpenClaw Integration Plan For MIHAS Jobs Ops

Date: 2026-04-01  
Product: AI Job Hunting Platform  
Repo: `mihasv3`  
Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)

## Purpose

Integrate OpenClaw into the current `mihasv3` monorepo as a chat-operable orchestration layer for the jobs platform.

OpenClaw should not replace the Django backend or the `apps/jobs-ops` dashboard. It should sit beside them and make the platform more useful in the following ways:

- Telegram-driven control of jobs operations
- mobile-first approvals and status checks
- scheduled agent workflows
- browser-assisted applications on difficult job sites
- faster follow-up and recruiter engagement
- reduced dashboard dependency when the operator is away from a desktop

## Current Repo Fit

The repo already has the right base shape for this:

- frontend dashboard: `apps/jobs-ops/`
- backend API root: `backend/config/urls.py`
- jobs domain: `/api/v1/jobs/`
- jobs applications domain: `/api/v1/job-applications/`
- outreach domain: `/api/v1/outreach/`
- automation domain: `/api/v1/automation/`
- integrations domain: `/api/v1/integrations/`
- analytics domain: `/api/v1/analytics/`
- platform metadata and attribution: `/api/v1/meta/platform/`

OpenClaw should become an operator-facing control plane that talks to the existing Django API instead of bypassing it.

## What OpenClaw Adds

OpenClaw is useful here because it gives the project four things that the current stack does not yet deliver as elegantly:

1. A persistent Telegram control surface
2. A built-in scheduler for agent routines
3. An isolated browser lane for human-in-the-loop application work
4. A plugin system for exposing repo-specific tools

For this project, that means:

- `/jobs today` can become an actual Telegram command backed by the real jobs API
- approvals can be issued from Telegram instead of only the web UI
- daily digest and recruiter follow-up jobs can run on a schedule
- difficult ATS portals can be opened and navigated in an agent-managed browser profile

## Recommended Service Topology

```text
Telegram <-> OpenClaw Gateway <-> mihas-jobs-ops plugin <-> Django API <-> Neon Postgres
                                 |                     |
                                 |                     +-> Celery / Redis
                                 |                     +-> R2 / artifacts
                                 |
                                 +-> OpenClaw cron jobs
                                 +-> OpenClaw isolated browser
```

## Architecture Decision

Keep each system in a narrow role:

### Django Backend

The backend remains authoritative for:

- jobs, job applications, outreach, analytics, review tasks, audit logs
- policy checks and approval thresholds
- durable persistence in Neon
- provider integrations that need central logging and tracking
- evidence, timelines, and compliance history

### Jobs Ops Frontend

`apps/jobs-ops` remains authoritative for:

- operator dashboard UX
- detailed review screens
- side-by-side document and job review
- batch review and workflow operations
- configuration visibility for integrations

### OpenClaw

OpenClaw should own:

- Telegram command and alert routing
- scheduled agent routines
- quick mobile workflows
- browser-assisted sessions for hard application portals
- lightweight orchestration around existing backend APIs

## Integration Model

Use a plugin-centered approach.

Do not teach OpenClaw your business logic directly. Instead:

1. Build a dedicated OpenClaw plugin for MIHAS jobs-ops
2. Have the plugin call your existing Django `/api/v1/...` endpoints
3. Persist all state changes in Django
4. Let OpenClaw remain a channel, tool, and orchestration runtime

## Recommended Monorepo Placement

There are two acceptable placement strategies.

### Preferred

Create a dedicated package in the monorepo:

```text
tools/openclaw-mihas-jobs-ops/
  package.json
  src/
    index.ts
    tools/
    api/
    auth/
    prompts/
  README.md
```

Why:

- keeps plugin code near the product
- makes handoff easier
- allows versioned plugin evolution with the main repo

### Alternative

Create the plugin in a separate repo and publish to npm.

Use this only if you want strict deployment separation between MIHAS and OpenClaw code ownership.

## Backend Additions Needed

The existing backend routes are a good start, but OpenClaw integration will work better if the backend exposes a few machine-oriented surfaces explicitly.

### Add an OpenClaw integration namespace

Recommended new routes under:

- `/api/v1/integrations/openclaw/config/`
- `/api/v1/integrations/openclaw/webhook/`
- `/api/v1/integrations/openclaw/commands/preview/`
- `/api/v1/integrations/openclaw/sessions/`
- `/api/v1/integrations/openclaw/browser-runs/`

Purpose:

- service account bootstrap
- webhook receipt from OpenClaw jobs
- preview of command results before delivery
- correlation between OpenClaw sessions and backend entities
- storage for browser-assisted run metadata

### Add a service-account auth mode for OpenClaw

OpenClaw should not log in as a human operator. It should have a limited machine identity.

Recommended model:

- create a dedicated backend token or signed service credential for OpenClaw
- give it scoped permissions
- restrict what it can mutate without explicit approval flags

Minimum scopes:

- read jobs
- read and update review tasks
- read and update job applications
- create audit entries
- send safe commands to automation endpoints
- create browser session records

### Add first-class approval endpoints

Telegram approvals should hit explicit API routes rather than generic update endpoints.

Recommended actions:

- `POST /api/v1/job-applications/{id}/approve/`
- `POST /api/v1/job-applications/{id}/pause/`
- `POST /api/v1/job-applications/{id}/resume/`
- `POST /api/v1/jobs/{id}/dismiss/`
- `POST /api/v1/automation/runs/{id}/pause/`
- `POST /api/v1/automation/runs/{id}/resume/`
- `POST /api/v1/outreach/messages/{id}/approve/`
- `POST /api/v1/outreach/messages/{id}/send/`

### Add delivery-oriented digest endpoints

OpenClaw is strongest when it can fetch a prepared summary instead of prompting from raw data every time.

Recommended read endpoints:

- `GET /api/v1/reports/daily-digest/?channel=telegram`
- `GET /api/v1/reports/weekly-strategy/?channel=telegram`
- `GET /api/v1/analytics/top-matches/?limit=10`
- `GET /api/v1/review/pending/?surface=telegram`

## Plugin Tool Surface

The OpenClaw plugin should expose a small, high-value tool set first.

### Phase 1 Tool Set

- `jobs_top_matches`
- `jobs_pending_review`
- `jobs_get_detail`
- `job_applications_pending_approval`
- `automation_runs_attention_needed`
- `daily_digest_fetch`
- `platform_meta`

### Phase 2 Tool Set

- `job_application_approve`
- `job_application_pause`
- `job_application_resume`
- `outreach_message_approve`
- `outreach_message_send`
- `document_variant_rebuild`
- `telegram_digest_send`

### Phase 3 Tool Set

- `browser_run_create`
- `browser_run_checkpoint`
- `browser_run_resume`
- `browser_run_complete`
- `application_site_open`
- `application_site_capture`

### Phase 4 Tool Set

- `recruiter_reply_draft`
- `follow_up_sequence_create`
- `contact_enrich`
- `opportunity_research_pack`
- `interview_prep_generate`

## Telegram Command Mapping

Map the original jobs blueprint Telegram goals to OpenClaw commands.

### Initial Command Set

- `/status`
- `/jobs_today`
- `/top_matches`
- `/review_pending`
- `/approve <id>`
- `/pause_automation`
- `/resume_automation`
- `/send_digest_now`
- `/outreach_queue`

### Recommended Behavior

- keep commands short and deterministic
- return compact summaries with deep links to `apps/jobs-ops`
- require confirmation for risky actions
- use OpenClaw Telegram allowlist mode for a single-owner bot

### Example Responses

`/top_matches`

Returns:

- top 5 jobs
- score
- urgency
- recommendation
- one-tap follow-up action labels

`/review_pending`

Returns:

- pending job applications
- outreach approvals
- blocked automation runs
- browser sessions waiting for manual intervention

## Browser-Assisted Application Flow

OpenClaw should be used for the hard part of the application stack, not the easy part.

### Use OpenClaw Browser For

- JavaScript-heavy ATS portals
- multi-step forms
- sites requiring manual login or CAPTCHA pauses
- guided assisted-apply mode from Telegram or operator dashboard

### Do Not Use It For

- high-volume blind mass applications
- sites with unclear terms or risky anti-bot posture
- flows where safe API submission already exists

### Browser Run Lifecycle

1. Django creates a browser run request
2. OpenClaw opens the target site in its isolated managed browser
3. OpenClaw navigates until a checkpoint or blocker is reached
4. Django records screenshots, timestamps, and checkpoint status
5. Operator resumes from Telegram or `apps/jobs-ops`
6. Final outcome is persisted to the backend timeline

### Important Safety Rule

Use the OpenClaw isolated browser profile for automation by default. Only escalate to a signed-in session when manual authentication is explicitly needed and approved.

## Scheduling Model

OpenClaw cron should complement Celery, not replace it.

### Celery Should Own

- scraping and discovery
- enrichment
- scoring
- document generation
- outbound email execution
- webhook processing
- analytics rollups

### OpenClaw Cron Should Own

- operator briefings
- reminder-style jobs
- scheduled Telegram summaries
- recurring human review nudges
- controlled trigger routines that call backend APIs

### Recommended First Cron Jobs

- `07:00 Africa/Lusaka` morning top matches brief
- `12:30 Africa/Lusaka` pending reviews reminder
- `18:00 Africa/Lusaka` outreach and reply summary
- one-shot reminders for manual checkpoints

## Job Search Enhancements You Gain

This integration improves job search quality in specific ways.

### Faster Response Time

You can see and approve high-value opportunities from Telegram instead of waiting to open the dashboard.

### Better Follow-Up Discipline

OpenClaw cron makes it easier to maintain recruiter follow-up cadence without depending on manual memory.

### Better Coverage Of Difficult Job Sites

The isolated browser gives you a safer lane for hard portals where pure backend automation is too brittle.

### Better Opportunity Awareness

Daily and event-driven Telegram summaries reduce the chance of missing expiring or high-fit roles.

### Better Human-In-The-Loop Control

Approvals, pauses, resume actions, and evidence capture become available from both the dashboard and chat.

## Security Model

This integration is powerful, so the security posture has to stay strict.

### Required Controls

- use a dedicated OpenClaw service account for backend API calls
- never give OpenClaw raw database credentials
- restrict Telegram access with allowlist mode
- require confirmations for approve, send, and browser-resume actions
- log every OpenClaw-triggered state change in backend audit records
- correlate every OpenClaw action with a backend `session_id` or `run_id`
- redact secrets from prompts, logs, and browser evidence
- keep OpenClaw on a private or strongly restricted host

### Approval Policy

OpenClaw should be allowed to:

- read status
- fetch digests
- create reminders
- open guided browser sessions

OpenClaw should not be allowed to autonomously:

- send high-risk outreach
- submit ambiguous applications
- override denylist or compliance rules
- bypass human approval thresholds

## Deployment Recommendation

Run OpenClaw as a separate service, not inside Django.

### Recommended Runtime

- one VPS or dedicated container host
- persistent volume for `~/.openclaw`
- Telegram enabled first
- plugin installed from local package or npm

### Environment Variables To Plan For

OpenClaw side:

- `MIHAS_API_BASE_URL`
- `MIHAS_OPENCLAW_TOKEN`
- `OPENCLAW_DEFAULT_AGENT=jobs-ops`
- `TELEGRAM_BOT_TOKEN`
- `OPENCLAW_PUBLIC_BASE_URL`
- `OPENCLAW_BROWSER_PROFILE=openclaw`

Backend side:

- `OPENCLAW_WEBHOOK_SECRET`
- `OPENCLAW_SERVICE_TOKEN`
- `OPENCLAW_ALLOWED_ORIGIN`
- `OPENCLAW_PUBLIC_URL`

These should complement the existing backend placeholders for:

- OpenAI
- Telegram
- Zoho
- Playwright
- OCR
- jobs-ops frontend URL

## Suggested Implementation Order

### Phase 1: Channel And Read-Only Value

- deploy OpenClaw
- connect Telegram
- implement allowlist policy
- build plugin read tools
- add `/status`, `/jobs_today`, `/top_matches`, `/review_pending`

Definition of done:

- operator can query real jobs-ops backend state from Telegram
- no write actions yet

### Phase 2: Approval Workflow

- add scoped OpenClaw service auth in Django
- implement explicit approve and pause routes if missing
- enable Telegram action confirmations
- create audit and correlation IDs

Definition of done:

- operator can approve or pause safe actions from Telegram
- every action leaves a backend audit trail

### Phase 3: Browser Assistance

- add browser run models and endpoints
- integrate OpenClaw isolated browser
- persist checkpoints, screenshots, and blockers
- add resume-from-telegram flow

Definition of done:

- hard application sites can be guided through without losing state

### Phase 4: Outreach And Reply Operations

- draft replies from thread context
- create follow-up reminders
- add recruiter quick actions
- send low-risk summaries to Telegram

Definition of done:

- recruiter follow-up quality and speed improve measurably

### Phase 5: Full Executive Copilot Layer

- interview prep generation
- company research packs
- strategic follow-up sequencing
- executive summaries and weekly opportunity briefings

Definition of done:

- OpenClaw becomes the mobile command center for the jobs platform

## Metrics To Track

To prove the integration is useful, track:

- time from job discovery to operator review
- time from recruiter reply to response draft
- time from blocked application to resumed action
- number of approvals completed via Telegram
- number of missed high-urgency roles before vs after
- interview rate on OpenClaw-assisted applications
- follow-up completion rate

## Repo Tasks For The Next AI

1. Create `tools/openclaw-mihas-jobs-ops/` as a monorepo package.
2. Add backend OpenClaw integration endpoints under `backend/apps/integrations/`.
3. Add OpenClaw session and browser run persistence models.
4. Add a service-account auth mechanism for OpenClaw.
5. Add jobs-ops deep links from Telegram responses to `apps/jobs-ops`.
6. Extend `apps/jobs-ops/src/features/integrations/pages/IntegrationsPage.tsx` with an OpenClaw provider card and runtime status.
7. Add operational docs for setup, secrets, rollout, and disaster recovery.

## Decision Summary

OpenClaw is a strong fit for this repo if it is treated as:

- a Telegram and mobile control layer
- a safe browser-assist runtime
- a scheduler for operator workflows
- a plugin-driven orchestration surface over the real Django API

It is not the primary system of record. Django remains the platform core.

## References

Official OpenClaw docs used for this plan:

- Getting started: <https://docs.openclaw.ai/start/quickstart>
- Install: <https://docs.openclaw.ai/install>
- Telegram: <https://docs.openclaw.ai/channels/telegram>
- Browser tool: <https://docs.openclaw.ai/tools/browser>
- Plugins: <https://docs.openclaw.ai/plugins/building-plugins>
- Cron jobs: <https://docs.openclaw.ai/automation/cron-jobs>

# AI Job Hunting Platform Master Implementation Prompt

Use the following prompt as a single end-to-end instruction set for the next AI.

```text
You are continuing work inside the existing monorepo at:
/home/cosmas/Downloads/mihasv3

Your job is to COMPLETE the AI Job Hunting Platform end to end inside this repo. Do not stop at scaffolding, docs, or partial architecture. Review the current codebase and existing changes first, then implement the full application as a production-grade system with frontend, backend, database, background jobs, integrations, tests, documentation, and operational polish.

You have access to the same workspace and tools as the previous AI, and you also have access to Neon MCP for creating and managing the project database. Use it.

This is not a greenfield build. You must first review the current implementation and continue from it. Do not discard or overwrite the existing jobs-ops work. Integrate with it and improve it. Also do not revert unrelated user changes in the worktree.

## Core Mission

Build the AI Job Hunting Platform fully across:
- frontend operator dashboard
- backend API
- database and migrations
- Celery tasks and orchestration
- external integrations
- automation services
- analytics and reporting
- tests
- documentation

The final result should be a serious production-grade platform, not a demo scraper.

## Current Repo Context You Must Review First

Read these files before making changes:

- docs/plans/2026-03-30-ai-job-hunting-platform-blueprint.md
- docs/requirements/2026-03-30-ai-job-hunting-platform-prd.md
- docs/design/2026-03-30-ai-job-hunting-platform-architecture.md
- docs/design/2026-03-30-ai-job-hunting-platform-api-data-spec.md
- docs/design/2026-03-30-ai-job-hunting-platform-ui-spec.md
- docs/reports/2026-03-30-ai-job-hunting-platform-progress.md
- docs/reports/2026-03-31-ai-job-hunting-platform-handoff.md
- apps/jobs-ops/README.md
- apps/jobs-ops/src/app/router.tsx
- apps/jobs-ops/src/app/layout/JobsOpsShell.tsx
- apps/jobs-ops/src/features/
- backend/apps/common/jobs_ops_seed.py
- backend/apps/jobs/
- backend/apps/outreach/
- backend/apps/automation/
- backend/apps/integrations/
- backend/apps/analytics/
- backend/apps/common/meta_views.py
- backend/config/urls.py
- backend/config/settings/base.py
- backend/tests/unit/test_jobs_ops_endpoints.py

You must understand what already exists before implementing anything new.

## Important Existing State

The repo already contains:

1. `apps/jobs-ops`
- Bun + React + TypeScript app
- polished shell
- route structure
- data-driven operator pages
- loading states
- searchable jobs inbox

2. Backend jobs-ops route groups under `/api/v1/...`
- jobs
- job-applications
- outreach
- automation
- integrations
- analytics
- reports
- meta/platform attribution

3. Shared seeded state in:
- `backend/apps/common/jobs_ops_seed.py`

4. Validation already passing for the current scaffold:
- frontend type-check
- frontend lint
- frontend build
- backend manage.py check
- jobs-ops unit tests
- clean OpenAPI schema generation

Your task is to turn this from a strong v1.1 scaffold into a fully implemented system.

## Non-Negotiable Constraints

- Keep all new backend contracts under `/api/v1/...`
- Do NOT reuse admissions `/api/v1/applications/` for jobs
- Jobs domain must use explicit names like `JobApplication`
- Preserve creator attribution:
  - Creator: Cosmas Kanchepa
  - Developed by Beanola Technologies
  - backlink: https://beanola.com
- Do not remove existing documentation
- Do not revert unrelated user changes already present in the worktree
- Maintain auditability, evidence, and human-in-the-loop controls for risky automation
- Respect current repo patterns:
  - frontend apps under `apps/*`
  - Django + DRF backend
  - Celery + Redis
  - Bun workspaces

## Required End State

You must implement ALL of the following.

### A. Full Database and Persistence Layer

Use Neon MCP to create or provision the Postgres database for this platform and wire the backend to it properly.

Implement real Django models, migrations, admin registration if useful, and persistence for:

- UserProfile
- CandidateProfile
- ResumeMaster
- ResumeVariant
- CoverLetterTemplate
- JobSource
- JobPosting
- JobSnapshot
- JobMatchScore
- JobApplication
- JobApplicationStep
- AutomationRun
- AutomationArtifact
- OutreachContact
- OutreachCampaign
- OutreachMessage
- EmailAccount
- EmailMessage
- EmailThread
- DeliveryEvent
- TelegramSubscription
- ReviewTask
- AuditLog integration where appropriate
- ScraperAdapter
- ScraperHealthEvent
- Company
- CompanyContact
- CandidateAnswerBank
- Opportunity
- KnowledgeBaseEntry or equivalent
- InterviewPrepArtifact or equivalent
- EmployerResearchSnapshot or equivalent

Design the database with proper indexes, foreign keys, statuses, timestamps, uniqueness constraints, and normalization. Add factories/fixtures/seed utilities as needed.

### B. Backend API Completion

Replace seeded-only read responses with real database-backed services and serializers while preserving the route surface already in place.

Implement end-to-end behavior for:

#### Jobs
- discovery run creation and tracking
- job ingestion storage
- deduplication
- enrichment
- match scoring
- watch/dismiss/apply flows
- job detail lineage and source visibility

#### Job Applications
- create
- retrieve
- submit
- pause
- resume
- approve
- reject
- timeline/history
- evidence attachment linkage

#### Documents
- master resume management
- variant creation
- cover letter generation
- question bank answer generation
- version history
- human approval status
- redline-ready data structures

#### Outreach
- contacts CRUD and enrichment
- campaigns CRUD
- message generation
- send flows
- relationship history
- dedupe/cooldown logic

#### Email
- mailbox/account setup
- outbound send queue
- thread storage
- webhook delivery processing
- reply classification
- attachment/evidence logging

#### Telegram
- connect
- test
- webhook
- alerts
- commands
- approvals and quick control actions where feasible

#### Automation
- rules CRUD
- runs CRUD and status transitions
- pause/resume/approve/cancel
- orchestration state machine
- blocker handling

#### Analytics and Reports
- funnel analytics
- source analytics
- outreach analytics
- daily digest
- weekly and monthly reporting foundations
- CSV/PDF export where practical

### C. Frontend Completion

Take `apps/jobs-ops` from a strong dashboard shell to a full production operator app.

Implement:
- authentication and protected routing
- login/session integration against existing auth patterns or a clean dedicated approach if needed
- real data fetching against implemented backend APIs
- optimistic and pessimistic write flows where appropriate
- mutation success/error handling
- better tables, drawers, filters, pagination, sorting
- forms using React Hook Form + Zod
- charts where they materially improve operator visibility
- approval flows
- evidence drawers
- document version views
- job/application timelines
- source diagnostics
- review queues
- audit trails
- notification center
- command palette backed by real entities/actions
- mobile-friendly review flows

Preserve and improve the existing visual language. Do not regress the UI to generic boilerplate.

### D. Discovery and Scraping System

Implement the job discovery engine properly, including:
- source registry
- adapters
- canonicalization
- deduplication
- trust scoring
- employer reputation indicators
- scam/fraud heuristics
- deadline extraction
- work mode classification
- salary normalization
- geography tagging
- domain and skill tagging

Support these discovery channels as much as practical:
- selected Zambian job boards
- African job boards
- company career pages
- NGO and donor portals
- government and university portals
- RSS feeds
- sitemap crawling
- email-derived leads

Where direct scraping of a specific source is not safe to hardcode without credentials or site-specific handling, still implement the adapter architecture, crawler framework, persistence, diagnostics, and at least a robust first working subset of sources.

### E. Matching and AI Intelligence

Implement:
- candidate profile scoring inputs
- job match score calculation
- shortlist probability score
- effort-to-apply score
- strategic value score
- compensation attractiveness score
- resume gap analysis
- recommendation engine: apply now / review / ignore / watch
- explainable fit reasons
- missing skills/keywords extraction
- best resume variant recommendation
- recruiter-posted vs direct-employer inference where reasonable

Use OpenAI for the generative/explanatory layer, but keep deterministic logic and fallback guards around scoring and safety-sensitive flows.

### F. Document Intelligence

Implement:
- master resume storage
- variants by role/industry/seniority
- cover letter templates
- outreach templates
- answer bank
- ATS keyword optimization
- role-specific tailoring
- hallucination prevention guardrails
- document version history
- human approval on heavily modified assets
- multiple output formats where practical
- metadata for diffs/redlines

### G. Application Automation

Implement all automation modes:
- full auto
- assisted auto
- draft only
- watch only

Build the system with:
- Playwright worker integration
- reusable question/answer bank
- form field mapping
- pause/resume checkpoints
- screenshot/evidence capture
- retry/backoff
- allowlist/denylist/policy controls
- human approval thresholds

This must be engineered safely and audibly. Do not create spammy, reckless, or opaque automation.

### H. Outreach and CRM

Implement:
- contacts
- campaigns
- lead scoring
- referral workflows
- networking CRM
- follow-up cadence
- duplicate outreach prevention
- relationship memory
- conversation history linking

### I. Email Operations

Implement and connect:
- Zoho Mail integration
- outbound send queue
- IMAP or mailbox sync where appropriate
- thread storage
- reply ingestion
- classification
- bounce/delivery handling
- open/click tracking only where lawful and appropriate
- daily inbox summaries
- important reply escalation to Telegram

### J. Telegram Control Layer

Implement Telegram as both:
- alerting channel
- command/control channel

Support commands like:
- /status
- /jobs today
- /review pending
- /approve <id>
- /pause automation
- /resume automation
- /send digest now
- /top matches
- /rebuild resume variant
- /outreach queue

### K. Full “Future Features” Scope Must Also Be Included

Do not leave these as docs-only if you can implement them now. Build them into the system:

1. Personal Career Strategy Layer
- career tracks
- target titles and sectors
- company hit lists
- “do not apply” guidance
- networking-first recommendations

2. Interview Pipeline Support
- interview invite detection
- interview prep pack generation
- expected questions
- STAR story suggestions
- calendar integration foundations

3. Employer Research Engine
- company snapshots
- news enrichment hooks
- growth/funding indicators where possible
- scam/fake-posting risk signals
- prior contact visibility

4. Relationship Memory / CRM
- recruiter/hiring manager interaction history
- cadence tracking
- anti-spam controls
- referral status

5. Application Quality Control
- AI reviewer before send
- completeness checks
- resume mismatch detection
- attachment correctness validation
- preflight “would I hire this candidate?” score

6. Browser-Assisted Human-in-the-Loop Mode
- guided application session
- highlight manual steps
- preserve draft state
- resume after interruption

7. Inbox Mining for Hidden Opportunities
- parse recruiter emails
- create opportunities from inbound leads
- generate suggested replies
- detect interview scheduling requests

8. Knowledge Base
- FAQ answers
- stored facts/preferences
- achievement bank
- writing style presets

9. Compliance and Security Layer
- secret handling
- permission boundaries
- PII masking
- encrypted sensitive storage where possible
- data retention policy support

10. Self-Healing Automation
- scraper health checks
- broken adapter detection
- auto-disable unsafe/broken sources
- replay failed runs

### L. External Services To Connect

You must wire and integrate the remaining services cleanly:

- Neon Postgres via Neon MCP
- Redis
- Celery
- OpenAI API
- Telegram Bot API
- Zoho Mail
- Cloudflare R2
- Playwright worker service
- OCR/parser stack for PDFs and resumes

If credentials are absent, still implement complete provider clients, settings, env handling, tasks, retry logic, webhooks, and docs so the project is production-ready once secrets are supplied.

### M. Security, Safety, and Policy

Implement robust controls:
- secret masking
- encrypted sensitive fields where feasible
- audit logs
- approval thresholds
- domain policies
- send caps
- auto-apply caps
- duplicate outreach prevention
- retry limits
- factuality guardrails
- clear distinction between draft and sent communication
- anti-abuse constraints

### N. Testing and Quality

Do not leave this weakly tested.

Add:
- backend unit tests
- integration tests for critical flows
- frontend tests where valuable
- contract tests for jobs-ops APIs
- Celery task tests
- provider client tests/mocks
- automation flow tests where possible

Run and fix:
- backend checks
- schema generation
- relevant pytest suites
- frontend type-check
- frontend lint
- frontend build

Update or add docs for:
- setup
- env vars
- database setup
- Neon usage
- provider integrations
- background workers
- webhook setup
- operational runbooks
- handoff/status

## Review Expectations

You must review all existing jobs-ops changes before implementing:
- what already exists in frontend
- what already exists in backend
- which docs are already accurate
- which tests already exist
- what can be reused
- what must be replaced with real persistence/integrations

Do not blindly rewrite the current scaffold. Continue it intelligently.

## Work Style

- Be autonomous
- Make code changes directly
- Do not stop at planning
- Persist until the application is substantially complete
- If you find unrelated user changes, do not revert them
- Keep the repo coherent and production-minded

## Definition of Done

You are done only when:
- the app is meaningfully end-to-end, not just scaffolded
- the jobs-ops frontend is operational with real backend flows
- the backend uses real persisted models for the new platform
- Neon-backed database is created and wired
- major integrations are connected or fully prepared behind env-configurable clients
- Celery-driven workflows exist for core async operations
- tests pass for the new platform
- docs clearly explain what was implemented and how to run it
- the current changes were reviewed and respected

At the end, provide:
- a concise implementation summary
- validation results
- any remaining blockers
- the exact files/areas changed
```

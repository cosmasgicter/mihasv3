# AI Job Hunting Platform PRD

Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)  
Document status: Proposed product requirements for implementation in this monorepo.

## 1. Product Summary

Build an AI-powered job operations platform that continuously discovers job opportunities, scores them against a candidate profile, generates tailored application materials, supports safe application automation, runs structured outreach, tracks outcomes, and reports performance through a high-density operator dashboard.

This is not a demo scraper. It is a production-grade workflow product with auditability, explainability, evidence capture, and human approval controls.

## 2. Problem Statement

Manual job hunting is fragmented across job boards, company sites, email inboxes, recruiter messages, CV variants, and follow-up tasks. The user loses time in discovery, tailoring, repetitive form entry, and opportunity tracking. Most automation tools are either too shallow to be useful or too aggressive to be safe.

The product should turn job seeking into an operating system:

- discover opportunities continuously
- tell the user what is worth pursuing
- prepare high-quality materials quickly
- automate only where confidence and policy allow
- keep all evidence, responses, and next actions in one place

## 3. Product Vision

The platform should become:

- an AI-powered job operations platform
- an application autopilot with human oversight
- an outreach CRM for opportunity generation
- a career intelligence system
- a personal recruiting assistant

## 4. Goals

1. Reduce the time from job discovery to application-ready package.
2. Increase the rate of relevant applications rather than raw application volume.
3. Create a defensible audit trail for every AI-generated or automated action.
4. Support both opportunity capture and relationship-driven outreach.
5. Produce daily operating visibility through reports, alerts, and health signals.

## 5. Non-Goals

- Fully autonomous high-risk application submission in the first release.
- Broad multi-tenant SaaS features in phase 1.
- Native mobile apps in the initial build.
- Unsupported or non-compliant scraping of protected/private platforms.
- Fabricating qualifications, job history, or recruiter communications.

## 6. Primary Users

### Primary persona

An operator user who manages one candidate profile and wants a serious, semi-autonomous job hunting system.

### Secondary personas

- future executive assistant or delegate operator
- future multi-user team supporting multiple candidates
- future candidate-only portal user

## 7. Functional Requirements

### Discovery and intelligence

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-001 | Ingest jobs from Zambian, African, and international sources through APIs, feeds, structured scraping, and browser-assisted adapters when needed. | Must | 1 |
| FR-002 | Normalize raw postings into a canonical `JobPosting` shape with source, company, location, salary, deadline, work mode, skills, and application URL. | Must | 1 |
| FR-003 | Detect duplicates across sources and preserve source lineage on the canonical job record. | Must | 1 |
| FR-004 | Enrich jobs with tags for seniority, domain, location, remote status, salary, work authorization, and urgency. | Must | 1 |
| FR-005 | Score each job against the candidate profile and explain why the role is strong, medium, or weak fit. | Must | 1 |
| FR-006 | Apply policy-based recommendations: `apply_now`, `review`, `watch`, `ignore`. | Must | 1 |
| FR-007 | Flag likely scams, stale jobs, low-trust sources, or missing employer signals. | Should | 1 |

### Candidate profile and document intelligence

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-008 | Maintain a structured candidate profile containing skills, experience timeline, education, certifications, preferences, salary expectations, and do-not-apply rules. | Must | 1 |
| FR-009 | Store a master resume plus multiple resume variants by industry, role cluster, and seniority. | Must | 2 |
| FR-010 | Generate tailored resume and cover letter drafts for a selected job without inventing qualifications. | Must | 2 |
| FR-011 | Track version history and redline differences for AI-modified documents. | Must | 2 |
| FR-012 | Generate recruiter summaries, short bios, motivation statements, and common screening answers. | Should | 2 |
| FR-013 | Require approval before heavily modified or high-impact documents are used automatically. | Must | 2 |

### Job applications and automation

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-014 | Support `watch_only`, `draft_only`, `assisted_auto`, and `full_auto` application modes. | Must | 3 |
| FR-015 | Create a `JobApplication` record distinct from the discovered job, including stage history and evidence artifacts. | Must | 1 |
| FR-016 | Support external ATS links, email-based applications, and easy-apply style workflows. | Must | 3 |
| FR-017 | Pause automation for manual login, CAPTCHA, ambiguous questions, or policy violations. | Must | 3 |
| FR-018 | Persist screenshots, traces, request metadata, and result artifacts for every automation run. | Must | 3 |
| FR-019 | Apply hard caps and per-domain policies to prevent spam, lockouts, or unsafe submission volume. | Must | 3 |

### Outreach and relationship management

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-020 | Track recruiters, hiring managers, founders, alumni, and referral targets as first-class contacts. | Must | 2 |
| FR-021 | Generate personalized outreach messages for follow-ups, referral asks, introductions, and collaboration inquiries. | Must | 2 |
| FR-022 | Support campaign sequencing, follow-up cadence rules, and duplicate-contact suppression. | Should | 4 |
| FR-023 | Maintain conversation history, referral status, warm intro context, and next action recommendations. | Must | 2 |

### Email and messaging

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-024 | Integrate Zoho mail for send, receive, thread tracking, delivery updates, and bounce handling. | Must | 2 |
| FR-025 | Classify incoming responses into positive, rejection, interview, more info, or ambiguous categories. | Must | 2 |
| FR-026 | Send Telegram alerts for high-match jobs, manual review needs, responses, failures, and daily digests. | Must | 1 |
| FR-027 | Accept Telegram commands to pause, resume, approve, summarize, and inspect system state. | Should | 2 |

### Analytics and reporting

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-028 | Track jobs discovered, match distribution, applications sent, response rate, interview rate, and source performance. | Must | 1 |
| FR-029 | Produce daily, weekly, and monthly reports with AI summaries and export support. | Must | 1 |
| FR-030 | Report scraper freshness, adapter health, duplicate ratio, and automation failure trends. | Must | 4 |
| FR-031 | Show document and outreach performance by variant, channel, and target segment. | Should | 5 |

### Cross-cutting platform features

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-032 | Maintain a knowledge base for reusable answers, achievement statements, and writing presets. | Should | 3 |
| FR-033 | Support employer research snapshots and company intelligence for shortlisted opportunities. | Should | 4 |
| FR-034 | Detect interview invites and generate interview prep packs from job and company context. | Should | 5 |
| FR-035 | Auto-disable failing adapters and raise health alerts when source layouts or workflows break. | Should | 5 |

## 8. Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | All HTTP contracts must remain under `/api/v1/...` and must not break current admissions routes. |
| NFR-002 | Every state-changing action must be auditable with actor, timestamp, request ID, and artifact links where relevant. |
| NFR-003 | Credentials and sensitive integration secrets must be encrypted at rest and masked in logs. |
| NFR-004 | AI-generated content must be explainable, reviewable, and bounded by factual guardrails. |
| NFR-005 | The system must degrade safely: broken adapters pause themselves, risky automation pauses for review, and missing evidence blocks auto-send. |
| NFR-006 | The UI must be mobile-friendly for review tasks while remaining optimized for dense desktop operations. |
| NFR-007 | Background workloads must use Celery plus Redis and must tolerate retries, backoff, and idempotent replay. |
| NFR-008 | Documents and automation evidence must be versioned and stored in durable object storage. |

## 9. Success Metrics

- At least 80 percent of discovered jobs are normalized without manual cleanup for supported sources.
- Duplicate detection keeps the duplicate ratio below 10 percent among supported sources.
- High-match jobs reach the review queue within 15 minutes of discovery.
- Every application attempt has a complete timeline and evidence bundle.
- No auto-generated document or outreach message can be sent if factual verification fails.
- Daily digest delivery succeeds for at least 99 percent of active days.

## 10. Release Phases

### Phase 1: Foundation

- candidate profile
- master resume store
- source registry
- discovery pipeline for initial sources
- normalization and dedupe
- match scoring v1
- review queue
- Telegram alerts
- daily digest

Exit criteria:

- at least three production-worthy sources integrated
- review queue operational
- daily digest operational
- job-to-review workflow fully traceable

### Phase 2: Documents and email ops

- resume variants
- cover letters
- Zoho send and receive
- delivery tracking
- response classification
- outreach CRM basics

Exit criteria:

- document versioning live
- response classification live
- no send path without approval or policy clearance

### Phase 3: Assisted applications

- Playwright-assisted workers
- form mapping engine
- question-answer bank
- pause and resume checkpoints
- evidence logging

Exit criteria:

- assisted submissions work across at least two representative application patterns
- manual checkpoint recovery works reliably

### Phase 4: Autonomous operations

- rules engine
- outreach sequencing
- company research
- lead generation campaigns
- source health analytics

### Phase 5: Advanced intelligence

- interview prep generation
- performance analytics by document variant
- predictive prioritization
- self-healing adapters

## 11. Risks And Product Constraints

- Route collisions with the current admissions backend if job endpoints use generic names such as `/api/v1/applications/`.
- Legal and policy risk on aggressive scraping or deceptive automation.
- Mailbox reputation damage if pacing, dedupe, and approval controls are weak.
- AI quality risk if factual guardrails and redline review are missing.
- Browser automation fragility on anti-bot or login-heavy sites.

## 12. Product Rules That Make It Premium

- Every important action produces evidence.
- Every generated document is versioned.
- Every risky automation can pause and resume safely.
- Every AI recommendation explains itself.
- Every source has health visibility.
- Every application has a timeline.
- Every urgent event can reach Telegram quickly.


# AI Job Hunting Platform API And Data Spec

Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)  
Document status: Proposed API and data contract for future implementation.

## 1. API Contract Principles

- Base path remains `/api/v1/...`.
- Follow the current DRF style already used in the repo: explicit serializers, OpenAPI annotations, and envelope responses.
- Prefer resource-oriented endpoints with action subpaths only where the action changes workflow state.
- All state-changing requests should support `Idempotency-Key`.
- Responses should include `X-Request-ID` and link back to audit trails where relevant.

## 2. Required Credit In The Backend API

The backend API must visibly credit the creator and developer in two places:

1. OpenAPI or API documentation metadata
2. a machine-readable metadata endpoint

### Required metadata endpoint

`GET /api/v1/meta/platform/`

Example response:

```json
{
  "product": "AI Job Hunting Platform",
  "creator": {
    "name": "Cosmas Kanchepa"
  },
  "developer": {
    "name": "Beanola Technologies",
    "url": "https://beanola.com"
  },
  "api_version": "v1",
  "status": "planned"
}
```

### Required schema metadata

Illustrative schema metadata:

```python
# illustrative only
OPENAPI_INFO = {
    "title": "Jobs Operations API",
    "description": (
        "Creator: Cosmas Kanchepa\\n"
        "Developed by Beanola Technologies - https://beanola.com"
    ),
    "x-creator": {"name": "Cosmas Kanchepa"},
    "x-developed-by": {
        "name": "Beanola Technologies",
        "url": "https://beanola.com",
    },
}
```

## 3. Namespace Adjustments Required By This Repo

The user-proposed API surface needs two adjustments to fit the current backend safely:

| Proposed | Problem | Recommended route |
| --- | --- | --- |
| `/api/v1/applications/...` | already used by admissions | `/api/v1/job-applications/...` |
| `Application` model | collides conceptually and by import name with admissions | `JobApplication` |

The `documents` and `email` namespaces can be extended if the implementation keeps the contracts clean and does not break current consumers.

## 4. Route Map

### Meta

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/meta/platform/` | Product metadata, creator credit, developer credit, API status. |

### Jobs

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/jobs/` | List canonical job postings with filters and pagination. |
| POST | `/api/v1/jobs/discovery-runs/` | Trigger or register a discovery run. |
| GET | `/api/v1/jobs/discovery-runs/{id}/` | Inspect discovery run status and stats. |
| GET | `/api/v1/jobs/{id}/` | Retrieve a single job posting. |
| POST | `/api/v1/jobs/{id}/score/` | Recompute match scoring and explanation. |
| POST | `/api/v1/jobs/{id}/tailor-documents/` | Generate or refresh tailored document drafts. |
| POST | `/api/v1/jobs/{id}/dismiss/` | Mark job as ignored with reason. |
| POST | `/api/v1/jobs/{id}/watch/` | Mark job as watch-only. |

### Job applications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/job-applications/` | List job applications. |
| POST | `/api/v1/job-applications/` | Create a job application decision record. |
| GET | `/api/v1/job-applications/{id}/` | Retrieve application detail, timeline, and artifacts. |
| POST | `/api/v1/job-applications/{id}/submit/` | Submit via selected channel if policy allows. |
| POST | `/api/v1/job-applications/{id}/pause/` | Pause automation or review state. |
| POST | `/api/v1/job-applications/{id}/resume/` | Resume a paused application run. |
| POST | `/api/v1/job-applications/{id}/approve/` | Explicitly approve a draft or guarded action. |
| POST | `/api/v1/job-applications/{id}/reject/` | Reject a draft or cancel a pending action. |

### Documents

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/documents/resumes/` | List master resumes and variants. |
| POST | `/api/v1/documents/resumes/variants/` | Create a resume variant definition or generated draft. |
| POST | `/api/v1/documents/cover-letters/generate/` | Generate a cover letter draft. |
| POST | `/api/v1/documents/question-bank/answer/` | Generate or retrieve reusable screening answers. |
| GET | `/api/v1/documents/{id}/versions/` | View document version history and redlines. |

### Outreach

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/outreach/contacts/` | List contacts and relationship state. |
| POST | `/api/v1/outreach/contacts/` | Create a contact. |
| POST | `/api/v1/outreach/contacts/enrich/` | Enrich contacts in bulk or singly. |
| GET | `/api/v1/outreach/campaigns/` | List outreach campaigns. |
| POST | `/api/v1/outreach/campaigns/` | Create a campaign or sequence. |
| POST | `/api/v1/outreach/messages/generate/` | Generate draft outreach messages. |
| POST | `/api/v1/outreach/messages/send/` | Send an approved message. |

### Email

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/email/accounts/zoho/connect/` | Connect Zoho mailbox. |
| GET | `/api/v1/email/messages/` | List inbound and outbound email messages. |
| GET | `/api/v1/email/threads/` | List tracked email threads. |
| POST | `/api/v1/email/send/` | Send a transactional or outreach email. |
| POST | `/api/v1/email/webhooks/delivery/` | Process delivery and bounce events. |

### Integrations

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/integrations/telegram/connect/` | Connect Telegram bot or subscription. |
| POST | `/api/v1/integrations/telegram/test/` | Test Telegram delivery. |
| POST | `/api/v1/integrations/telegram/webhook/` | Telegram command and webhook receiver. |
| POST | `/api/v1/integrations/openai/test/` | Validate AI provider configuration. |

### Automation

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/automation/rules/` | List automation rules and caps. |
| POST | `/api/v1/automation/rules/` | Create or update automation rules. |
| POST | `/api/v1/automation/runs/` | Start an automation run. |
| GET | `/api/v1/automation/runs/{id}/` | Retrieve execution detail and artifacts. |
| POST | `/api/v1/automation/runs/{id}/approve/` | Approve a blocked run. |
| POST | `/api/v1/automation/runs/{id}/cancel/` | Cancel a run. |

### Analytics and reports

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/analytics/funnel/` | Funnel metrics by stage and period. |
| GET | `/api/v1/analytics/sources/` | Discovery and adapter performance. |
| GET | `/api/v1/analytics/outreach/` | Outreach conversion metrics. |
| GET | `/api/v1/reports/daily-digest/` | Render the daily strategic digest. |

## 5. Envelope And Error Shape

Illustrative response pattern:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-03-30T10:00:00Z"
  }
}
```

Illustrative error pattern:

```json
{
  "success": false,
  "error": "Approval required before submission",
  "code": "APPROVAL_REQUIRED",
  "meta": {
    "requestId": "req_123"
  }
}
```

## 6. Entity Model

### Core profile and document entities

| Entity | Notes |
| --- | --- |
| `CandidateProfile` | Primary candidate facts, preferences, restrictions, salary targets, and experience timeline. |
| `ResumeMaster` | Canonical resume source of truth. |
| `ResumeVariant` | Named resume flavor for role clusters and industries. |
| `CoverLetterTemplate` | Tone and structure presets. |
| `CandidateAnswerBank` | Reusable answers for screening questions and forms. |

### Jobs and company entities

| Entity | Notes |
| --- | --- |
| `JobSource` | Source registry, compliance flags, trust score, crawl mode, health state. |
| `DiscoveryRun` | A single execution of discovery on one or more sources. |
| `JobPosting` | Canonical job record after normalization and dedupe. |
| `JobSnapshot` | Source-specific raw or derived snapshot used for history and evidence. |
| `JobMatchScore` | Explainable scoring output and AI reasoning summary. |
| `JobDecision` | Watch, dismiss, review, apply, or ignore action state. |
| `Company` | Employer profile and normalized company identity. |
| `CompanyResearchSnapshot` | Research enrichment, risk indicators, and recent signals. |

### Application and automation entities

| Entity | Notes |
| --- | --- |
| `JobApplication` | A concrete decision to pursue a job, distinct from the posting itself. |
| `JobApplicationStep` | Timeline steps such as drafted, approved, submitted, failed, replied. |
| `AutomationRule` | Auto-apply caps, approval thresholds, domain policies, and pacing rules. |
| `AutomationRun` | One execution instance for a discovery, tailoring, outreach, or apply workflow. |
| `AutomationArtifact` | Screenshot, trace, payload summary, generated file, or debug evidence. |
| `ReviewTask` | Human review unit for blocked, risky, or ambiguous work. |
| `AuditLog` | Immutable audit event view for security and traceability. |

### Outreach and messaging entities

| Entity | Notes |
| --- | --- |
| `OutreachContact` | Recruiter, hiring manager, referral target, alumni, or collaborator. |
| `OutreachCampaign` | A sequence or one-off contact plan. |
| `OutreachMessage` | Generated or sent message variants and states. |
| `EmailAccount` | Connected mailbox metadata. |
| `EmailThread` | Conversation thread state. |
| `EmailMessage` | Inbound or outbound message record. |
| `DeliveryEvent` | Delivery, bounce, open, click, or provider event state. |
| `TelegramSubscription` | Chat, channel, or bot subscription record. |
| `Opportunity` | A cross-domain object linking jobs, contacts, threads, and next actions. |

## 7. Relationship Rules

- One `JobPosting` can have many `JobSnapshots`.
- One `JobPosting` can have many `JobMatchScore` recalculations, but only one current score.
- One `JobPosting` can produce zero or many `JobApplication` records across time.
- One `JobApplication` has many `JobApplicationStep` records.
- One `AutomationRun` can attach many `AutomationArtifact` records.
- One `OutreachContact` can be linked to many `OutreachMessage` records and many `Opportunity` records.

## 8. Workflow State Recommendations

### Job decision state

`new -> scored -> review -> watch | dismissed | ready_to_apply`

### Job application state

`draft -> awaiting_approval -> approved -> submitting -> submitted -> follow_up -> interview -> rejected | closed`

### Automation run state

`queued -> running -> blocked -> paused -> completed | failed | cancelled`

## 9. Webhook And Event Design

- Provider webhooks should land in `apps.integrations`.
- Internal domain events should be published as durable database state changes first, not as in-memory signals.
- Telegram and digest jobs should consume persisted state rather than ephemeral event payloads.

## 10. Validation Rules

- Reject AI-generated resume or cover letter output if unsupported facts appear.
- Reject outbound outreach when the same contact has been messaged too recently.
- Reject auto-apply when salary, location, or domain policy fails candidate rules.
- Reject full-auto submission when the application flow is not on the allowlist.


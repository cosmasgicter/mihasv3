# Admissions Business Logic Audit

Date: 2026-04-10

Scope: `apps/admissions/` frontend and admissions-related backend domains under `backend/apps/`

Method: static code audit of the current implementation, service contracts, workflow enforcement, rules, and automation surface. This is not a production traffic analysis or end-to-end browser/API replay.

## Executive Summary

The admissions application already has the beginnings of a serious workflow engine:

- server-side submission guards exist
- payment processing has real lifecycle controls
- application status transitions are centralized
- SSE and notification infrastructure exist
- fees are dynamically resolved

The main problem is not the absence of logic. The main problem is that the logic is fragmented across:

- backend workflow services
- permissive generic update endpoints
- frontend-only advisory checks
- duplicated state vocabularies
- partially scaffolded analytics and automation layers

The result is a system that is operational, but not yet fully trustworthy as an "intelligent" admissions platform. The next maturity step is to make core business rules canonical, explainable, and enforceable in one place, then layer adaptive behavior on top.

The most important conclusion is this:

1. Do not add more smart behavior on top of contract drift.
2. First tighten the canonical application workflow, identifiers, and rule ownership.
3. Then add intelligence through rules, recommendations, automation, prioritization, and reviewer assistance.

## Current Business Logic Map

### 1. Identity, Session, and Role Logic

Current surface:

- `backend/apps/accounts/models.py`
- `backend/apps/accounts/services.py`
- `backend/apps/accounts/views.py`
- `backend/apps/accounts/session_views.py`
- `backend/apps/accounts/permissions.py`
- `apps/admissions/src/services/auth.ts`

What exists:

- role-aware permissions and owner/admin access checks
- session endpoints and frontend session handling
- basic role hierarchy for student vs admin behaviors

Assessment:

- good baseline access-control logic exists
- this layer is functional, but it is not yet deeply connected to admissions-specific business policies such as reviewer scopes, institution-specific permissions, or intake ownership

Opportunity:

- move from generic auth roles to admissions-aware capabilities such as `can_verify_payment`, `can_schedule_interview`, `can_issue_offer`, `can_override_deadline`

### 2. Catalog, Program, Intake, and Fee Logic

Current surface:

- `backend/apps/catalog/models.py`
- `backend/apps/catalog/views.py`
- `backend/apps/documents/fee_resolver.py`
- `apps/admissions/src/services/catalog.ts`
- `apps/admissions/src/data/catalog.ts`

What exists:

- programs, institutions, and intakes
- intake deadlines and capacity fields
- fee resolution by residency

Assessment:

- the domain model already contains the right raw ingredients
- however, program/intake logic is not consistently enforced during create, update, submit, and review paths

Key issue:

- `FeeResolver` expects a program code, while application records appear to carry program names/labels in some paths. This creates a real risk of fee lookup drift.

Opportunity:

- make program and intake identifiers canonical everywhere
- enforce deadline, capacity, and intake validity at both draft creation and submission time

### 3. Student Application Lifecycle Logic

Current surface:

- `backend/apps/applications/models.py`
- `backend/apps/applications/services.py`
- `backend/apps/applications/views.py`
- `backend/apps/applications/serializers.py`
- `apps/admissions/src/services/applications.ts`
- `apps/admissions/src/lib/applicationStateMachine.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

What exists:

- centralized status transition rules in backend services
- dedicated server-side submission service
- idempotent submission endpoint
- frontend wizard and state machine

Assessment:

- this is the strongest core logic area in the system
- however, the generic application update path is still too permissive for a workflow-driven domain

Key issue:

- the detail update endpoint can still mutate lifecycle-relevant fields through serializer-driven partial updates. That weakens the value of the central workflow services.

Opportunity:

- narrow generic updates to draft-safe fields only
- require dedicated endpoints for submit, withdraw, review, offer, reject, interview scheduling, and payment review

### 4. Draft, Autosave, and Resume Logic

Current surface:

- `backend/apps/applications/models.py` (`ApplicationDraft`)
- `apps/admissions/src/lib/applicationSession.ts`
- `apps/admissions/src/lib/draftManager.ts`
- `apps/admissions/src/pages/student/applicationWizard/...`

What exists:

- browser draft storage
- session storage
- server-side draft objects
- real application records with `draft` status
- autosave behaviors

Assessment:

- draft recovery is functional but architecturally fragmented
- there are too many draft authorities

Risk:

- conflict between local draft state, server draft state, and real application records
- harder auditability and harder support/debugging

Opportunity:

- define one canonical draft model
- use local storage only as a temporary resilience cache, not a primary business object

### 5. Eligibility and Academic Assessment Logic

Current surface:

- `apps/admissions/src/lib/eligibilityEngine.ts`
- `apps/admissions/src/hooks/useEligibilityChecker.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useStepValidation.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/validation/paymentValidation.ts`

What exists:

- frontend eligibility heuristics
- basic step validation
- some advisory warning generation

Assessment:

- this area is underpowered and partially placeholder-based
- the current logic is mostly advisory, hardcoded, and permissive

Key issues:

- fallback behavior often allows the user to continue
- eligibility metrics are mocked
- eligibility rules are effectively empty
- some validation paths are stubs

Opportunity:

- this is one of the biggest places to add meaningful intelligence
- move from frontend-only heuristics to a backend-backed rules engine with explainable outcomes

### 6. Duplicate Prevention Logic

Current surface:

- `apps/admissions/src/lib/duplicateApplicationCheck.ts`
- application create/update flows in frontend and backend

What exists:

- frontend duplicate checks against loaded applications

Assessment:

- this is advisory only
- it is not trustworthy enough as a business safeguard

Key issue:

- duplicate prevention fails open on errors and is not enforced on the backend

Opportunity:

- add backend duplicate suppression rules with configurable policies:
  - same user + same intake + same program
  - recent abandoned draft detection
  - merge-or-resume suggestions instead of raw rejection

### 7. Document Upload, OCR, and Verification Logic

Current surface:

- `backend/apps/documents/models.py`
- `backend/apps/documents/views.py`
- `backend/apps/documents/serializers.py`
- `apps/admissions/src/services/documents.ts`

What exists:

- document upload and retrieval
- extraction endpoints
- stored extracted text
- document requirements by workflow

Assessment:

- the infrastructure exists, but business value is not fully extracted from it

Opportunity:

- use OCR output to power:
  - identity matching
  - school/grade extraction
  - document completeness checks
  - confidence-based review queues
  - suspected tampering or mismatch flags

### 8. Payment Logic

Current surface:

- `backend/apps/documents/payment_service.py`
- `backend/apps/documents/views.py`
- `backend/apps/documents/webhook_processor.py`
- `apps/admissions/src/lib/paymentStatus.ts`
- `apps/admissions/src/hooks/usePaymentStatus.ts`
- `apps/admissions/src/pages/student/Payment.tsx`

What exists:

- payment initiation
- webhook verification
- deduplication
- forward-only payment status progression
- application payment synchronization

Assessment:

- this is another relatively mature logic area
- the biggest problem is vocabulary and contract consistency across payment objects and application objects

Key issue:

- payment states and application payment states are related but not yet fully canonicalized into one domain model

Opportunity:

- create a single admissions payment-state model with explicit lifecycle meanings:
  - not_started
  - initiated
  - provider_pending
  - received
  - under_review
  - verified
  - rejected
  - refunded

### 9. Admin Review and Decision Logic

Current surface:

- `backend/apps/applications/views.py`
- `backend/apps/applications/services.py`
- `apps/admissions/src/hooks/admin/useApplicationActions.ts`
- `apps/admissions/src/hooks/admin/useApplicationStatusUpdate.ts`
- `apps/admissions/src/hooks/admin/useApplicationsData.ts`

What exists:

- review actions
- status updates
- frontend admin action hooks

Assessment:

- the domain intent is clear, but admin decisioning still depends too much on operator judgment without enough system assistance

Opportunity:

- add guided review intelligence:
  - completeness score
  - risk flags
  - outstanding requirement summary
  - payment confidence
  - document-confidence score
  - duplicate suspicion
  - deadline urgency

### 10. Interview Logic

Current surface:

- `apps/admissions/src/services/interviews.ts`
- backend interview-related views in `backend/apps/applications/views.py`
- student interview pages/components

What exists:

- interview request/list flows
- student-facing interview view
- single-query interview list improvements already in place

Assessment:

- scheduling works, but it is still operational rather than intelligent

Opportunity:

- add scheduling constraints and smart allocation:
  - interviewer load balancing
  - campus/institution routing
  - time-window preferences
  - conflict detection
  - reminder and no-show recovery logic

### 11. Notifications and Realtime Logic

Current surface:

- `backend/apps/common/event_dispatcher.py`
- `backend/apps/common/sse.py`
- `backend/apps/common/notification_views.py`
- `backend/apps/common/tasks.py`

What exists:

- SSE event dispatch
- notification preferences
- notification sending surface

Assessment:

- the event backbone exists
- the orchestration logic is still too thin

Opportunity:

- use this layer to automate lifecycle-driven communications instead of mostly manual or simple event pushes

### 12. Analytics and Automation Logic

Current surface:

- `backend/apps/analytics/views.py`
- `backend/apps/automation/models.py`
- `backend/apps/automation/views.py`

What exists:

- scaffold analytics responses
- scaffold automation rules/runs

Assessment:

- this area is not yet powering real admissions intelligence
- it is currently the biggest unused business-logic opportunity

Opportunity:

- convert this from scaffold infrastructure into operational intelligence:
  - queue health
  - bottleneck detection
  - SLA tracking
  - rule execution logs
  - explainable automation actions

## What Is Already Strong

The following areas are worth preserving and building on:

1. Central submission and status transition services in `backend/apps/applications/services.py`
2. Payment lifecycle safeguards in `backend/apps/documents/payment_service.py`
3. Dynamic fee calculation in `backend/apps/documents/fee_resolver.py`
4. Role-aware authorization in `backend/apps/accounts/permissions.py`
5. Realtime event backbone in `backend/apps/common/event_dispatcher.py` and `backend/apps/common/sse.py`
6. Existing frontend application state modeling in `apps/admissions/src/lib/applicationStateMachine.ts`

These pieces form a solid base for a more intelligent admissions platform. The next task is not replacing them. The next task is making the rest of the system consistently depend on them.

## Main Business Logic Gaps and Risks

### Critical

#### 1. Contract Drift Between Canonical Domain Values

Symptoms:

- program names vs program codes vs program ids are not consistently used
- payment and application statuses use overlapping but different vocabularies
- frontend duplicate logic compares mixed identifier shapes

Why it matters:

- intelligent rules become unreliable when the same business concept has multiple competing representations

### High

#### 2. Backend Workflow Controls Can Still Be Bypassed by Generic Update Paths

Symptoms:

- serializer-driven partial updates still touch lifecycle-sensitive fields through a generic detail endpoint

Why it matters:

- no intelligent business rule survives if uncontrolled mutation paths remain open

#### 3. Eligibility Logic Is Too Advisory and Too Local

Symptoms:

- mocked metrics
- effectively empty rules
- permissive fallback
- stub validation paths

Why it matters:

- the system cannot confidently guide students, pre-screen applications, or explain decisions

#### 4. Duplicate Prevention Is Not Canonical

Symptoms:

- frontend-only duplicate checks
- fail-open behavior on errors

Why it matters:

- admissions quality and student experience both suffer when duplicates are only detected late or manually

### Medium

#### 5. Draft Ownership Is Fragmented

Why it matters:

- fragmented draft logic makes workflow intelligence harder because there is no single reliable "current intent" object

#### 6. Intake Capacity and Deadline Rules Are Present in Data but Not Fully Enforced in Workflow

Why it matters:

- the system knows about capacity and deadlines but does not act on them consistently enough

#### 7. Document Intelligence Is Underutilized

Why it matters:

- one of the strongest sources of machine-assisted review is already present but not materially used

#### 8. Analytics and Automation Layers Are Mostly Scaffolds

Why it matters:

- operational intelligence cannot mature without real metrics, rules, and execution logs

## Opportunities to Add More Intelligent Business Logic

### 1. Canonical Admissions Rules Engine

Build a single backend rules layer that owns:

- eligibility
- required documents
- payment prerequisites
- intake deadline checks
- capacity checks
- duplicate policies
- institution-specific exceptions

Output shape should be explainable:

- `rule_code`
- `severity`
- `result`
- `message`
- `blocking`
- `source`
- `recommended_action`

This makes the platform intelligent without becoming opaque.

### 2. Intelligent Eligibility Assessment

Move eligibility from hardcoded frontend heuristics to backend-driven, explainable assessment.

Potential logic:

- program-specific subject prerequisites
- minimum grade thresholds
- residency-sensitive recommendations
- alternative qualification matching
- "nearly eligible" routing to foundation or related programs

High-value UX outcome:

- instead of only saying "ineligible", the system can suggest the nearest eligible program or next intake

### 3. Dynamic Intake and Capacity Management

Use `Intake` and `ProgramIntake` data actively.

Potential logic:

- auto-close expired intakes
- auto-stop submissions when capacity is reached
- waitlist overflow candidates
- offer rollover to next intake
- surface urgency banners when deadlines are near

High-value UX outcome:

- students see live, trustworthy application availability instead of learning too late that an intake is closed or full

### 4. Duplicate, Resume, and Re-Entry Intelligence

Potential logic:

- backend duplicate detection on create/submit
- distinguish between draft duplicate, active duplicate, and historical duplicate
- offer "resume existing draft" instead of creating a second record
- offer "apply to next intake" if same program is already active for current intake

High-value UX outcome:

- lower confusion, lower admin cleanup, fewer fragmented applications

### 5. Document Intelligence and Completeness Scoring

Potential logic:

- OCR-based field extraction
- identity consistency checks across documents
- school/grade extraction and matching
- file quality confidence
- completeness score by program and applicant type
- fraud or mismatch flags for manual review

High-value admin outcome:

- reviewers spend less time checking obvious issues manually

### 6. Payment Intelligence and Recovery

Potential logic:

- recover abandoned payment attempts
- detect initiation without completion and prompt the student intelligently
- identify amount mismatch or duplicate provider references
- prioritize applications waiting only for payment verification
- auto-suggest recovery actions after rejection

High-value UX outcome:

- fewer lost applications due to payment confusion

### 7. Review Prioritization and Queue Intelligence

Potential logic:

- queue scoring by:
  - completeness
  - deadline urgency
  - payment readiness
  - document confidence
  - duplicate risk
  - institution priority rules
- auto-bucket applications into:
  - ready for decision
  - waiting for student action
  - high-risk review
  - payment hold
  - interview ready

High-value admin outcome:

- reviewers see the next best action instead of a flat list

### 8. Interview Scheduling Intelligence

Potential logic:

- interviewer assignment by program/campus specialization
- workload balancing
- no-show risk reminders
- timezone and availability windows
- automatic reschedule guidance
- interview outcome follow-up triggers

### 9. Notification and Escalation Automation

Potential logic:

- incomplete draft reminders
- deadline warnings
- rejected payment recovery prompts
- missing document reminders
- offer acceptance reminders
- admin escalation when an application stays in a state too long

Important guardrail:

- every automation should be event-driven and auditable

### 10. Admissions Decision Support

Potential logic:

- generate a reviewer summary from the application packet
- highlight missing or inconsistent fields
- show qualification fit summary
- show a recommended decision with reasons
- explicitly separate recommendation from final human decision

Important guardrail:

- recommendations must be explainable and non-final

### 11. Operational Intelligence and SLA Logic

Potential logic:

- average time per workflow stage
- aging queues
- stuck applications
- payment verification backlog
- interview scheduling backlog
- offer conversion rates
- institution/program bottleneck detection

This turns analytics from passive reporting into business logic that can trigger automation and prioritization.

## Recommended Target State

The admissions platform should move toward this model:

1. Backend owns all blocking business rules.
2. Frontend becomes a guide, not the final authority.
3. Every major workflow action uses a dedicated command endpoint.
4. Every important rule produces an explainable evaluation result.
5. Every automation emits an auditable event.
6. Every derived business state has one canonical definition.

## Suggested Architecture Improvements

### 1. Introduce a Canonical Admissions Domain Layer

Create a backend layer that owns:

- normalized application lifecycle
- eligibility evaluation
- duplicate checks
- readiness scoring
- deadline/capacity checks
- review recommendations

This should sit above models and below API views.

### 2. Replace Generic Lifecycle Mutation with Command Endpoints

Preferred commands:

- `submit_application`
- `withdraw_application`
- `request_payment`
- `verify_payment`
- `reject_payment`
- `schedule_interview`
- `record_interview_outcome`
- `issue_offer`
- `reject_application`
- `return_for_correction`

### 3. Normalize Core Identifiers

Canonicalize:

- `program_id`
- `program_code`
- `intake_id`
- `institution_id`
- `application_status`
- `payment_status`

Human-readable labels should be presentation data, not workflow identity.

### 4. Create an Explainable Rules Response Contract

Every rule system should be able to produce:

- what was checked
- what passed
- what failed
- what is blocking
- what action is suggested

This makes the system feel intelligent and trustworthy.

### 5. Turn Analytics and Automation into Real Systems

Promote scaffold modules into production features:

- persisted rules
- rule execution logs
- automation history
- queue metrics
- SLA breaches
- recommendation acceptance tracking

## Prioritized Roadmap

### Phase 1: Canonicalization and Hardening

Priority: immediate

Goals:

- remove identifier drift
- tighten generic update endpoints
- unify application and payment state vocabularies
- enforce duplicate prevention on backend
- define single draft authority

Expected impact:

- more reliable workflow
- fewer hidden edge cases
- stronger foundation for future intelligence

### Phase 2: Rules and Readiness

Priority: next

Goals:

- backend eligibility engine
- completeness scoring
- deadline/capacity enforcement
- document-driven validation
- review readiness evaluation

Expected impact:

- better student guidance
- better admin triage
- fewer avoidable incomplete submissions

### Phase 3: Automation and Recommendations

Priority: after Phase 2

Goals:

- event-driven reminders
- recovery flows for abandoned payment or incomplete submissions
- reviewer recommendation panels
- queue prioritization logic
- interview scheduling assistance

Expected impact:

- faster operations
- better completion and conversion rates
- more intelligent user experience

### Phase 4: Advanced Intelligence

Priority: after operational basics are stable

Goals:

- risk scoring
- anomaly detection
- acceptance-yield forecasting
- capacity planning
- reviewer performance insights

Expected impact:

- strategic decision support, not just transactional workflow support

## Recommended KPI Set

To evaluate whether business logic is genuinely improving, track:

- draft-to-submission conversion rate
- submission-to-review-start time
- review-to-decision time
- payment initiation-to-verification time
- duplicate application rate
- incomplete submission rate
- return-for-correction rate
- offer acceptance rate
- interview no-show rate
- manual-review override rate for system recommendations

The override rate is especially important. If the system recommends actions but humans constantly disagree, the logic is not yet good enough.

## Guardrails for a Trustworthy Intelligent Admissions System

The application should be intelligent, but not mysterious.

Required guardrails:

1. Explainability: every recommendation should show why it exists.
2. Auditability: every automation should leave a reviewable event trail.
3. Human override: admissions staff must remain the final authority on consequential decisions.
4. Determinism for blocking rules: blocking outcomes should not depend on frontend state.
5. Graceful degradation: if an advisory engine fails, the system should fail safe, not fail open.
6. Versioned rules: policy changes should be traceable over time.

## Highest-Value Immediate Improvements

If the goal is to make the application feel much more intelligent without destabilizing it, the best near-term investments are:

1. Backend-backed eligibility engine with explainable outcomes
2. Backend duplicate suppression with resume suggestions
3. Deadline and capacity enforcement with next-best-intake routing
4. Document completeness and confidence scoring
5. Review queue prioritization and reviewer summaries
6. Event-driven reminder and escalation automation

These six changes would materially improve both student UX and admin operations.

## Appendix: Key Files Referenced

Backend:

- `backend/apps/accounts/permissions.py`
- `backend/apps/accounts/session_views.py`
- `backend/apps/applications/models.py`
- `backend/apps/applications/serializers.py`
- `backend/apps/applications/services.py`
- `backend/apps/applications/views.py`
- `backend/apps/catalog/models.py`
- `backend/apps/documents/fee_resolver.py`
- `backend/apps/documents/payment_service.py`
- `backend/apps/documents/views.py`
- `backend/apps/documents/webhook_processor.py`
- `backend/apps/common/event_dispatcher.py`
- `backend/apps/common/sse.py`
- `backend/apps/common/notification_views.py`
- `backend/apps/analytics/views.py`
- `backend/apps/automation/views.py`

Frontend:

- `apps/admissions/src/services/applications.ts`
- `apps/admissions/src/services/auth.ts`
- `apps/admissions/src/services/catalog.ts`
- `apps/admissions/src/services/documents.ts`
- `apps/admissions/src/services/interviews.ts`
- `apps/admissions/src/lib/applicationStateMachine.ts`
- `apps/admissions/src/lib/applicationSession.ts`
- `apps/admissions/src/lib/draftManager.ts`
- `apps/admissions/src/lib/duplicateApplicationCheck.ts`
- `apps/admissions/src/lib/eligibilityEngine.ts`
- `apps/admissions/src/lib/paymentStatus.ts`
- `apps/admissions/src/hooks/useEligibilityChecker.ts`
- `apps/admissions/src/hooks/useApplicationSubmit.ts`
- `apps/admissions/src/hooks/usePaymentStatus.ts`
- `apps/admissions/src/hooks/useStudentDashboardPolling.ts`
- `apps/admissions/src/hooks/admin/useApplicationActions.ts`
- `apps/admissions/src/hooks/admin/useApplicationStatusUpdate.ts`
- `apps/admissions/src/hooks/admin/useApplicationsData.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useStepValidation.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

## Final Note

The admissions platform does not need "AI" first. It needs stronger canonical business logic first.

Once that is in place, the application can become meaningfully intelligent in a way that users and admins will actually trust:

- better recommendations
- fewer mistakes
- more proactive guidance
- faster review
- stronger operational visibility
- lower manual workload

That is the right path to a dynamic and intelligent admissions system.

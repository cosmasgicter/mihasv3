# Design: Admissions V2 Canonical Rebuild

## 1. Design Status

This document defines the target canonical architecture for the admissions
frontend and backend. It supersedes admissions-specific implementation choices
in earlier active or archived specs when they conflict. It does not erase their
evidence or take ownership of unrelated jobs-ops and infrastructure work.

The implementation is an incremental migration with characterization tests,
not a repository rewrite. A compatibility path has a metric, an owner, and a
removal gate. It is never a second permanent authority.

## 2. Inputs And Precedence

Implementation decisions use this order:

1. `.kiro/steering/product.md`, `structure.md`, `tech.md`,
   `enterprise-tenancy.md`, `infrastructure.md`, `engineering-skills.md`, and
   `design-skills.md`.
2. This spec and `docs/canonical-truth-map.md`.
3. Backend domain services, SQL schema, and generated OpenAPI contracts.
4. Frontend generated types and domain service modules.
5. Historical specs and legacy adapters.

The following skill sequence is mandatory for each implementation slice:

1. `source-code-context`: trace the route, component, service, serializer,
   domain service, model, SQL, test, and operational evidence before editing.
2. `agentic-engineering-workflow`: define the smallest vertical behavior slice,
   add failing proof, implement, and verify it end to end.
3. `neon-postgres`: design and rehearse schema work on an isolated Neon branch;
   production self-hosted Postgres is never the first apply.
4. `code-structure-cleanup`: after behavior passes, remove duplication and split
   ownership without speculative abstraction.
5. `grep-loop-review-workflow`: search for every old route, identifier, role,
   AI label, hardcoded fee, and legacy field until only registered exceptions
   remain.
6. `impeccable` and its audit/adapt/distill/harden/polish guidance: apply the
   repository `DESIGN.md` and `PRODUCT.md`, then run design audit and responsive
   review.
7. `ui-ux-pro-max`: use mobile interaction and accessibility heuristics as
   advice. Repository steering overrides generic style suggestions, including
   the light-only product decision.

## 3. Canonical Architecture

```text
Browser
  -> trusted host tenant context
  -> generated V2 client
  -> /api/v2 domain query or command
  -> authentication + CSRF
  -> capability/ownership/assignment policy
  -> domain service + transaction/outbox
  -> PostgreSQL canonical IDs and constraints
  -> durable worker for external side effects
  -> standard response/error envelope
```

Rules:

- Pages and components do not call `ApiClient` directly.
- Serializers validate transport shape. Domain services enforce business state.
- Views do not reproduce authorization, fee, capacity, or transition logic.
- External email, storage, payment, domain, and document work is requested by a
  committed database outbox/job, not an uncommitted best-effort broker call.
- Frontend state may optimize UX but does not become business truth.
- Display strings are snapshots. They never select or join business records.

## 4. API Version Decision

Product release `2.0.0` and API major are distinct. Admissions V2 introduces
strict corrected contracts under `/api/v2/` because removing generative AI,
permissive envelopes, legacy identifiers, and duplicate document endpoints is
breaking.

Migration sequence:

1. Generate an exact `/api/v1/` usage inventory from server telemetry and source.
2. Add `/api/v2/` endpoints as thin views over the corrected canonical services.
3. Move the V2 frontend vertical slice by slice to the generated V2 client.
4. Freeze `/api/v1/`: no new product behavior, only critical compatibility fixes.
5. Return deprecation metadata on legacy calls and measure callers by route.
6. Remove each V1 adapter only after the declared window, zero first-party
   callers, zero measured required external callers, and rollback readiness.

Until that cutover is implemented, the existing `/api/v1/` URL remains intact.
Changing package/OpenAPI product metadata to `2.0.0` does not itself remove a V1
contract or falsify historical evidence.

## 5. Tenant Context And Authority

### 5.1 Trusted Tenant Resolution

```text
request host
  -> active verified InstitutionDomain exact match
  -> tenant context
  -> optional explicit institution must match

neutral shared portal host
  -> Beanola platform context
  -> explicit institution filter allowed only on endpoints that declare it

unknown/ambiguous host
  -> neutral context or 404 according to route policy
```

Tenant host context cannot be overridden by `?institution=`. Cache keys include
the resolved institution ID and configuration version. Assets and templates use
tenant-scoped object keys and response cache variation.

### 5.2 Authority Model

| Actor | Scope | Canonical authority |
|---|---|---|
| Platform_Admin | Platform | `platform.*` capabilities from `AdminCapabilityService` |
| Tenant_Admin | Named institution memberships | `tenant.*` capabilities resolved per institution |
| Reviewer | Named institution membership plus application assignment | reviewer queue/read/review policy and only the specific actions assigned |
| Student | Owned profile/application | object ownership plus legal workflow state |
| Public tracker | One application | random tracking secret, trusted host binding, rate limit, minimum disclosure |

Every protected endpoint has a registry entry:

```text
method + route
required authentication
platform capability OR tenant capability OR assignment/ownership rule
tenant object path
state precondition
idempotency policy
audit event
```

The registry generates API allow/deny tests and frontend route metadata. The
frontend capability context is a UX projection, never the enforcement layer.

### 5.3 People And Access

The user record owns identity and platform role. `InstitutionMembership` owns
staff association and baseline tenant role. `UserAccessGrant` narrows or extends
an allowed tenant capability to a constrained offering/application target.

The old arbitrary permission editor is removed. The user page contains:

- identity/account state;
- platform role, when caller has platform authority;
- memberships and invitation status;
- grants with named target selectors;
- read-only Effective_Capabilities;
- session revocation status and audit history.

Reviewer assignment requires active membership in the application's tenant and
an eligible reviewer policy. Auto-assignment selects only from the same set and
locks workload counters.

## 6. Tenant Lifecycle

### 6.1 Aggregate And States

```text
draft -> in_review -> active -> suspended -> active
                   \-> rejected
draft/in_review -> cancelled
```

Only `active` tenants can receive new applications. Suspending a tenant stops
new applications and configuration writes according to policy without deleting
existing student access or historical documents.

`TenantOnboarding` is a durable workflow aggregate:

```text
id, institution_id, state, current_step, configuration_version,
created_by, idempotency_key, blockers, last_error, timestamps
```

Each step is independently transactional and resumable. External side effects
use the outbox. The final activation command locks the institution, computes
readiness from live data, and changes state only if blockers are empty.

### 6.2 Readiness Invariants

An active admissions tenant has:

- valid public name, legal/support contacts, timezone, currency, and approved
  branding;
- an intentional domain policy and, when custom domain is required, an active
  verified domain;
- an active document profile and versioned required-document rules;
- at least one active Program_Offering;
- at least one active Intake_Offering with valid dates and capacity;
- exactly one applicable active application fee for each enabled residency path;
- an active Tenant_Admin membership/invitation handoff;
- successful routing simulation for its enabled offerings;
- tenant-scoped communication templates or an explicit platform fallback policy.

### 6.3 Domain State Machine

```text
pending_verification -> verification_failed -> pending_verification
pending_verification -> pending_review -> verified -> active
active -> disabled -> active
pending_review -> rejected -> pending_verification
```

All transitions are commands on one service. Creating or retrying commits a
domain-verification job before returning accepted. Verification proves domain
control; approval remains an explicit platform decision where policy requires.

### 6.4 Tenant Change Requests

Protected tenant edits use `TenantChangeRequest`:

```text
draft -> submitted -> approved -> applied
                   \-> rejected
draft/submitted -> cancelled
```

Payloads are typed by change kind and revalidated at application time. Approval
does not directly patch a JSON blob; it calls the canonical domain command in a
transaction and records before/after versions.

## 7. Canonical Catalog And Assignment

### 7.1 Ownership Graph

```text
CanonicalProgram (platform definition)
  -> ProgramOffering (institution-specific presentation and policy)
       -> IntakeOffering / ProgramIntake (dates, capacity, waitlist policy)
       -> FeeSchedule (type, residency, currency, amount, provider-fee policy)
       -> RequirementProfileVersion
       -> EligibilityRuleVersion
```

Required SQL invariants include:

- unique active `(institution_id, canonical_program_id)` according to the
  business rule;
- unique `(program_offering_id, intake_id)`;
- one active fee `(program_offering_id, fee_type, residency)`;
- non-negative capacity/enrolled/waitlist counters and enrolled not greater than
  capacity when overbooking is disabled;
- unique waitlist position within an Intake_Offering;
- one active requirement/profile version per scoped key.

### 7.2 Application Assignment

The application stores:

```text
institution_id
canonical_program_id
program_offering_id
intake_id / intake_offering_id
assignment_version
institution/program/intake display snapshots
```

`StartDraftCommand` accepts canonical offering and intake IDs. The server locks
and validates the graph, derives every other field, snapshots display values,
and returns the new draft.

Generic PATCH never accepts assignment identifiers or their display snapshots.
Before any payment exists, `ChangeSelectionCommand` may atomically reassign the
draft, update every canonical ID/snapshot/requirement/eligibility/fee reference,
clear invalid dependent answers, bump the optimistic version, and return a
change summary. Payment activity makes assignment immutable.

### 7.3 Capacity And Waitlist

Submission locks the application and Intake_Offering in a fixed order. It
revalidates configuration, checks capacity, and either increments the admitted/
application counter or allocates the next constrained waitlist position in the
same transaction. Withdrawal and promotion use the same IDs and locks. No
display string participates in a query or counter.

## 8. Application And Draft Lifecycle

### 8.1 State Machine

The existing status catalogue is retained only where each state has a defined
entry command, exit command, actor, and allowed next action. The migration first
documents and tests the real transition graph, then removes unreachable aliases.

High-level path:

```text
draft
  -> submitted/deferred_payment
  -> under_review
  -> amendment_requested -> under_review
  -> interview_required -> interview_scheduled -> under_review
  -> conditionally_approved -> approved -> enrolled
  -> waitlisted -> under_review/approved
  -> rejected | withdrawn | cancelled
```

Payment provider state is not encoded by multiplying application statuses. The
application exposes a derived payment summary from canonical `Payment` rows.

### 8.2 Frontend Draft Machine

One state machine owns:

```text
uninitialized
  -> loading -> ready.clean <-> ready.dirty
  -> saving -> ready.clean
  -> offline.queued -> saving
  -> conflict -> reload | explicit merge
  -> deleting -> deleted
  -> submitting -> submitted | ready.with_errors
```

Events include `START_NEW`, `RESUME`, `EDIT`, `SAVE_DUE`, `SAVE_NOW`,
`NETWORK_LOST`, `NETWORK_RESTORED`, `SERVER_CONFLICT`, `DELETE`, `PAY`, and
`SUBMIT`. The machine calls small adapters for API, local outbox, uploads, and
navigation. It does not contain form rendering.

Local records are addressed by `(user_id, application_id, assignment_id)` and
contain only pending deltas and retry metadata. They never include authentication
secrets or raw uploaded documents. Cleanup is application-scoped.

### 8.3 Readiness

`GET /api/v2/student/applications/{id}/readiness/` is authoritative and returns:

- assignment/configuration version;
- profile and identity blockers;
- persisted canonical grade count and eligibility results;
- versioned required-document states;
- fee quote/payment/defer state;
- capacity/duplicate/late checks;
- declarations;
- allowed next actions and recoverability codes.

Client validation provides immediate field UX but never declares the
application submittable on its own. Submission reruns readiness under locks.

## 9. Grades, Documents, And De-AI

### 9.1 Deterministic Admissions

Admissions V2 removes generative AI from student and reviewer workflows. It
deletes AI summaries, prompt/cache/circuit-breaker UI and endpoints, AI badges,
and automatic AI document authority.

Student summary is a deterministic projection of their stored answers and
readiness. Reviewer readiness is a structured checklist of verified facts and
allowed actions. Neither produces persuasive prose or a recommendation.

If jobs-ops retains an AI integration, its dependency and settings move behind
the jobs-ops boundary so admissions has no runtime import.

### 9.2 Grades

The subject catalog is seeded and versioned by the backend. Selectors contain
only canonical UUIDs. Students manually enter grades; server mutations persist
and return the canonical record. Readiness counts unique persisted records, not
local row contents.

Optional server OCR is deterministic assistance only:

```text
upload -> malware/type/size check -> local OCR -> deterministic parser
       -> candidate(subject_id, grade, confidence, source_region)
       -> explicit student confirmation -> grade mutation
```

Low confidence or unknown subjects stay unconfirmed. Tesseract/browser packages
with no runtime use are removed.

### 9.3 Required Documents

Requirements are versioned and snapshotted to the application assignment. The
wizard renders each server requirement, including custom tenant types. Each
document is an immutable version with a checksum and structured lifecycle:

```text
uploaded -> scanning -> ready_for_review -> verified
                   \-> rejected -> replacement uploaded
uploaded/scanning -> processing_failed -> retry
```

A partial unique index enforces one current document per application and
requirement. Replace creates a new version and supersedes the previous row.
Object upload and metadata use a staged object key plus committed metadata; on
failure, compensation deletes the staged object or a sweeper reconciles it.

## 10. Payment And Settlement

### 10.1 Fee Quote

`CreateFeeQuote` accepts the application ID. It loads the immutable assignment,
residency, active fee policy, and provider-fee bearer, then stores and returns:

```text
quote_id, application_id, configuration_version,
base_amount, provider_fee, total_amount, currency,
residency, expires_at, signature/status
```

The frontend displays these values and never computes a percent or fallback.
There is no K150/USD20 default. Missing or ambiguous configuration returns
`FEE_NOT_CONFIGURED`.

### 10.2 Payment State Machine

```text
quoted -> initiated -> provider_processing -> paid -> verified
                 \-> action_required
                 \-> failed_retryable -> initiated
                 \-> failed_terminal
quoted/initiated -> expired
paid/verified -> refund_pending -> refunded
verified -> manually_resolved (audited exceptional command only)
```

Provider phone/network routing is server-authored. Initialization and callback
events have idempotency keys, signed webhook verification, immutable event rows,
and reconciliation. A local deterministic adapter implements the same contract.

Wizard ownership ends at submission. The payment page owns recovery/history for
deferred or submitted applications. Settlement queries filter institution in
SQL and expose backend aggregates, never a client-filtered global list.

Payment is linked to an application by a validated non-null foreign key after
orphan remediation. Application payment fields become a read projection until
legacy columns are contracted.

## 11. Review, Conditions, Enrollment, And Official Documents

### 11.1 Review Workspace

One application detail query returns structured sections and ETags/versions.
Commands remain separate for clear authority and idempotency. The workspace
shows facts, evidence, history, and allowed next actions. It does not perform
five compatibility detail requests or show AI-generated analysis.

Reviewer assignment, document verification, payment exception, amendment
review, interview update, and decision commands lock their relevant rows and
emit tenant-scoped audit and outbox events.

### 11.2 Conditions And Enrollment

Each offer condition owns evidence versions, student comment, status, reviewer,
reason, and deadline:

```text
open -> evidence_submitted -> verified
                          \-> changes_required -> evidence_submitted
open/evidence_submitted -> waived (explicit authorized reason)
```

Enrollment readiness is server-authored. Confirmation locks the application and
offer/enrollment record, rechecks status, all mandatory conditions, deadline,
capacity, and existing enrollment, then commits idempotently.

### 11.3 Official Documents

Canonical routes own issue, job status, list, email, and download. A 202 response
is returned only after a durable generation job is committed. Broker outage
after commit is recovered by the dispatcher; failure before commit returns 503.

Issuance eligibility and read-existing eligibility are different policies. A
terminal application may not create a new artifact, but the owner can continue
to read a previously issued lawful document according to retention policy.

Artifacts use `(application, document_type, source_version, template_version)`
fingerprints for idempotency. Legacy slip/letter/receipt endpoints proxy to this
service only during the measured V1 window.

## 12. Communications, Notifications, And Tracking

Communication delivery uses a tenant-scoped outbox and versioned template.
Preferences have one schema for supported channels; mandatory transactional
messages are clearly distinguished from optional notifications. The student has
one communications history/inbox route available from mobile navigation.

Amendment, condition, interview, payment, and decision recipients are derived
from application ownership and authorized institution memberships, never all
admins globally.

Public tracking uses a random, revocable, hashed tracking secret and minimal
response. An institution domain can reveal only an application for that same
tenant. The shared portal may resolve by token without displaying extra tenant
data beyond the response. Attempts are rate-limited and audited without logging
the raw token. Share links include the random token, not an application number.

## 13. Frontend Information Architecture

### 13.1 Student

Primary mobile navigation has four frequent destinations plus More:

1. Dashboard
2. Apply
3. Payment
4. Interview
5. More: Communications, Profile/Settings, Help, Sign out

Dashboard first viewport:

1. current next required action;
2. active draft or most relevant submitted application;
3. concise status/deadline/amount;
4. secondary application history.

One canonical application workspace replaces duplicate detail/status pages.
Document commands use one primary action and an accessible overflow menu.

During the wizard, global bottom navigation is suppressed. The wizard has one
safe-area-aware action bar with Back and Continue/Submit. Draft selection is an
integrated responsive dialog/sheet, not an overlapping fixed launcher. Mobile
shows current step, compact progress, blockers, and save state without rendering
an entire vertical stepper before the form.

### 13.2 Admin

Admin information architecture is task-focused:

- Dashboard: scoped operational exceptions and truthful aggregates.
- Applications: server query, saved filters, queue, detail/review.
- Tenants: onboarding, configuration, readiness, domain, staff, grants, audit,
  settlement.
- Catalog: canonical programs, offerings, intakes, fees, requirements.
- Users: identity, memberships, grants, effective authority, sessions.
- Communications and operations: durable delivery and job exceptions.

Desktop uses compact tables where comparison matters. Mobile uses record rows
and detail sheets without replacing real pagination or hiding actions.

### 13.3 Visual And Interaction Rules

- Use repository `DESIGN.md` tokens and Inter typography.
- Light-only, restrained neutral surfaces with semantic status colors.
- One `PageShell`; sections are unframed or use one `SectionCard` layer.
- No nested cards, decorative gradients, glass effects, AI sparkle treatment,
  fake real-time counters, or marketing copy in operational screens.
- Use Lucide icons, tooltips for unfamiliar icon buttons, focused dialogs for
  destructive actions, and form controls suited to the data.
- Minimum 44 by 44 CSS pixel targets, visible focus, semantic labels, error
  summaries/focus, reduced motion, 200/400 percent zoom, and safe-area support.
- Test 320, 375, 390, 768, 1280, and 1440 pixel viewport widths with long tenant
  and program names.

## 14. API Contract

### 14.1 Envelopes

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "request_id": "uuid",
    "api_version": "v2"
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "FEE_NOT_CONFIGURED",
    "message": "The application fee is not configured.",
    "fields": {},
    "retryable": false
  },
  "meta": {
    "request_id": "uuid",
    "api_version": "v2"
  }
}
```

The message is safe for users; logs use the code and correlation ID. Pagination
has one cursor or page schema selected per endpoint class, never a union of
`results`, `applications`, raw arrays, and alternate count fields.

### 14.2 Idempotency And Concurrency

Commands that create external or irreversible effects require `Idempotency-Key`.
Mutable aggregates expose an integer version or ETag. Conflicts return 409 with
current version and safe recovery metadata. Database uniqueness remains the
final race guard; services catch violations and return stable domain errors.

### 14.3 Generated Client

CI generates OpenAPI from the candidate backend, validates it, generates the
TypeScript client/schema types, compiles frontend fixtures, and compares the
committed schema only when the repository deliberately commits a baseline.
Pages import domain hooks/services, not the raw transport client.

## 15. Database Migration And Verification

### 15.1 Source Of Truth

Because core models use `managed=False`, SQL migration history and live
Postgres introspection require stronger reconciliation. The release produces a
machine-readable schema manifest rather than trusting hand-maintained table/FK
lists or the stale `00_full_schema.sql` alone.

Manifest fields:

```text
tables, columns, types, nullability, defaults,
PK/FK targets and validation state,
unique/check/exclusion constraints,
indexes and predicates,
triggers, extensions,
migration ids/checksums/applied_at
```

The verifier compares fresh-from-empty, migrated production snapshot, Neon
branch, and production read-only manifests. Missing required indexes and
unvalidated FKs are failures.

### 15.2 Migration Sequence

1. Inventory real production values, nulls, duplicates, orphans, mismatches, and
   legacy endpoint/column use without mutation.
2. Add new columns/tables/indexes/constraints as nullable or `NOT VALID` where
   online safety requires.
3. Deploy dual-read validation or shadow comparison, not a permanent dual-write
   authority.
4. Backfill in bounded idempotent batches with checkpoints and exception ledger.
5. Verify zero mismatches and repair/quarantine explicitly.
6. Switch reads/writes to canonical fields and enforce `NOT NULL`/validated
   constraints online.
7. Observe through a defined compatibility window.
8. Contract legacy columns/routes only after grep, telemetry, schema, and
   rollback gates are zero/ready.

Priority schema corrections:

- tenant communication template uniqueness and active-version policy;
- canonical assignment non-null FKs and snapshot consistency;
- Program/Intake offering, grant, fee, waitlist, and profile-version uniqueness;
- validated tenant foreign keys;
- capacity counter checks and indexes;
- immutable document versions and one-current partial unique index;
- Payment.application orphan remediation and non-null FK;
- condition/amendment/onboarding/outbox durability tables;
- migration history and full schema snapshot regeneration.

## 16. Local E2E And Evidence Architecture

The release harness starts:

```text
Postgres + Redis + S3-compatible local object storage
Django API + Celery worker/beat
React production-preview server
console/test email inbox
deterministic payment and domain verification adapters
Playwright browsers
```

It creates users and two tenants through public/admin APIs. It does not depend
on a developer database, staging storage state, production provider, or hidden
environment toggle.

### 16.1 Required Journey Matrix

| Journey | Desktop | Mobile | Negative/recovery proof |
|---|---|---|---|
| Tenant onboarding and launch | Yes | 390 | partial failure, resume, duplicate idempotency, blocked activation |
| Domain and change request | Yes | 390 | failed verification, retry, mismatched host override |
| Staff/membership/grant | Yes | 390 | unsupported role, cross-tenant selector/UUID |
| Catalog/offering/intake/fee | Yes | 390 | duplicate race, missing fee, same names across tenants |
| Reviewer/admin review | Yes | 390 | assignment denial, read-only capability mutation denial |
| Student auth/profile | Yes | 320/390 | verification, expired refresh, offline autosave/conflict |
| Two drafts and wizard | Yes | 320/390 | switch/rename policy, refresh, cache isolation, reroute blocked by payment |
| Grades/dynamic documents | Yes | 375 | fake/unknown subject, custom requirement, replace, interrupted upload |
| Payment/defer/recovery | Yes | 390 | fail, timeout, duplicate/delayed callback, expired quote |
| Conditions/amendments/enrollment | Yes | 390 | rejection/replacement, duplicate pending, concurrent confirm |
| Communications/interview | Yes | 390 | delivery failure/retry, tenant recipient isolation |
| Official documents/tracker | Yes | 390 | broker unavailable, terminal read, invalid/other-tenant token |
| Audit/settlement/export | Yes | 390 | page 2+, cross-tenant query, redaction |

All journeys assert network results, database invariants, mail/job drain, and no
unhandled browser exceptions. Screenshots and accessibility scans cover normal,
loading, empty, error, conflict, offline, and success states where relevant.

## 17. Observability And Privacy

Each domain command records correlation ID, tenant, actor, aggregate ID, command,
result code, duration, version, and idempotency outcome. Sensitive values are
redacted at the logging boundary. Raw tracking tokens, JWTs, passwords, mobile
money secrets, personal documents, and complete applicant payloads are never
logged.

Operational queues expose age and terminal-failure counts for onboarding,
domain verification, document processing/generation, payment reconciliation,
communications, and cleanup. "Queued" means a committed durable record exists.

## 18. Implementation Slices

The dependency order prevents UI work from cementing a broken data contract:

```text
0. evidence harness, route/authority/schema inventory
1. strict API envelope/client/auth pipeline
2. canonical tenant context and authority registry
3. schema constraints + catalog/onboarding canonical commands
4. application assignment, draft state machine, readiness
5. deterministic grades/documents and de-AI removal
6. fee quote/payment/reconciliation
7. admin review, conditions, enrollment, communications, official documents
8. student/admin mobile UI convergence and de-fluff
9. legacy endpoint/column contract and production rollout
```

Within a slice: characterize, add failing integration test, add schema/service,
expose API, generate client, implement UI, run browser journey, remove replaced
code, grep-loop, audit responsive/accessibility behavior, and attach evidence.

## 19. Risks And Controls

| Risk | Control |
|---|---|
| Broad rewrite causes regressions | Vertical slices, characterization tests, one aggregate at a time |
| Capability cutover locks out staff | Generated authority matrix, shadow comparison, emergency audited platform path |
| Canonical backfill corrupts assignments | Read-only inventory, deterministic resolver, exception ledger, snapshot comparison, Neon rehearsal |
| Constraint creation blocks production | Duplicate/orphan preflight, concurrent indexes, `NOT VALID` then validate, bounded locks |
| Payment cutover duplicates charges | Idempotency/event ledger, provider reconciliation, canary, no automatic replay of unsafe calls |
| De-AI removal loses useful data | Preserve historical extraction as labeled provenance, manual entry/review path, deterministic fixture corpus |
| V1 consumers break | Usage telemetry, V2 generated client, announced window, adapter rollback |
| Mobile cleanup hides commands | Journey matrix, viewport/zoom/a11y screenshots, allowed-next-action contract |
| Evidence becomes another stale document | Candidate-generated artifacts with commit/schema checksums and CI freshness gate |

## 20. Completion Definition

The design is implemented only when the required journey matrix passes with no
required skips, schema evidence agrees across environments, every P0/P1 finding
has regression proof, no admissions runtime AI path remains, first-party V2 UI
uses only canonical V2 services, required background work drains or reaches an
asserted terminal state, and the canary/post-deploy checks prove tenant, payment,
document, and audit isolation.

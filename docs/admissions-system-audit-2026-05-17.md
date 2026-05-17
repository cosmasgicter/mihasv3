# Admissions System Audit

**Date:** 2026-05-17  
**Scope:** Admissions backend, admissions frontend, operator workflows, cross-layer contracts, production readiness  
**Mode:** Exploratory audit followed by staged remediation

## Executive Summary

The admissions platform is already materially stronger than a typical school application portal. It has a real lifecycle model, resilient draft handling, payment reconciliation, idempotency, review SLAs, waitlists, conditions, amendments, audit trails, and unusually deep regression/property testing.

The principal risk is no longer missing functionality. It is **semantic drift**:

- the backend domain is richer than some analytics and UI surfaces
- some frontend abstractions still describe earlier platform capabilities
- several large files have become concentration points for future regression risk
- operational evidence trails are less mature than the runtime code

## Current Scores

### Production Readiness Score: **89 / 100**

The codebase is close to launchable and materially hardened:

- frontend type-check, lint, CSP guard, bundle guard, production build, and the current targeted critical slice pass
- backend `manage.py check`, Python compilation, and the current targeted critical slice pass
- auth/session/CSRF handling, payment hardening, admin redaction, public tracking minimization, and operational runbooks are all stronger than baseline

The score is held below 90+ by evidence gaps rather than missing core capability:

- the full frontend suite is not green after the 2026-05-17 redesign because several assertions still describe older UI contracts
- the local environment does not yet provide a clean full backend parity run with Postgres + Redis
- release, restore-drill, deploy, and secret-rotation evidence remain pending
- one archived SQL artifact referenced by historical governance docs/tests is still absent from disk

### Slop Score: **24 / 100**

Lower is better. This is not a sloppy system; it is a good system with residue.

The score is driven mostly by:

- stale tests and docs that still refer to retired concepts such as `AuthLayout`
- drift between old invariants and current redesign copy/structure
- a few obsolete compatibility expectations surviving after module decomposition and payment-throttle hardening
- documentation archaeology around legacy SQL/env history that is not yet fully reconciled

The strongest anti-slop signal is that most failures are now **drift failures**, not evidence of broken production behavior. The code itself is often ahead of the paperwork around it.

## System Verdict

| Area | Assessment |
| --- | --- |
| Backend domain model | Strong |
| Payment architecture | Strong |
| Auth / CSRF / RBAC | Strong |
| Student journey | Good, with post-submission polish gaps |
| Admin journey | Capable, but not yet optimally compressed for triage |
| Analytics / reporting | Needs alignment with the modern lifecycle |
| Cross-layer consistency | Needs deliberate cleanup |
| Production readiness | Code is ahead of release evidence |

## Verification Snapshot — 2026-05-17

| Gate | Result |
| --- | --- |
| Admissions frontend type-check | Pass |
| Admissions frontend lint | Pass |
| Admissions frontend dynamic import / entry / CSP checks | Pass |
| Admissions frontend production build | Pass, with large PDF chunk warning |
| Focused admissions frontend regression slice | Pass |
| Full admissions frontend suite | Not green: latest full run observed 44 failed files / 62 failed tests before subsequent targeted drift repairs; exact current count needs one more clean full rerun |
| Backend `manage.py check` | Pass |
| Backend Python compilation | Pass |
| Focused backend regression slice | Pass: 60 tests |
| Exact secret-pattern scan | Clean for checked high-risk patterns |

## Severity Matrix

| Severity | Meaning |
| --- | --- |
| Critical | Can cause material data loss, security failure, or false institutional decisions |
| High | Can mislead operators, cause major workflow drift, or create recurring reliability risk |
| Medium | Creates friction, maintainability cost, or degraded user confidence |
| Low | Polish or bounded technical debt |

## Gap Matrix

| Subsystem | Gap | Severity | Evidence |
| --- | --- | --- | --- |
| Lifecycle semantics | Backend, frontend, docs, and analytics do not always describe the same state model | High | `backend/apps/applications/services.py`, `apps/admissions/src/pages/student/ApplicationStatus.tsx`, `.kiro/steering/product.md` |
| Analytics | Funnel and payment reporting historically omitted several modern statuses | High | `backend/apps/analytics/admissions_analytics.py` |
| Review queue | Payment readiness semantics historically lagged approval policy for deferred payments | High | `backend/apps/applications/review_queue.py`, `backend/apps/applications/admin_views.py` |
| Frontend/backend contract | Storage hooks described document list/delete as unavailable despite backend support | Medium | `apps/admissions/src/hooks/queries/useStorageQueries.ts`, `backend/apps/documents/views.py` |
| Admin UX | Operator surfaces contain duplicated metrics, dead/legacy components, and weak prioritization | High | `apps/admissions/src/pages/admin/Applications.tsx`, `apps/admissions/src/components/admin/applications/` |
| Student UX | Core wizard is strong; dashboard and some post-submit flows are denser or weaker than needed | Medium | `apps/admissions/src/pages/student/Dashboard.tsx`, `ApplicationStatus.tsx`, `Interview.tsx` |
| Code architecture | Several files exceed healthy module boundaries | High | `useWizardController.ts`, `payment_service.py`, `documents/views.py`, `admin_views.py`, `student_views.py` |
| Operations | Release evidence, restore proof, and secret-rotation evidence remain pending | High | `docs/production-readiness-status-2026-05-04.md` |

## End-to-End Journey Findings

### Applicant Journey

`Discover → Register → Start draft → Wizard → Documents → Payment/defer → Submit → Track → Interview/decision → Amend/withdraw/enroll`

**Strongest points**

- resilient autosave and draft recovery
- robust payment handling for real-world network/payment uncertainty
- explicit submission gates and duplicate protection
- rich post-submission lifecycle support

**Weakest points**

- post-submission flows are less polished than the wizard
- some action eligibility is inconsistent across layers
- dashboard information density is higher than the student’s immediate need

### Admin Journey

`Login → Dashboard → Find work → Triage → Verify → Decide → Communicate → Configure → Audit`

**Strongest points**

- broad operational coverage
- auditability
- safe admin workflows
- extensible domain depth

**Weakest points**

- the dashboard is more summary than command center
- applications page is feature-rich but visually crowded
- the review queue does not yet compress urgency as well as the backend could support

## Prioritized Roadmap

### Wave 1 — Canonical Truth

1. Align lifecycle semantics across backend, frontend, docs, and analytics.
2. Remove stale capability seams between frontend abstractions and backend endpoints.
3. Close release-evidence and secret-rotation proof gaps.

### Wave 2 — Operational Compression

1. Add a true “attention required” layer for SLA breaches, conditions, enrollments, documents, and deferred-payment follow-up.
2. Make admin filters fully catalog-driven and lifecycle-complete.
3. Consolidate duplicated metrics and elevate actual decision controls.

### Wave 3 — Structural Risk Reduction

1. Decompose large modules by workflow boundary.
2. Normalize observability for graceful-degradation paths.
3. Strengthen schema-evolution ergonomics and drift detection.

### Wave 4 — UX Refinement

1. Re-center the student dashboard on status, next action, and deadlines.
2. Upgrade amendments, interview, and conditional-admission flows.
3. Finish accessibility and modal-consistency work.

## Initial Remediation Actions Started

The first remediation batch intentionally targets **low-risk, high-confidence alignment work**:

1. Expanded analytics to include the full modern application lifecycle.
2. Expanded payment analytics to include deferred, expired, and force-approved states.
3. Aligned review queue payment readiness with the same resolved-payment policy already used by review approval.
4. Reconnected frontend storage hooks to the backend’s existing document list and delete endpoints.
5. Removed dead duplicate admin application components and collapsed duplicated metrics on the applications page.
6. Added overdue-review, expiring-condition, and expiring-enrollment urgency counters to the admin dashboard.
7. Aligned student amendment visibility with the backend’s actual amendable statuses and added client-side email/phone validation.
8. Moved the student interview page onto the shared React Query cache model and restored safe post-login redirects for communications/history deep links.
9. Removed the obsolete frontend submission-notification shim now that Django owns the real submission communication flow.
10. Made amendment requests use real backend serializer validation instead of bypassing their declared contract.
11. Corrected admin communication semantics so direct email is real email, in-app is real in-app, and unavailable SMS is no longer presented as functional.
12. Extended the student timeline to represent conditional approval, enrollment, withdrawal, and expiry states.
13. Centralized admin application status badge semantics and removed another dead metrics layer from the applications workspace.
14. Wired reviewer-assignment, late-submission, and pending-amendment filters end-to-end so admin triage controls now affect real query results.
15. Split strict `approved` counts from the broader accepted path (`conditionally_approved`, `approved`, `enrolled`) across admin overview and dashboard metrics.
16. Converted dashboard needs-attention links into real triage filters and added first-class applications-list support for review queue, overdue review, pending documents, and upcoming interviews.

These changes improve system truth without changing user-facing policy.

## Decisions Still Requiring Product Confirmation

| Decision | Why it needs confirmation |
| --- | --- |
| Whether students may withdraw `conditionally_approved` and `approved` applications | Backend allows it today; frontend/docs currently imply a narrower rule |
| Whether deferred payments should count as “ready for decision” in every operator view or only as “submission allowed” | Backend review approval allows deferred; some teams may want a distinct queue treatment |
| Whether hardcoded/legacy admin components should be deleted immediately or removed in a staged cleanup | Deletion is safe-looking, but coordination matters when a repo has multiple active contributors |

## Recommended Success Criteria

The remediation program is succeeding when:

- every lifecycle state is represented consistently in analytics, filters, UI labels, and docs
- operator dashboards surface urgency, not just totals
- no frontend abstraction claims a backend capability is absent when it exists
- large files shrink around clear domain boundaries
- a new engineer can infer the platform’s truth from one place, not five
- release readiness can be proven from artifacts, not recollection

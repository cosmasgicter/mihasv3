# Evaluation of Admissions Business Logic Audit

Date: 2026-04-10
Method: Cross-referenced audit claims against live codebase, live Neon database (project `wild-bar-37055823`), and recent hardening spec work.

## Verdict

The audit is accurate, well-structured, and actionable. Every major claim was verified against the actual code and live data. The prioritization is sound. A few claims need nuance based on recent hardening work, and a few risks are more severe than stated.

---

## Claim-by-Claim Verification

### 1. Contract Drift Between Canonical Domain Values — CONFIRMED, WORSE THAN STATED

The audit says program names vs codes vs IDs are inconsistently used. Live data proves this is actively causing drift:

| Where | Identifier Used | Type |
|-------|----------------|------|
| `applications.program` | `"Diploma in Registered Nursing"` | Name (string) |
| `FeeResolver.resolve_fee()` | `program_code` parameter | Code (e.g. `"DRN"`) |
| `PaymentService.initiate_payment()` | `application.program` → passed to FeeResolver as `program_code` | Name passed where code expected |
| `programs` table | `code="DRN"`, `name="Diploma in Registered Nursing"` | Both exist |
| `applications.institution` | Mixed: `"KATC"` (code), `"Kalulushi Training Centre"` (name), `"MIHAS"` (code), `"Mukuba Institute of Health and Allied Sciences"` (name) | Inconsistent |

**Critical finding the audit missed:** `PaymentService.initiate_payment()` passes `application.program` (a name like `"Diploma in Registered Nursing"`) directly to `FeeResolver.resolve_fee(program_code=...)`, which calls `Program.objects.get(code=program_code)`. This will raise `Program.DoesNotExist` for every real application because names don't match codes. The only reason this hasn't blown up in production is that the Lenco widget flow likely catches the error or the fee falls back. This is a live bug, not just drift.

**Institution drift is also confirmed:** Some applications store `"KATC"` (code), others store `"Kalulushi Training Centre"` (full name). The `validate_program_intake_compatibility()` function resolves by name, which won't match code-stored records.

**Severity: CRITICAL — higher than the audit states.**

### 2. Generic Update Path Bypass — CONFIRMED

The `ApplicationDetailView` uses `ApplicationSerializer` for PATCH updates. The serializer exposes `status`, `payment_status`, `eligibility_status`, and other lifecycle fields as writable. A student could theoretically PATCH their application status directly.

The `IsOwnerOrAdmin` permission check allows the owner to update, and the serializer doesn't restrict which fields are writable based on the current status.

**Mitigation since audit:** The `ALLOWED_TRANSITIONS` state machine in `services.py` now blocks invalid transitions, but only when `transition_application_status()` is called. A direct PATCH to `status` via the serializer bypasses this entirely.

**Severity: HIGH — confirmed as stated.**

### 3. Eligibility Logic Is Advisory and Local — CONFIRMED

`eligibilityEngine.ts` defines types and constants but the actual assessment functions are mostly structural. The `canProceed` check in the state machine always returns `true` for the payment step. The `useEligibilityChecker` hook runs frontend-only heuristics.

The `course_requirements` table has 18 rows of real program-specific subject requirements, but nothing in the backend reads them during application create/submit. This is wasted data.

**Severity: HIGH — confirmed as stated.**

### 4. Duplicate Prevention Is Frontend-Only — CONFIRMED

`duplicateApplicationCheck.ts` fetches the user's own applications client-side and compares program + intake. It catches errors and returns `{ hasDuplicate: false }` — fail-open. No backend duplicate check exists.

**Severity: HIGH — confirmed as stated.**

### 5. Draft Ownership Is Fragmented — CONFIRMED

Four draft authorities exist:
1. `localStorage` via `draftManager.ts` (checks `applicationWizardDraft` and other keys)
2. `sessionStorage` via same
3. `ApplicationDraft` model (server-side, `application_drafts` table)
4. `Application` records with `status='draft'` (the real application row)

`ApplicationSessionManager` has 500+ lines managing the interplay between local storage, server drafts, and real application records. The `DraftManager` has its own clearing logic with race condition prevention. This is genuinely fragmented.

**Severity: MEDIUM — confirmed as stated.**

### 6. Intake Capacity and Deadline Rules Not Enforced — CONFIRMED

Live data shows:
- `January 2026 Intake`: deadline `2025-12-31`, `is_active=true`, `current_enrollment=3`, `max_capacity=200`
- Applications exist for this intake with `submitted_at` in 2026 — after the deadline

The `validate_program_intake_compatibility()` function checks `intake.is_active` but does NOT check `application_deadline` or capacity. Students can submit after deadlines and beyond capacity.

**Severity: MEDIUM-HIGH — slightly worse than stated because deadline data exists but is actively ignored.**

### 7. Document Intelligence Is Underutilized — CONFIRMED

`application_documents` has an `extracted_text` column (defaults to empty string). The OCR infrastructure exists but nothing reads `extracted_text` for validation, identity matching, or review assistance.

**Severity: MEDIUM — confirmed as stated.**

### 8. Analytics and Automation Are Scaffolds — CONFIRMED

`analytics/views.py` returns hardcoded sample data from `jobs_ops_seed.py` — not real admissions metrics. `automation/models.py` defines `AutomationRule`, `AutomationRun`, `AutomationArtifact`, and `ReviewTask` models but they're all `managed=False` scaffolds with no business logic.

**Severity: MEDIUM — confirmed as stated.**

---

## What the Audit Gets Right That Deserves Emphasis

1. **The sequencing advice is correct.** Canonicalize identifiers and tighten mutation paths before adding intelligence. The FeeResolver bug proves this — adding more smart behavior on top of name/code drift will compound failures.

2. **The "explainable rules" recommendation is the highest-leverage idea.** A `{rule_code, severity, result, message, blocking, source, recommended_action}` response contract would transform the platform from "operational" to "trustworthy."

3. **The command endpoint recommendation is practical.** The current generic PATCH path is a real vulnerability. Dedicated endpoints for submit, withdraw, review, etc. would make the state machine actually enforceable.

4. **The payment vocabulary unification is needed.** Live data shows `applications.payment_status` uses `{null, verified, rejected, force_approved}` while `payments.status` uses `{pending, successful, failed}`. The frontend normalizer maps 4 different strings to "verified." This works but is fragile.

---

## What the Audit Understates or Misses

### 1. The FeeResolver Program Code Bug Is Live

This isn't just "drift risk" — it's a live bug. `PaymentService.initiate_payment()` passes `application.program` (a name) to `FeeResolver.resolve_fee(program_code=...)` which does `Program.objects.get(code=program_code)`. Since application records store names, not codes, this will fail for every real payment initiation unless there's an error handler swallowing it.

### 2. The State Machine Was Recently Hardened

The audit was written before the `application-process-hardening` spec was executed. The `ALLOWED_TRANSITIONS` map and enforcement in `transition_application_status()` now exist. However, the generic PATCH bypass still exists — the state machine only protects the dedicated transition path.

### 3. Program-Intake Validation Was Recently Added

`validate_program_intake_compatibility()` now exists in the serializer and checks the `program_intakes` join table. However, it resolves by name (`Program.objects.filter(name=...)`) which works for current data but doesn't address the code/name drift.

### 4. Webhook Replay Protection Was Recently Added

The audit doesn't mention webhook security, but deduplication was added in the hardening spec.

### 5. The `current_enrollment` Field Is Never Incremented

`intakes.current_enrollment` is `3` for January 2026 but there are far more than 3 applications for that intake. Nothing in the submission flow increments this counter. Capacity enforcement would need this to work first.

---

## Adjusted Priority Recommendations

Based on the evaluation, here's what I'd adjust in the audit's roadmap:

### Phase 1 (Immediate) — Agree, with one addition

The audit's Phase 1 is correct. Add:
- **Fix the FeeResolver program code bug** — this is a live payment initiation failure waiting to happen
- **Restrict the generic PATCH endpoint** to draft-safe fields only (personal info, address, next of kin) — block `status`, `payment_status`, `eligibility_*` from serializer writes when status != 'draft'

### Phase 2 (Rules and Readiness) — Agree

The `course_requirements` table already has 18 rows of real data. A backend eligibility engine that reads these would be high-value with low effort.

### Phase 3 (Automation) — Agree, but defer interview intelligence

Interview scheduling intelligence is lower priority than payment recovery and deadline enforcement.

### Phase 4 (Advanced Intelligence) — Agree, this is genuinely future work

---

## Summary Scorecard

| Audit Claim | Verified | Severity Accurate | Notes |
|-------------|----------|-------------------|-------|
| Contract drift | ✅ | Understated | FeeResolver bug is live, not just risk |
| Generic update bypass | ✅ | Accurate | PATCH still exposes lifecycle fields |
| Eligibility advisory-only | ✅ | Accurate | course_requirements data exists unused |
| Duplicate prevention frontend-only | ✅ | Accurate | Fails open on error |
| Draft fragmentation | ✅ | Accurate | 4 draft authorities confirmed |
| Intake capacity/deadline not enforced | ✅ | Slightly understated | Deadline data exists, actively ignored |
| Document intelligence underutilized | ✅ | Accurate | extracted_text column unused |
| Analytics/automation scaffolds | ✅ | Accurate | Returns hardcoded sample data |
| Payment lifecycle strong | ✅ | Accurate | Forward-only, amount checks, dedup |
| Submission service strong | ✅ | Accurate | Payment + document + state guards |
| SSE backbone exists | ✅ | Accurate | Event dispatch with per-user cap |
| Role-aware auth exists | ✅ | Accurate | Hierarchy + permission overrides |

**Overall assessment: The audit is a reliable foundation for planning. Its recommendations are sound and correctly sequenced. The main adjustment is that the FeeResolver identifier mismatch should be treated as a P0 bug fix, not just a Phase 1 canonicalization task.**

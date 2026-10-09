# Task 7.1 Evidence — Seed and enforce the canonical subject/grade contract

_Requirements: R11.4-R11.5_
_Findings: STU-11_
_Design: design.md §9.2 (Grades — "The subject catalog is seeded and versioned by
the backend. Selectors contain only canonical UUIDs. Students manually enter
grades; server mutations persist and return the canonical record. Readiness
counts unique persisted records, not local row contents.")_
_Steering: `product.md` (deterministic admissions, correct Zambian ECZ grading
semantics, never lose a student's work); `structure.md` (additive SQL under
`backend/scripts/`, `managed = False` convention); `infrastructure.md` (Neon
authoring first — production is never the first place a data change lands)._

_Required_Evidence (tasks.md): **"0/4/5/duplicate/fake/unknown/program-ineligible
grade tests"** — all seven cases are exercised end to end in
`backend/tests/integration/test_subject_grade_contract_7_1.py` (25 cases) and on
the client in `apps/admissions/tests/unit/wizard/subjectGradeContract.test.ts`
(20 cases). Nothing is skipped or environment-gated._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of that commit (the whole admissions-v2
  spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-26 (UTC).
- **Schema hash** (`backend/schema/openapi.v2.candidate.yaml`, regenerated):
  `b33c044ce7644bc9dbb2d9cf6e8bb1469d4681d98b5be2bf153ed2926d95b98c`
  (was `16c7408c…` at 6.5 — the subjects endpoint gained `aliases` + `meta`).
- **Database schema: no DDL.** One additive **data** migration
  (`backend/scripts/2026_07_25_01_canonical_subject_catalog.sql` + rollback
  sibling). **Not applied to Neon or production** — see "Neon/production" below.
- PBT: task 7.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → no `7.1` entry in `pbtResults`). Nothing to record via
  `update_pbt_status`; the 0/4/5/duplicate/fake/unknown/ineligible matrix ships as
  parametrised integration and unit cases instead.

## What 7.1 owned, and what it found

Task 6.5 closed the **server** half of STU-11: readiness counts only unique
persisted grades whose subject resolves to an active canonical `Subject`, and
`submit_application` raises `MINIMUM_GRADES_REQUIRED` inside the row lock. 7.1
owned the three things 6.5 explicitly did not do — and each one turned up a real
defect rather than just wiring.

### 1. The catalogue (bullet 1) — three duplicate identities in the live data

The catalogue previously reached a database **only** through
`python manage.py seed_subjects`, which nothing runs at boot. The read-only Neon
inventory (`raw/neon-catalogue-inventory.md`) found the predictable result: 65
rows where the canonical catalogue defines 62, and the three extras are the same
real subject stored twice under a second code — with the **legacy** row holding
every real reference:

| Legacy | Canonical | Legacy category | grades on legacy | on canonical |
|---|---|---|---|---|
| `ADD_MATH` | `ADDMATH` | `Sciences` | 6 | 0 |
| `MUS` | `MUSIC` | `Arts` | 4 | 0 |
| `PHYS` (`is_core=true`, wrong) | `PHY` | `Sciences` | 4 | 0 |

Two active rows for one subject is a direct R11.5 violation: a student can persist
"five unique subjects" that are really four. Deactivating the duplicates without
repointing would have stranded 14 students' grades as unresolved.

### 2. The client selector (bullet 2) — 62 fabricated selectable identities

`educationCatalog.ts` held 62 `fallback-*` subject objects that were merged into
the selector, counted by `buildWizardReadiness`, and then dropped at sync time
because `application_grades.subject_id` is a real foreign key. Three modules each
decided "is this a real subject?" for themselves, two of them by **denylist**
(`!id.startsWith('fallback-')`) — which only rejects the fabricated IDs someone
remembered to name.

### 3. The gates (bullet 3) — two real holes

- **The write path hard-coded `5`.** `ApplicationGradesView` refused batches below
  a literal five while readiness and submission read the configured,
  policy-floored `resolve_minimum_grades()`. A tenant raising the minimum to 6 got
  a wizard that happily saved 5 and a submit that then refused.
- **Submission skipped eligibility when the snapshot was absent.** `submission_blockers`
  passed `allow_live_resolution=False`, so a canonical application predating task
  5.2's `eligibility_snapshot` read "no rules configured". The readiness *query*
  live-resolves, so it reported `PROGRAM_ELIGIBILITY_NOT_MET` while submission
  **accepted the same application** — the exact readiness↔submission disagreement
  6.5's design notes say cannot happen. Caught by
  `test_a_program_ineligible_application_is_blocked_and_refused` before any fix
  was written.

## What shipped

| Layer | File | Role |
|---|---|---|
| **Catalogue + alias authority** | `backend/apps/catalog/subject_catalog.py` (new) | `CANONICAL_SUBJECTS` (62), `SUBJECT_ALIASES` (normalised alias → code), `LEGACY_DUPLICATE_CODES`, `normalize_subject_name`, `resolve_code`, `active_subjects_queryset`, and a content-derived `SUBJECT_CATALOG_VERSION`. |
| **Deployable seed + merge** | `backend/scripts/2026_07_25_01_canonical_subject_catalog.sql` (+ rollback) | Data-only, idempotent, session-state-free: upsert by code → collision-safe repoint of `application_grades`/`course_requirements` → deactivate (never delete) the three duplicates. |
| Seed command | `backend/apps/catalog/management/commands/seed_subjects.py` | Now reads the shared module instead of its own copy of the list; the SQL migration is what boots. |
| **Selector endpoint** | `backend/apps/catalog/views.py` (`SubjectListView`) | Serves **active** subjects only (a deactivated row can be referenced by an old grade but never counted, so offering it is a trap) and publishes `meta.subject_catalog_version`. |
| Alias publication | `backend/apps/catalog/serializers.py` (`SubjectSerializer.aliases`) | The versioned alias catalogue per subject (R11.4) — the server-side replacement for the client's private alias table. Task 7.5 consumes it. |
| **Write boundary** | `backend/apps/applications/serializers.py` (`ApplicationGradeSerializer.validate_subject_id`) | Requires an **active canonical** subject, so the write boundary and the readiness evaluator share one definition of "resolvable". Identical message for missing/inactive — no catalogue disclosure. |
| **Catalogue-driven minimum** | `backend/apps/applications/student_submission_views.py` | `resolve_minimum_grades()` replaces the literal `5`. |
| **Eligibility parity** | `backend/apps/applications/readiness_service.py` (`submission_blockers`) | Live-resolves eligibility when a canonical row has no `eligibility_snapshot`, mirroring what the required-document gate in the same function already did. Readiness and submission can no longer disagree. |
| **Fail-closed at the lock boundary** | `backend/apps/applications/services.py` (`submit_application`) | Any fail-closed canonical resolution raised by the in-lock readiness pass is translated to the stable retryable `CONFIGURATION_UNAVAILABLE` (503), exactly like the pre-lock document gate. The call site was previously unwrapped, so an unreadable configuration would have surfaced as an opaque 500 — widened by the eligibility fallback above, so 7.1 closes it (`test_unevaluable_eligibility_config_fails_closed_with_the_retryable_code`). |
| **One client allowlist** | `apps/admissions/src/lib/canonicalSubjectId.ts` (new) | `isCanonicalSubjectId` + `syncableGrades`. Replaces three private definitions and two denylists. |
| **Identity-free catalogue** | `apps/admissions/src/pages/student/applicationWizard/lib/educationCatalog.ts` | The 62 fabricated subjects are gone. What remains carries no identity: display metadata keyed by normalised name, `LEGACY_SUBJECT_SLUG_TO_CODE` (repair only), and a read-only alias mirror. `mergeWizardSubjects` returns **only** canonical server IDs, de-duplicated by `(level, normalised name)` so an unmigrated catalogue still cannot show one subject twice. |
| Client readiness | `.../lib/wizardReadiness.ts` | Counts only canonical IDs, and names unresolved rows in the message instead of ignoring them. |
| Row diagnostics | `.../lib/liveGradeValidation.ts` | New `unresolved_subject` diagnostic + hint wording. |
| Sync/sanitise paths | `.../lib/draftResume.ts`, `.../hooks/wizard/useWizardGrades.ts`, `src/lib/connectionFix.ts` | All three now use the shared allowlist. |
| Education step | `.../steps/EducationStep.tsx` | Renders the unresolved-subject hint, clears a stale value out of the select, and no longer drops a server subject whose category is outside the curated list (it lands in "Other Subjects"). |
| De-duplication | `src/lib/subjectMatcher.ts` | Its private copy of the UUID regex now delegates to the shared module. |
| **Drift guard** | `apps/admissions/tests/unit/subjectCatalogDrift.test.ts` + `tests/unit/__fixtures__/subjectCatalogBackendMirror.ts` (generated from the backend module) | The frontend keeps two read-only mirrors (display metadata, alias map). This guard fails on any divergence — verified to bite by perturbing one alias, then restored. |
| Canonical truth map | `docs/canonical-truth-map.md` → "Canonical subject catalogue and alias inventory (Admissions V2 task 7.1)" | Registers the catalogue, alias inventory, retired duplicate codes, selectable queryset, the client allowlist, and the four invariants; adds the drift guard to the inventory. |

## Required_Evidence — the seven-case matrix

`backend/tests/integration/test_subject_grade_contract_7_1.py` (25 passed) and
`apps/admissions/tests/unit/wizard/subjectGradeContract.test.ts` (20 passed):

| Case | Server (write path) | Server (readiness + submission) | Client |
|---|---|---|---|
| **0 grades** | 400 `MINIMUM_SUBJECTS_REQUIRED`, nothing persisted | `unique_canonical_count=0`, `MINIMUM_GRADES_REQUIRED`, `submit_application` refuses, stays `draft` | `(0/5 selected)` |
| **4 grades** | 400 `MINIMUM_SUBJECTS_REQUIRED` | blocks; submission refuses | `(4/5 selected)` |
| **5 grades** | 200, exactly five canonical rows | `satisfied`, submits to `submitted` | readiness item satisfied |
| **duplicate** | 400 `DUPLICATE_SUBJECT`, **nothing** persisted | five rows over four subjects counts as four | "Each subject can only be selected once." |
| **fake** | 400 `VALIDATION_ERROR` | structurally impossible — `application_grades_subject_id_fkey` rejects it (proved with a forced constraint check) | not counted |
| **unknown / unresolved** | 400 for a retired `fallback-*` slug **and** for a deactivated canonical subject | deactivated subject → `unresolved_subject_count=1`, still blocked, submission refuses | `unresolved_subject` diagnostic + "pick it again" hint |
| **program-ineligible** | — | `eligibility.satisfied=false`, `PROGRAM_ELIGIBILITY_NOT_MET` on both readiness **and** submission, stays `draft`; the eligible twin submits | — |

Plus, beyond the required matrix: catalogue integrity (one identity per subject,
every alias and legacy code resolves), selector activeness, alias publication, the
configured minimum on **both** surfaces, the policy floor (a configured `2`
cannot weaken 5), and an unevaluable eligibility configuration failing closed with
the stable retryable `CONFIGURATION_UNAVAILABLE` (503) instead of a 500.

`backend/tests/unit/test_subject_catalog_migration_7_1.py` (11 passed) parses the
migration and compares it to the Python authority row for row, then applies the
real script: idempotent re-run, drifted-row repair, reference repointing,
collision (`LEAST` grade survives, one row remains), retired-but-resolvable, and
the rollback.

## Verification run

| Gate | Command | Result | Artefact |
|---|---|---|---|
| 7.1 contract matrix | `pytest tests/integration/test_subject_grade_contract_7_1.py -q` | **25 passed** | `raw/backend-contract-and-regression.txt` |
| Migration + no-drift | `pytest tests/unit/test_subject_catalog_migration_7_1.py -q` | **11 passed** | same |
| Targeted regression (6.5 readiness matrix, submission gates + revalidation, catalog GET/write-freeze, catalog cache, grade query count, student journey, assignment-config failure) | `pytest tests/integration/test_subject_grade_contract_7_1.py tests/unit/test_subject_catalog_migration_7_1.py tests/integration/test_submission_readiness_6_5.py tests/unit/test_submission_gates.py tests/unit/test_submission_revalidation.py tests/unit/test_application_student_flow_views.py tests/unit/test_legacy_catalog_get_preserved.py tests/unit/test_catalog_write_freeze.py tests/unit/test_perf_catalog_cache.py tests/unit/test_perf_grade_query_count.py tests/integration/test_student_journey_e2e.py tests/integration/test_assignment_config_failure.py -q` | **147 passed, 1 failed — documented pre-existing** | `raw/backend-contract-and-regression.txt` |
| Envelope + tenant API contract | `pytest tests/unit/test_envelope_consistency.py tests/unit/test_tenant_api_contract_preservation.py -q` | **71 passed** (subjects list keeps the `{success,data}` envelope with `data` still a plain list) | run inline |
| Full backend unit surface | `pytest tests/unit/ -q` | 2514 passed; 33 failed + 79 errors — **failing node set byte-identical to the 6.5 baseline (zero new, zero accidentally fixed)** | `raw/backend-unit-suite.txt`, `raw/pre-existing-failures-diff.txt` |
| Full backend integration surface | `pytest tests/integration/ -q` | 241 passed, 4 failed — **the same four in 6.5's `pre-existing-failures.txt`** | `raw/backend-integration-suite.txt` |
| Backend property surface | `pytest tests/property/ -q` | 1193 passed, 46 failed — none reference subject/grade/readiness/catalog; see "Pre-existing" below | `raw/backend-property-suite.txt` |
| Authority matrix + migration lints | `pytest tests/unit/test_authority_matrix_v2.py tests/property/test_authority_matrix_properties.py tests/unit/test_migration_drift_guard.py tests/unit/test_apply_sql_migrations.py tests/unit/test_apply_sql_migrations_additive_lint.py -q` | **82 passed** (no new route; the new SQL passes the additive-only lint) | `raw/authority-and-migration-gates.txt` |
| Django checks | `python manage.py check` | **no issues (1 silenced)** | `raw/django-check.txt` |
| OpenAPI + TS client | `bash scripts/generate-api-types.sh` | schema + `api.d.ts` regenerated, types compile cleanly | `raw/openapi-regeneration.txt` |
| Frontend suite | `bun x vitest run` | **3648 passed**, 1 failed (pre-existing) + 9 Playwright specs vitest cannot collect (pre-existing) | `raw/frontend-suite.txt` |
| Frontend type-check | `bun run type-check` | **clean (exit 0)**, re-run after the client regeneration | `raw/frontend-type-check.txt` |
| Lint (changed files) | `eslint` on the 13 changed/added frontend files | **0 errors**; 1 pre-existing warning on `EducationStep.tsx:12` (unused `no-restricted-imports` disable for the `eligibilityEngine` type import — reproduced with 7.1's edits removed) | run inline |
| Frontend 7.1 + drift guard + touched suites | `vitest run tests/unit/wizard/subjectGradeContract.test.ts tests/unit/subjectCatalogDrift.test.ts tests/unit/educationCatalog.test.ts tests/unit/subjectMatcher.test.ts tests/unit/gradesSyncPost.test.ts tests/unit/wizardDraftResume.test.ts tests/unit/wizard/ tests/unit/EducationStep.test.tsx` | **92 passed** | `raw/frontend-tests-7.1.txt` |
| Final combined backend run | 20 suites: 7.1 contract + migration, the 6.5 readiness matrix, submission gates/revalidation, envelope + tenant API contract, catalog GET/write-freeze/cache, grade query count, authority matrix, additive lint, migration drift guard, student journey, assignment-config failure, late applications, capacity concurrency + waitlist, change-selection | **286 passed** | `raw/final-combined-run.txt` |
| Grep-loop canonical review | see file | one canonical-id definition, one catalogue/alias authority, one resolved minimum, one activeness decision, zero selectable `fallback-*` | `raw/grep-loop-review.txt` |

Backend suites ran against a local ephemeral Postgres
(`DATABASE_URL="postgresql:///beanola"` → pytest-django creates/drops
`test_beanola`). **Neon and production were never written to.**

## Pre-existing failures (with proof)

- **Backend unit surface** — `raw/pre-existing-failures-diff.txt` is an
  `LC_ALL=C comm` diff of the sorted failing/erroring node ids against 6.5's
  recorded `backend-unit-suite.txt`: **112 nodes on both sides, zero new, zero
  fixed**, with passed rising 2503 → 2514 (exactly the 11 new migration tests).
- **`test_application_student_flow_views.py::TestApplicationInterviewListView::test_admin_list_without_mine_is_scope_narrowed`**
  — listed verbatim in 6.5's `raw/pre-existing-failures.txt` under "individually
  confirmed pre-existing", owned by task 9.1 ("one scoped applications query").
- **Backend integration, 4 failures** (`test_admin_journey_drill`,
  `test_tenant_lifecycle_drill`, `test_perf_divergence_regression[application_list]`,
  `test_communication_template_coverage`) — the same four, by node id, in 6.5's
  `pre-existing-failures.txt`.
- **Backend property, 46 failures** — no failing node references subject, grade,
  readiness, or catalog (grep in `raw/backend-property-suite.txt`). The clusters
  are stale mock targets (`apps.applications.document_views.AccessScopeService`,
  13 + 11 nodes), capability-gated review permissions, and schema/model-count
  invariants — the same clusters 6.5 attributed to tasks 2.2 / 9.1 / 9.4.
  `test_rollback_safe_operations.py` and `test_migration_properties.py` were
  re-run with 7.1's two SQL files **physically removed** and failed identically
  (see "One open question" below).
- **Frontend `authPageFormMarkup.test.tsx`** — the committed test asserts the
  email helper copy `"We'll verify this address."`; an in-flight, uncommitted edit
  in `SignUpPage.tsx` (`git diff` shows a one-line change from another v2 task)
  replaced it with `"We'll send account updates here."`. Nothing in 7.1's diff
  touches auth pages.
- **9 `tests/harness-e2e/**` collection failures** — Playwright specs that the
  vitest runner cannot collect (`test.describe` from `@playwright/test`). They are
  run by the Playwright projects (`.github/workflows/v2-harness-smoke.yml`), not
  vitest; reproduced on the committed tree.

## One open question for review

`test_rollback_safe_operations.py` requires every rollback statement to be
"inverse-additive" (`DROP INDEX/COLUMN/TABLE/SEQUENCE`, `DELETE FROM
migration_history`, or a scoped `DELETE FROM <table> WHERE …`). It is **already
red** on four earlier v2 data-migration rollbacks, including
`2026_07_16_02_canonical_assignment_backfill_rollback.sql`, whose statement shape
is identical to ours (`UPDATE applications SET assignment_quarantined = false
WHERE …`). 7.1's rollback adds a fifth line to that list:

```sql
UPDATE subjects SET is_active = true WHERE code IN ('ADD_MATH','MUS','PHYS') AND is_active IS DISTINCT FROM true;
```

The reversal of a *data* migration is inherently an `UPDATE`; there is no
DROP/DELETE equivalent that undoes a deactivation. Rather than weaken the
property (an acceptance-criteria change needs your input) or ship a rollback that
silently does nothing, 7.1 keeps the faithful statement and raises the question:
**should the property admit a scoped, idempotent inverse `UPDATE` for data
migrations?** That decision belongs with the rollback-lint / schema task, not 7.1.
The forward migration itself passes the `apply_sql_migrations` additive-only lint
(`raw/authority-and-migration-gates.txt`).

## Neon / production

Per `infrastructure.md`, `2026_07_25_01_canonical_subject_catalog.sql` is authored
Neon-first and **has not been applied anywhere**. It was validated against the
ephemeral local Postgres by the migration test (applied twice in one session,
idempotent; merge, collision, and rollback behaviour asserted). Neon was only
**read** (`raw/neon-catalogue-inventory.md`).

Applying it needs your go-ahead, in this order:

1. Create a Neon branch, apply there, re-run the two 7.1 suites against it.
2. Apply to the Neon default branch.
3. Production picks it up through the `apply_sql_migrations` boot sweep after a
   `deploy/backup-db.sh` backup.

Until step 2 lands, the three duplicate rows stay active on Neon. The code is
safe either way: the selector de-duplicates by `(level, normalised name)` and the
server counts unique subjects, so the "five that are really four" hole is closed
in code as well as in data.

## Not in this task

- **Consuming** the published `aliases` for OCR candidate mapping with
  confidence/provenance and explicit confirmation — task **7.5** (R11.4's OCR
  half). 7.1 publishes the versioned catalogue; the client mirror in
  `educationCatalog.SUBJECT_NAME_ALIASES` is marked for replacement there.
- Wiring the wizard to consume `GET /api/v2/student/applications/{id}/readiness/`
  instead of its local advisory `buildWizardReadiness` — tasks **10.6 / 11.2**.
- The browser (Playwright) education-step journey — task **13.2** (design §16).
- Dynamic required documents and immutable document versions — tasks **7.2 / 7.3**.

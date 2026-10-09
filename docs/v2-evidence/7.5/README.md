# Task 7.5 Evidence — Make deterministic OCR optional assistance only

_Requirements: R11.4, R11.7, R11.9-R11.10_
_Findings: STU-06, STU-07_
_Design: design.md §9.2 (Grades — "Optional server OCR is deterministic assistance
only: `upload -> malware/type/size check -> local OCR -> deterministic parser ->
candidate(subject_id, grade, confidence, source_region) -> explicit student
confirmation -> grade mutation`. Low confidence or unknown subjects stay
unconfirmed. Tesseract/browser packages with no runtime use are removed."), §18
risk register ("De-AI removal loses useful data → preserve historical extraction
as labeled provenance, manual entry/review path, deterministic fixture corpus")_
_Steering: `product.md` ("OCR never overwrites manual entries"; correct Zambian ECZ
grading semantics; never lose a student's work); `tech.md` (envelope contract,
verification gates); `structure.md` (canonical truth map registration)_

**Required_Evidence (tasks.md 7.5):** "deterministic corpus report, bundle diff,
and manual fallback E2E" — all three are below, each produced by an executable
that is committed with the change.

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of that commit (the whole admissions-v2
  spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-29 (UTC).
- **Database schema: no DDL.** The structured extraction record reuses the task-7.3
  `document_verification_events` table (`details jsonb`, append-only) and the
  existing `application_documents.extraction_state` column. No migration ships
  with 7.5.
- **API surface:** `GET /api/v1/documents/{id}/info/` gains `data.extraction` and
  drops the retired `data.ai_analysis` / `data.ai_analysis_available` aliases. The
  endpoint is `OpenApiTypes.ANY`, so the generated schema is unchanged.
- PBT: task 7.5 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → no `7.5` entry in `pbtResults`). Nothing to record via
  `update_pbt_status`; the behaviour matrix ships as a versioned fixture corpus
  plus parametrised integration/unit cases.

## What 7.5 owned, and what it found

Task 7.4 removed admissions generative AI. That left the OCR path in a strange
half-state, which is what 7.5 had to close:

1. **The frontend was still reading the dead AI blob.** `useOcrGradeExtraction`
   polled for `ai_analysis` — a field nothing writes since 7.4 — mapped it through
   a **second**, client-side fuzzy subject matcher (Levenshtein + Jaro-Winkler),
   and then **applied the grades itself**. "It only fills empty slots" limited the
   damage, but the student never agreed to anything. That is the R11.4 violation
   finding STU-06 named, and it is now structurally impossible: the hook holds
   candidates, and `handleOcrGrades` is reachable only from the confirm action.
2. **There was no deterministic parser at all.** Without the removed classifier
   there were no structured candidates — the task text's "map candidates through
   catalog aliases" had no producer. `apps/documents/grade_extraction.py` is that
   producer, and it resolves identity **only** through the task-7.1 catalogue
   (`resolve_code`: canonical name/code, then the versioned alias inventory). There
   is deliberately no fuzzy metric: an unrecognised label stays `unresolved` and
   the student types it.
3. **29 MB of browser OCR was still in the build.** `tesseract.js` +
   `tesseract.js-core` were declared dependencies and a `prepare-ocr-assets.mjs`
   step copied nine WASM/worker files into `public/` on **every** `dev` and
   `build` — with **zero** runtime imports anywhere in `src/` (finding STU-07).
4. **A whitespace-only OCR read was reported as "no grades".** Fixed while wiring
   the parser: the outcome was decided from the raw string, so a blank scan told
   the student to fix their *subjects* when the real problem was the photo.

Two things the task text asked for were already true and were verified rather
than rebuilt: extraction owns `extraction_state` (task 7.3) and nothing writes
machine output into `verification_notes` (task 7.4). 7.5 adds the missing half —
the structured **candidate record** — as an append-only
`document.extraction.candidates` event, not a new column.

## Evidence 1 — deterministic corpus report

| Artifact | Path |
|----------|------|
| Versioned corpus (manifest + 12 cases) | `backend/tests/fixtures/ocr_corpus/manifest.json`, `backend/tests/fixtures/ocr_corpus/cases/*.txt` |
| Executable evaluation | `backend/scripts/evaluate_ocr_corpus.py` |
| Report (markdown + JSON) | `raw/ocr-corpus-report.md`, `raw/ocr-corpus-report.json` |
| In-suite gate | `backend/tests/integration/test_ocr_assistance_7_5.py::test_corpus_evaluation_meets_every_threshold` |

```
cd backend && python3 scripts/evaluate_ocr_corpus.py
```

| Metric | Value | Threshold |
|--------|-------|-----------|
| Precision | **1.0** | ≥ 1.0 |
| Recall | **0.9231** | ≥ 0.85 |
| F1 | 0.96 | — |
| Mean confidence | **0.9264** | ≥ 0.8 |
| Wrong confirmable | **0** | ≤ 0 |
| Cases | 12 | ≥ 12 |

**What is being measured.** Accuracy of *assistance*, against what a human reads
from the slip (`slip_truth`) — not against the parser's own output, which would
make the number meaningless. Three failure modes are counted separately because
their consequences differ:

- **wrong** — a confirmable candidate the slip does not support. The only
  dangerous class (it would pre-select a false value for a student to accept), so
  the threshold is **zero** and precision must be 1.0.
- **withheld** — resolved but deliberately not offered (low confidence,
  duplicate). Costs recall, protects correctness. 2 of 39.
- **missed** — no candidate at all (OCR damaged the label past exact
  resolution). Costs recall; manual entry covers it. 1 of 39.

**Honest note on capture mode.** The report states `capture_mode:
recorded_text` because this machine has no `tesseract` binary and no
`pytesseract` (`tesseract_available: false`). The corpus cases are therefore the
**OCR text layer** — the parser's real input — authored to match the line shapes
real Tesseract output produces for Zambian ECZ statements of results (dot
leaders, row numbering, bracketed letter descriptors, character damage). Adding
an `image` key to a case makes the same harness run live Tesseract end to end
when a binary is present; the report always names which mode ran, so the number
can never quietly change meaning.

The 12 cases cover every class R11.10 names: clean parse, dot-leader layout,
alias-only labels, character damage, low confidence, duplicate subject, unknown
subject, tampered/out-of-scale grades, wrong document type, unreadable scan,
A-Level, and printed grade descriptors.

## Evidence 2 — bundle diff

| Artifact | Path |
|----------|------|
| Before (build with the OCR step) | `raw/dist-files-before.txt` |
| After (build without it) | `raw/dist-files-after.txt` |
| Executable guard | `apps/admissions/tests/unit/ocrAssetRemoval.test.ts` (8 tests) |

Both listings are real `bun run build` outputs of the same tree, before and after
the removal:

| | Files | Bytes |
|---|-------|-------|
| Before | 245 | 38,135,277 |
| After | **236** | **8,235,758** |
| Delta | **−9** | **−29,899,519 (−78.4%)** |

The nine removed files are exactly the OCR payload — nothing else changed, and
nothing was added:

```
dist/ocr/tesseract/worker.min.js
dist/ocr/tesseract/core/tesseract-core.wasm{,.js}
dist/ocr/tesseract/core/tesseract-core-simd.wasm{,.js}
dist/ocr/tesseract/core/tesseract-core-lstm.wasm{,.js}
dist/ocr/tesseract/core/tesseract-core-simd-lstm.wasm{,.js}
```

Removed from the repo as well:

- `apps/admissions/package.json` — the `tesseract.js` / `tesseract.js-core`
  dependencies, and `node ./scripts/prepare-ocr-assets.mjs &&` from `dev`,
  `dev:network`, `build`, and `build:analyze`.
- `apps/admissions/scripts/prepare-ocr-assets.mjs` — deleted.
- `apps/admissions/public/ocr/` — deleted (generated output), and its now-pointless
  `.gitignore` entry.
- `apps/admissions/vite.config.ts` — the `vendor-ocr` `manualChunks` branch and its
  `modulePreload` exclusion.

The entry-chunk guards (`scripts/check-entry-chunk.ts`,
`scripts/launchBundlePredicate.ts`) **keep** their `tesseract` markers on purpose:
the removal is the fix, the guard is the seatbelt if a browser OCR engine is ever
re-added. `tests/unit/ocrAssetRemoval.test.ts` asserts both halves — that the
dependency/script/assets/chunk are gone, *and* that the guards still recognise
them.

## Evidence 3 — manual fallback E2E

| Artifact | Path |
|----------|------|
| Spec | `apps/admissions/tests/harness-e2e/required/ocr-manual-fallback.spec.ts` |
| Run | `harness/bin/harness up` then `bunx playwright test -c playwright.harness.config.ts --project=chromium-required tests/harness-e2e/required/ocr-manual-fallback.spec.ts` |

Result on the live local harness (Caddy edge + Django + Celery worker + Postgres +
Redis + MinIO + deterministic payment adapter), strict gates active, zero skips:

```
Running 2 tests using 1 worker
  ✓ 1 … a student reaches the education step and enters grades by hand, with no OCR (18.6s)
  ✓ 2 … the served bundle ships no browser OCR asset (R11.9, STU-07) (417ms)
  2 passed (21.5s)
```

The journey configures its own tenant through the canonical admin commands
(institution + offering + a **dedicated** intake + fee) so the assigned-school
checkpoint resolves deterministically and no seeded id is assumed (R4.7). Then, as
a student:

1. programme + intake → assigned school → personal details → **education step**;
2. **no suggestion panel exists** (`extracted-results-card` count 0) — the harness
   web image has no Tesseract binary, so "OCR unavailable" is real, not mocked;
3. all **5** required subjects are entered **by hand**, and the readiness counter
   walks `1/5 … 5/5` — the manual path is complete on its own, not a degraded mode;
4. a real result-slip upload commits as evidence, and the document contract then
   reports `extraction: null` with **no** `ai_analysis` key — nothing invented from
   a file with nothing to read;
5. the five manual grades are still exactly what the student typed.

The second test proves the pre-7.5 asset paths no longer resolve to an executable
OCR payload (the edge serves the SPA shell for unknown paths, so the assertion is
about content-type and body, not just status) and that the served HTML references
no OCR engine.

`mobile-required` (Pixel 5 viewport) runs the same spec and also passes:

```
  ✓ 1 … a student reaches the education step and enters grades by hand, with no OCR (22.8s)
  ✓ 2 … the served bundle ships no browser OCR asset (R11.9, STU-07) (488ms)
  2 passed (25.7s)
```

Raw: `raw/e2e-chromium-required.txt`, `raw/e2e-mobile-required.txt`. Note for
re-runners: hammering the harness with many back-to-back runs from one IP trips
the platform's own login/catalog rate limiter (HTTP 429) before the journey can
start — that is the limiter working, not a spec defect. Space the runs.

## Verification commands and results

| Command | Result |
|---------|--------|
| `cd backend && python3 manage.py check` | **PASS** — "System check identified no issues (1 silenced)" |
| `cd backend && python3 -m pytest tests/integration/test_ocr_assistance_7_5.py` | **PASS** — 19 passed |
| `cd backend && python3 scripts/evaluate_ocr_corpus.py` | **PASS** — precision 1.0, recall 0.9231, 0 wrong |
| `cd backend && python3 -m pytest` (document / OCR / grades / required-docs suites) | 149 passed, **1 pre-existing failure** (see below) |
| `cd apps/admissions && bun x vitest run` (OCR + education suites) | **PASS** — 61 passed |
| `cd apps/admissions && bun run test` (full suite) | 1 failed / 3757 passed / 1 skipped — the single failure is pre-existing (`authPageFormMarkup`); the 10 spurious harness-collection file failures the suite carried before are gone |
| `cd apps/admissions && bun run lint` | 22 errors, **all pre-existing** (see below); zero introduced |
| `cd apps/admissions && bun run build` | **PASS** — 236 files / 8,235,758 bytes, no OCR asset |
| `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml` | **PASS** (exit 0). 7.5 adds **no schema delta**: the info endpoint is `OpenApiTypes.ANY`. The stored `schema/openapi.v2.candidate.yaml` is stale from tasks 7.3/7.4 (it still lists the removed `admin-summary` / `preview-summary` operations and lacks `extraction_state`) — not this task's artifact to regenerate |
| Playwright `chromium-required` + `mobile-required` (this spec) | **PASS** — 2 + 2 passed |

### Pre-existing failures this task did not introduce and did not fix

1. `backend/tests/integration/test_required_documents_contract_7_2.py::TestContractReportsUploadedState::test_replacement_reports_the_newest_document_as_current`
   — the test uploads the **same bytes** twice, so task 7.3's idempotent-replay
   path (`find_identical_current_version`,
   `apps/documents/document_storage_views.py:432`) correctly returns the existing
   version and the contract reports `first.png`. This is a 7.2 ↔ 7.3 contract
   question (does re-uploading identical bytes count as a *replacement*?) that
   belongs to task 7.3, which is still in progress. Nothing in 7.5 touches the
   upload path, and the OCR task is dispatched with `.delay` (not eager), so it
   does not run in that test at all.
2. `apps/admissions/tests/unit/authPageFormMarkup.test.tsx` — asserts the SignUp
   helper copy "We'll verify this address."; the page in this worktree now says
   "We'll send account updates here." (another in-flight task's edit). Unrelated
   to OCR; whichever copy is canonical is that task's call.
3. `bun run lint` — 22 errors, 18 of them the R14.3 `@/services/client`
   restricted-import rule in files that already imported it at the base commit,
   plus 4 unused-`eslint-disable` directives. Two lint errors **were** in 7.5's
   lane and are fixed: the hook now reads through the domain service
   (`documentService.getInfo`) instead of the raw client, and the confirmation
   card no longer needs a `react-hooks/exhaustive-deps` suppression.

Backend full-suite context: `cd backend && python3 -m pytest` reports 111 failed /
4099 passed / 79 errors in this worktree (`raw/backend-full-pytest.txt`). That
population is the accumulated in-flight state of the spec — task 7.1's own evidence
recorded the same shape (33 failed + 79 errors in unit, 46 in property). Every
document-related failure traces to code 7.5 does not touch: `document_evidence.py`
replace/one-current handling (7.3), the `uq_application_documents_one_current`
index (3.5), drift guards for 7.3's new tables, and migration-report freshness for
the 7.1/7.3 SQL scripts. No failure mentions `grade_extraction`, the info view, or
the extraction task, and the OCR task is dispatched with `.delay` (not eager) so it
does not execute in those tests at all.

Two repo-hygiene fixes ship with this task because 7.5's own changes would
otherwise leave the gates dishonest:

- `apps/admissions/vitest.config.ts` now excludes `tests/harness-e2e/**`. Vitest was
  collecting the Playwright harness specs, and `@playwright/test` refuses to run
  outside its own runner, so **every** harness spec counted as a hard Vitest failure
  (10 before this change, and the new E2E would have made 11).
- `apps/admissions/tests/unit/architectureEnforcement.test.ts` — the R14.3
  pending-migration allowlist drops `useOcrGradeExtraction.ts`, which the
  allowlist's own shrink-only rule requires now that the hook reads through
  `documentService`.

## Files

### Added

| Path | Purpose |
|------|---------|
| `backend/apps/documents/grade_extraction.py` | Deterministic result-slip parser; candidate model with confidence/provenance/source line; catalogue-only resolution; append-only candidate record reader/writer |
| `backend/tests/fixtures/ocr_corpus/manifest.json` | Versioned corpus: thresholds, per-case `slip_truth` (human ground truth) and `expected` (behaviour pin) |
| `backend/tests/fixtures/ocr_corpus/cases/*.txt` | 12 committed OCR text layers |
| `backend/scripts/evaluate_ocr_corpus.py` | Executable evaluation → markdown + JSON report; non-zero exit on any breached threshold |
| `backend/tests/integration/test_ocr_assistance_7_5.py` | 19 cases: corpus gate, alias-catalogue mapping, no-guessing, zero grade writes, manual grade preserved, verification notes untouched, contract shape, retired aliases gone |
| `apps/admissions/tests/unit/ocrCandidateConfirmation.test.tsx` | 19 cases: payload reader refuses unconfirmable candidates; confirm returns only ticked rows; card renders confidence + provenance |
| `apps/admissions/tests/unit/ocrAssetRemoval.test.ts` | 8 cases: dependency, script, assets, gitignore entry, chunk rule, and source imports are gone; guards retained |
| `apps/admissions/tests/harness-e2e/required/ocr-manual-fallback.spec.ts` | Manual fallback E2E (2 tests) |
| `docs/v2-evidence/7.5/` | This report + raw artifacts |

### Modified

| Path | Change |
|------|--------|
| `backend/apps/documents/tasks.py` | Parse candidates after OCR, store them as a structured event, outcome from the normalised text |
| `backend/apps/documents/document_storage_views.py` | `DocumentInfoView` publishes `extraction`; retired `ai_analysis` / `ai_analysis_available` |
| `apps/admissions/src/pages/student/applicationWizard/hooks/useOcrGradeExtraction.ts` | Rewritten: holds candidates, no client-side matching, explicit `confirmCandidates` / `dismissCandidates` |
| `apps/admissions/src/components/student/ExtractedResultsCard.tsx` | Rewritten as the confirmation surface (per-row ticks, confidence, provenance, withheld rows, manual escape hatch) |
| `apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx` | Renders the confirmation panel; `suggested` / `applied` / `dismissed` states |
| `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`, `index.tsx` | Wire `confirmOcrCandidates` / `dismissOcrCandidates`; candidates no longer auto-apply |
| `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardGrades.ts` | Manual entries still always win; copy no longer claims "AI detected" |
| `apps/admissions/src/services/documents.ts` | `getInfo()` — the domain-service seam for the document contract |
| `apps/admissions/package.json`, `vite.config.ts`, `.gitignore` | Browser OCR dependency, asset step, and chunk rule removed |
| `apps/admissions/vitest.config.ts` | Exclude Playwright harness specs |
| `apps/admissions/tests/unit/test_bug1_preservation.test.ts` | `vendor-ocr` is now asserted **absent**, with the reason |
| `docs/canonical-truth-map.md` | New section: deterministic grade-extraction candidates (sources, consumers, invariants) |

### Deleted

| Path | Reason |
|------|--------|
| `apps/admissions/scripts/prepare-ocr-assets.mjs` | Copied 29 MB of WASM for a dependency nothing imported (STU-07) |
| `apps/admissions/public/ocr/` | Generated output of that script |

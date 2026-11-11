# Task 6.2 Evidence — Implement valid server draft start/list/rename policy

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R10.1, R10.3, R10.9_
_Findings: STU-12_
_Design: design.md §7.2 (Application Assignment — `Application.id` is the online draft identity; `StartDraftCommand` accepts canonical offering + intake IDs, derives every field server-side, snapshots display values; generic PATCH never accepts assignment identifiers); §8.1/§8.2 (application/draft lifecycle; multi-draft list keyed by `Application.id`, explicit new/resume intent); §14.1/§14.2 (success/error envelopes; commands that create effects require `Idempotency-Key`, DB uniqueness is the final race guard)._
_Steering: `enterprise-tenancy.md` → Student Draft Lifecycle (true multi-draft; explicit new/resume intent; duplicate create must not silently adopt `existing_id`; owner-scoped)._

_Required_Evidence (tasks.md): **"two-draft start/switch/resume API and browser tests"**. The **API** half is realized here as a backend integration suite plus frontend service/hook unit + logic tests. The **browser** (Playwright) two-draft start/switch/resume journey at mobile widths is owned by task **13.2** per the spec's E2E/evidence architecture (design §16); the full frontend build/lint gate over the whole in-flight tree is owned by task **13.1**._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 6.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → empty `pbtResults`; no `6.2` entry). Nothing to record via
  `update_pbt_status`. Property-style coverage is still provided
  (`backend/tests/property/test_drift_bug5_fix.py` + `_preservation.py` for the
  `draft_name` serializer field; `multiDraftService`/`useMultiDraft` frontend
  logic tests) as standard tests.
- Schema: **additive, one nullable column** `applications.draft_name varchar(255) NULL`.
  - Forward: `backend/scripts/2026_07_24_01_application_draft_name.sql`
    (`ADD COLUMN IF NOT EXISTS` — metadata-only on PG 11+, idempotent).
  - Rollback: `backend/scripts/2026_07_24_01_application_draft_name_rollback.sql`
    (`DROP COLUMN IF EXISTS`).
  - **Schema hash / column shape:** `draft_name` = `character varying(255)`,
    `is_nullable = YES`. Validated locally (see "Neon note" below): apply is
    idempotent (second run → `already exists, skipping`, no error) and the
    rollback drops the column cleanly.

## The finding closed

**STU-12** (P0) — *"Multi-draft create sends an empty payload despite required
fields, rename sends an unsupported field, errors are suppressed, and several
single-draft events call `clearAllDraftData`, erasing every draft/payment
recovery cache."* Prescribed fix: *"Add a valid start-draft contract, choose a
real draft name contract or remove rename, surface errors, and clear only the
addressed application cache."*

Task 6.2 closes the first three (its requirements R10.1/R10.3/R10.9):

1. **Valid start-draft contract** — the canonical multi-draft collection
   `POST /api/v1/applications/drafts/` requires the **minimum canonical
   selection** (`program_id` + `intake_id`) and fails closed with the stable
   `MINIMUM_SELECTION_REQUIRED` (400) when it is absent. It is **idempotent**
   under `Idempotency-Key` (replay returns the same draft), and a duplicate
   program+intake start returns a **409 that names the existing draft**
   (`DUPLICATE_APPLICATION` + `existing_id`) — it never silently adopts it.
   Creation delegates to the canonical application create, which resolves the
   offering via task 5.2's `resolve_assignment_snapshot` (canonical IDs only,
   fail-closed) — so `/applications/` and `/applications/drafts/` cannot drift.
2. **Real draft-name contract** — `draft_name` is now a **real, validated,
   persisted** server field (additive `applications.draft_name` column), written
   by the canonical start create and by the dedicated
   `PATCH /api/v1/applications/drafts/{id}/rename/` command. It was silently
   dropped before.
3. **Errors surfaced** — the frontend `useMultiDraft` hook `setError`s on every
   failed command path instead of suppressing; the backend returns the canonical
   error envelope with stable codes.

The **fourth** clause of STU-12 (`clearAllDraftData` single-app cache scoping) is
**out of task-6.2 scope**: it is requirement **R10.10**, owned by task **6.3**
("Consolidate draft persistence… Scope all cache/outbox deletion to one
user/application"). The three `clearAllDraftData` usages are left **unchanged**
by 6.2 (see `raw/grep-loop-review.txt` §6).

## What 6.2 delivers

| Layer | File | Role |
|---|---|---|
| Schema | `backend/scripts/2026_07_24_01_application_draft_name.sql` (+ `_rollback.sql`) | Additive nullable `applications.draft_name varchar(255)` — the real, validated label field (R10.9). |
| Model | `backend/apps/applications/models.py:Application.draft_name` | Maps the additive column; NULL for legacy rows and unlabelled drafts (client falls back to the program display snapshot). |
| Serializer | `backend/apps/applications/serializers.py` | `ApplicationSerializer` exposes `draft_name`; `ApplicationCreateSerializer` accepts an optional validated `draft_name` (≤255, blank→""). |
| Start / List | `backend/apps/applications/student_draft_views.py:ApplicationDraftListView` | `GET` lists **only the caller's own** `Application(status='draft')`; `POST` is the canonical START — minimum-selection gate + `@idempotent`, delegating to the canonical create. |
| Detail | `…student_draft_views.py:ApplicationDraftDetailView` | Owner-scoped `GET/PATCH/DELETE` of a draft; payment-linked drafts cannot be deleted (`DRAFT_HAS_PAYMENT_ACTIVITY` 409). |
| Rename | `…student_draft_views.py:ApplicationDraftRenameView` + `DraftRenameSerializer` | Narrow, validated, owner-scoped command — writes **only** `draft_name` (never assignment IDs); blank rejected; non-owned/absent id masked as 404. |
| Create path | `backend/apps/applications/admin_review_views.py:ApplicationListCreateView.post` | Persists the optional `draft_name`; normalises empty → NULL. Canonical assignment via 5.2 `resolve_assignment_snapshot`; duplicate → 409 (never adopts). |
| Routes | `backend/apps/applications/urls.py` | `drafts/`, `drafts/<id>/`, `drafts/<id>/rename/`. |
| Authority | `scripts/authority_matrix_registry.py` | All three routes registered as `owner` (ownership `Application(draft).user_id == actor.id`, `not_found_mask` disclosure, finding `STU-12`). |
| Frontend service | `apps/admissions/src/services/applications.ts:startDraft/renameDraft` | `startDraft` POSTs `/applications/drafts/` with an `Idempotency-Key` + `retries:0` and the minimum selection; `renameDraft` PATCHes `/rename/` with only `draft_name`. |
| Frontend hook | `…/hooks/useMultiDraft.ts` | `createDraft` refuses to start without `program_id`+`intake_id` (never an empty payload) and surfaces errors; `renameDraft` trims + rejects blank + surfaces errors; list is own-drafts-only. |
| Frontend UI | `…/components/DraftManager.tsx` | "Start new application" routes to the wizard (new intent), not an empty create; rename inline; loads/switches by draft id. |
| Canonical truth map | `docs/canonical-truth-map.md` → "Online student drafts" | Row updated to register the canonical `/applications/drafts/` collection, the `rename` command, and the `draft_name` label field. |

## Steering constraints honoured

- **True multi-draft, `Application.id` is the draft identity** — the drafts
  collection is real `Application(status='draft')` rows; `ApplicationDraft` /
  `/applications/draft/` stays a clearly-labelled deprecated compatibility cache.
- **Explicit new/resume intent; no silent timestamp resume** — start is an
  explicit command with the minimum canonical selection; the UI's "Start new"
  routes to the wizard rather than adopting an old draft.
- **Duplicate create never silently adopts `existing_id`** — a duplicate
  program+intake start is a 409 naming the existing draft so the student can
  continue it, pick a different programme/intake, or cancel.
- **Owner-scoped, non-revealing 404** — list/detail/rename scope to the caller
  before lookup; another student's draft id is an indistinguishable 404.
- **Assignment immutability** — rename writes only `draft_name`; it never
  mutates canonical assignment IDs (reassignment is the reroute command, 6.4).
- **Canonical IDs only / fail-closed** — start resolves through 5.2's
  `resolve_assignment_snapshot`; no name/code fallback.
- **`{"success": true, "data": …}` envelope, cookie auth + CSRF** — preserved
  (the collection reuses the existing authenticated app-local `apiClient`).
- **Auto-save untouched** — 6.2 adds a start/list/rename policy; it removes no
  autosave behaviour.

## Required_Evidence

### 1. Backend two-draft start/switch/resume + rename API — `raw/backend-integration-6.2.txt`
`backend/tests/integration/test_draft_start_list_rename_6_2.py` — **10 passed**:
- start without canonical selection → 400 `MINIMUM_SELECTION_REQUIRED` (no row created);
- start persists optional `draft_name`;
- same `Idempotency-Key` + body → same draft, exactly one row;
- duplicate start (no key) → 409 `DUPLICATE_APPLICATION` surfacing `existing_id` (never a 201/adopt);
- two drafts started, listed, and each resumed (switched) by id;
- list/resume never cross students (second student → non-revealing 404);
- rename sets the validated (trimmed) field; blank → 400 `VALIDATION_ERROR`;
- foreign draft rename → 404 mask (victim untouched);
- rename never mutates the canonical assignment IDs.

### 2. Backend regression (serializer field + create path) — `raw/backend-regression.txt`
`test_drift_bug5_fix` + `test_drift_bug5_preservation` (draft_name serializer
accept/preserve), `test_applications_serializers`, `test_application_canonical_ids`,
`test_admissions_canonicalization`, `test_assignment_properties`: **93 passed**.

### 3. Authority-matrix gate — `raw/authority-matrix-gate.txt`
`scripts/authority_matrix_v2.py --strict`: **ZERO-UNCLASSIFIED GATE: PASS**
(215 routes, 0 unresolved / 0 weak / 0 stale, exit 0). All three draft routes
resolve to the `owner` class:
`/api/v1/applications/drafts/`, `…/drafts/<id>/`, `…/drafts/<id>/rename/`.

### 4. Schema validation — `raw/schema-draft-name-local-validation.txt`
The exact committed forward script applied twice (idempotent: 2nd run →
`already exists, skipping`), producing `draft_name character varying(255)`
`is_nullable=YES`; the rollback then drops it cleanly (0 rows).

### 5. Frontend service + hook tests — `raw/frontend-tests.txt`
- `tests/unit/multiDraftService.test.ts` (5) — `startDraft` POSTs
  `/applications/drafts/` with an `Idempotency-Key` header (auto + caller-supplied
  + distinct keys) and `retries:0`, minimum-selection body; `renameDraft` PATCHes
  `/rename/` with only `draft_name`, URL-encoded id.
- `tests/unit/useMultiDraft.test.tsx` (6) — `createDraft` refuses without
  `program_id`+`intake_id` (no server call) and surfaces server errors; a valid
  start delegates + clears error; `renameDraft` rejects blank, trims, surfaces
  errors.

Result: **11 passed** (2 files).

### 6. Frontend type-check + lint — `raw/frontend-type-check.txt`, `raw/frontend-lint.txt`
- `bun run type-check` (`tsc -p tsconfig.build.json --noEmit`): **clean (exit 0)**.
- `eslint` on the 3 changed source files + 2 test files: **clean (exit 0)**.

### 7. Grep-loop review — `raw/grep-loop-review.txt`
No `draft_name` via generic `update()`, no empty-payload `createDraft`,
`MINIMUM_SELECTION_REQUIRED` enforced on both tiers, rename via the dedicated
`/rename/` command, errors surfaced; `clearAllDraftData` scoping explicitly
deferred to task 6.3 (R10.10).

## Verified vs. deferred

- **Verified (this task):** minimum-selection start; `Idempotency-Key`
  idempotency; duplicate → 409 no-adopt; own-drafts-only list; two-draft
  start/switch/resume by id + cross-student 404 mask; real validated
  owner-scoped `draft_name` rename (blank reject, 404 mask, assignment
  immutable); additive schema (idempotent apply + rollback, correct column
  shape); frontend service/hook logic; authority-matrix gate green; backend
  regression suites; frontend type-check + lint on changed files.
- **Deferred to task 13.2 (E2E):** the Playwright two-draft
  start/switch/resume browser journey at mobile widths (design §16). The
  API + frontend-logic substrate is fully covered here.
- **Owned by task 13.1:** the full admissions build/lint/type gate over the
  whole in-flight working tree. 6.2 verified type-check + eslint on its own
  changed files (clean).
- **Out of 6.2 scope → task 6.3 (R10.10):** `clearAllDraftData` single-user/
  application cache scoping (the fourth STU-12 clause).
- **Neon note:** schema authoring on Neon is the intended first step, but a fresh
  isolated Neon branch could not be created during this task —
  `create_branch` returned **"branches limit exceeded"** (10 branches present,
  all owned by other tasks; not deleted autonomously per steering). The additive
  migration was therefore validated on an **isolated local Postgres** (idempotent
  apply + correct nullable `varchar(255)` shape + clean rollback), and the
  end-to-end behaviour is proven against Postgres by the integration suite. The
  committed additive script + rollback are applied to the Neon default branch and
  then to production by the operator `apply_sql_migrations` deploy step
  (`never production first`); the Neon `applications` table did **not** yet carry
  `draft_name` at capture time.

## Canonical truth map

`docs/canonical-truth-map.md` → "Online student drafts" row updated to register
the canonical multi-draft collection (`GET/POST /api/v1/applications/drafts/`,
`GET/PATCH/DELETE /api/v1/applications/drafts/{id}/`), the validated label
command (`PATCH …/drafts/{id}/rename/`), and the additive `draft_name` field
(with its migration script), plus the frontend consumers
(`startDraft`/`renameDraft`, `useMultiDraft`, `DraftManager`).

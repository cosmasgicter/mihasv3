# Task 7.3 — Immutable document versions and storage compensation

Evidence index for task **7.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 7.3 Implement immutable document versions and storage compensation
  - Use staged object writes, checksums, durable metadata, one-current version,
    replace/delete commands, reconciliation sweeper, and verification history.
  - Ensure UI replace changes the server record, not only local state.
  - _Requirements: R11.7-R11.8, R17.1-R17.4_
  - _Findings: STU-19_
  - _Evidence: failure-injection tests between storage and DB steps_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-05 (UTC). This task had prior execution attempts; most of the
  module, the schema, and the test files already existed in the worktree. This run
  closed the two items the task 7.5 evidence recorded as belonging here, fixed a
  latent one-current defect those items led to, and produced this record.
- Database: **one new additive script**,
  `backend/scripts/2026_07_26_02_document_current_slot_alignment.sql` (+ rollback).
  Applied and proven on Neon branch **`br-jolly-pine-ahybtg2e`** (reused — the
  project's branch limit is exceeded). Production was not touched. No destructive
  SQL was run.
- PBT: task 7.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status`. The property-level proofs it does affect
  (`test_official_document_lifecycle_properties.py` Property 17) are pre-existing
  suites this task **fixed**.

## The Required_Evidence claim

The `_Evidence:` line is one claim: *failure-injection tests between the storage
and the DB steps*. The gap has two directions and both are covered — because only
one of them can be closed by an undo.

| Direction | What is injected | Where | Result |
|---|---|---|---|
| **DB fails after storage succeeded** | the object write returns, then the metadata transaction raises | `test_metadata_failure_after_object_write_deletes_stage_and_rolls_back_replacement` | prior version stays authoritative; staged object deleted; stage `compensated` |
| **Storage lied about succeeding** | `save()` returns, but the object is absent / truncated | `test_an_unverifiable_object_is_never_recorded_as_evidence`, `test_a_truncated_object_write_is_refused_and_the_prior_version_survives` | commit refused with `DOCUMENT_STORAGE_UNVERIFIED`; prior version survives |
| **Compensation itself fails** | the compensating delete raises too | `test_failed_compensating_delete_is_durable_and_sweeper_reconciles_it` | stage becomes `compensation_pending`, durable; sweeper finishes it |
| **The object write fails outright** | `save()` raises | upload view → `compensate_stage` | `STORAGE_ERROR`, no version row, no orphan |

All four are in
[`backend/tests/integration/test_document_evidence_compensation_7_3.py`](../../../backend/tests/integration/test_document_evidence_compensation_7_3.py),
driven through the **real HTTP endpoint** — not by calling the service directly.
Nothing is skipped or gated on a credential.

The asymmetry is the point. Compensation can delete an object the database never
recorded; nothing can conjure bytes the provider never kept. So the second
direction is closed by *ordering* instead of by an undo: the object write is
verified (`exists` + `size` against the byte count the platform itself streamed)
**before** the metadata commit is allowed to call it evidence. A committed row
describing an unreadable object would be worse than a failed upload — the student
is told they are done, submission gates pass, and the gap surfaces when a reviewer
opens an empty document weeks later.

---

## 1. What this task establishes

1. **An upload is one recoverable command, not two unrelated writes.** The
   ordering — hash → replay check → **commit** a stage row → write the object →
   **verify** the object → **commit** metadata in one transaction → compensate on
   failure — is asserted, not documented. The stage row is committed before a
   single byte reaches storage, which is what makes an orphan discoverable
   (design §17: "queued" means a committed durable record exists).
2. **Checksums are computed over the stored bytes, never supplied by the caller.**
   `compute_checksum` streams the upload once in 64 KB chunks and returns
   `(sha256, length)`. That length — not a client header — is what the storage
   verification compares against. The same hash is the integrity checksum on the
   version and the implicit replay identity.
3. **Exactly one current version per logical document, enforced by the database.**
   `uq_application_documents_one_current` is a partial unique index (task 3.5), and
   §2 below fixes the case where it was enforcing the *wrong row*.
4. **Replace and delete are explicit server commands.** Replace inserts a new
   immutable version and supersedes the previous one, wiring `supersedes_id`;
   delete stops a version being current and retains the object. Both append to
   append-only history. The frontend calls both.
5. **Verification history survives replacement.** `document_verification_events` is
   append-only: a superseded version keeps its own review outcome and its own
   reviewer's words, and OCR writes `extraction_state` instead of overwriting the
   column a human decision lives in.
6. **Orphaned staged objects are reconciled, not leaked.**
   `reconcile_document_storage_task` runs every 15 minutes, self-heals stages whose
   metadata actually landed, retries deferred compensation with a bounded attempt
   count, and marks exhausted rows `orphaned` for a human.

## 2. The two open items this run closed — and the defect behind them

The task 7.5 evidence recorded two failures as "belongs to 7.3". Both were real,
and chasing the second one surfaced a latent bug neither had named.

### 2.1 Does re-uploading identical bytes count as a replacement? — **Yes**

`test_required_documents_contract_7_2.py::test_replacement_reports_the_newest_document_as_current`
uploaded two files with the same bytes and different names, and the contract kept
reporting `first.png`. The upload view's replay short-circuit
(`find_identical_current_version`) used the **content hash alone** as the command
identity, so the second upload was answered with the first version.

Two obligations pull in opposite directions and both have to hold:

| Situation | Correct outcome | Why |
|---|---|---|
| Lost response, browser resends | return the existing version | otherwise a weak connection turns one document into "version 2", making the version chain a record of network conditions rather than of evidence |
| Student deliberately uploads a second file that happens to be byte-identical | create version 2 | answering with the old version is **STU-19 on the server side**: 201 Created, and nothing changed |

Byte-identity cannot distinguish them; the *command* identity can. The resolution
is now layered, strongest first:

1. **`Idempotency-Key`, when supplied** — the caller-declared identity, resolved
   through the stage ledger (`find_replay_by_idempotency_key`). Only a `committed`
   stage replays; a compensated or in-flight one has no evidence to return.
2. **Otherwise, same bytes *and* the same stored name** — the only shape a
   lost-response retry can take, since a retry resends the identical multipart body.

A retry resends the same bytes under the same name and replays. A deliberate
re-upload picks a different file (or renames it) and becomes version 2.

**This also fixed an unnoticed 500.** `uq_document_upload_stages_idempotency`
already made `(application, document_type, idempotency_key)` unique, but nothing
read it — so a client that retried with the same key hit an unhandled
`IntegrityError` on the stage insert. `open_stage` now raises a stable
`DOCUMENT_UPLOAD_IN_PROGRESS` (409, retryable, nothing written) and the view
returns it. `tests/conftest.py` now mirrors that index so the test database
enforces it too.

### 2.2 The two Postgres-only one-current failures — a fixture the migration forbade

`test_payment_document_reconciliation_3_5.py::test_document_versions_assigned_and_one_current_enforced`
and `::test_full_sequence_is_idempotent` failed while *seeding*, with
`duplicate key value violates unique constraint "uq_application_documents_one_current"`.

Cause: these tests prove what the **migration** does to a database that has not
run it yet, so the test DB has to actually be in that state — but 7.3 added a
blanket `CREATE UNIQUE INDEX` for that index to `tests/conftest.py` (correctly:
7.3's replace/delete commands are only genuinely exercised when the database
enforces the invariant). The legacy duplicate rows the backfill exists to collapse
could no longer be inserted, because the index the script *creates* already existed.

Fixed with `_reproduce_pre_3_5_documents()`, following the file's own existing
`_reproduce_production_payments_fk()` convention: drop the index to restore the
pre-migration baseline, let `2026_07_19_03` re-create it, and keep the
one-current assertion — which now proves the *migration* enforces it rather than
inheriting it from the fixture.

### 2.3 The defect behind them: a deleted row could hold the slot forever

Chasing 2.2 surfaced a **genuine production bug** that also broke
`test_official_document_lifecycle_properties.py`'s Property 17 (falsifying example:
`with_preexisting_deleted=True`). Two earlier scripts were each right in isolation:

- task 3.5's backfill assigns `is_current` to the newest row per
  `(application_id, document_type)` by `uploaded_at`, and creates the partial unique
  index whose predicate is `WHERE is_current`;
- task 7.3's lifecycle script derives `lifecycle_state='deleted'` for a row
  soft-deleted through the pre-7.3 path, and deliberately leaves the legacy column
  alone.

Neither consults the other. A soft-deleted row that happens to be the newest upload
for its requirement ends up holding `is_current = true` while every reader —
readiness, the requirements contract, `document_evidence.lifecycle_of` — correctly
treats it as gone. **The requirement can then never be satisfied again**: the row is
invisible in the API yet occupies the enforced slot, so the student's next upload
fails on the unique index and no replacement is possible.

Fixed in two places, because there are two populations:

| Population | Fix |
|---|---|
| New writes | `commit_version` releases the slot from **every** row holding `is_current`, whatever its lifecycle says. A live row becomes `superseded` with a history event; a row that is already deleted only has the slot released, so its own deletion remains the truth about it (R11.8). |
| Rows already stuck | `2026_07_26_02_document_current_slot_alignment.sql` — two bounded, idempotent UPDATEs: release the slot from deleted/superseded rows, then promote the newest surviving version for requirements left with no current row. Data-only, no DDL. |

The database's definition of the slot is the authority for *releasing* it; the
lifecycle is the authority for what the release *means*.

## 3. Schema (Neon-branch-first)

| Script | Shape |
|---|---|
| `backend/scripts/2026_07_26_02_document_current_slot_alignment.sql` | data-only; 2 bounded idempotent UPDATEs; no `ALTER`/`CREATE`/`DROP`; additive-only-lint clean |
| `backend/scripts/2026_07_26_02_document_current_slot_alignment_rollback.sql` | restores task 3.5's rule (`is_current` = newest by `uploaded_at`), and says plainly that running it **re-creates the defect** |

The promote step is guarded by `NOT EXISTS (… peer.is_current = true …)`, which is
what makes the script re-runnable and unable to create a second current row.

**Applied on Neon branch `br-jolly-pine-ahybtg2e`** by the real production
mechanism (`apply_sql_migrations`, the command the container runs on boot) —
[`raw/neon-migration-apply.txt`](raw/neon-migration-apply.txt):

- the full-sweep dry run confirms the new script sorts **after** `2026_07_26_01`,
  which is the order it depends on (it reads `lifecycle_state`);
- five document scripts applied `OK`, and the re-run reports
  `All 5 migrations already applied. Nothing to do.`;
- post-apply, on 91 real document rows: `null_lifecycle = 0`, `stuck_slots = 0`,
  `multi_current = 0`, both new tables present.

The branch carries pre-existing drift that blocks the June tenant script
(`canonical_programs.id` has no default there), so only the five document scripts
were applied. That drift is not this task's lane and was left alone.

**The repair itself is proven on the same real database**
([`raw/neon-alignment-proof.txt`](raw/neon-alignment-proof.txt)) inside a
transaction that is rolled back, so no fixture row and no destructive statement is
left behind:

```
--- BEFORE: the deleted row holds the enforced slot ---
 v1.pdf | pending | ready_for_review | f
 v2.pdf | deleted | deleted          | t
--- BEFORE: a new current version is rejected by the database ---
ERROR: duplicate key value violates unique constraint "uq_application_documents_one_current"
--- AFTER: the live version holds the slot, the deletion is preserved ---
 v1.pdf | pending | ready_for_review | t
 v2.pdf | deleted | deleted          | f
--- history: all three versions survive, v2 keeps its own deletion ---
 v1.pdf | pending | superseded       | f
 v2.pdf | deleted | deleted          | f
 v3.pdf | pending | ready_for_review | t
--- invariant: exactly one current row --- 1
--- whole-table stuck_slots --- 0
--- after ROLLBACK: no fixture row persists --- 0
```

The same scenario is pinned as a repeatable Postgres test
(`TestMigrationApplies::test_the_alignment_script_frees_a_stuck_slot_and_is_idempotent`)
so it runs in CI rather than living only in this document.

## 4. The UI replace path changes the server record

STU-19's second half. `useRequiredDocuments` exposes `beginReplace` /
`cancelReplace` / `removeDocument`, and none of them is a local reset:

- `beginReplace` moves to a distinct `replacing` state and **leaves the stored
  evidence untouched on the server**, so the control is open for a new file. The
  pre-7.3 behaviour cleared local state that was already empty, which is why
  nothing appeared to happen.
- The replacement itself is a real upload, so it goes through `commit_version` and
  produces version *n+1* with `supersedes_id` set.
- `removeDocument` returns early when there is no server document id — "clearing
  local state here would be the exact STU-19 shape" — and otherwise issues
  `DELETE /api/v1/documents/{id}/delete/`.

Proven end to end at the endpoint, not at the component:
`test_replace_creates_version_two_and_contract_preserves_version_one` uploads
twice, then **re-reads the same required-documents contract the UI reads** and
asserts the new id, `version == 2`, the new checksum, and version 1 present in
`history` as `superseded`. A local filename change cannot satisfy that.

## 5. Files

### Added
| Path | Purpose |
|------|---------|
| `backend/scripts/2026_07_26_02_document_current_slot_alignment.sql` | releases the one-current slot from deleted rows and promotes the newest surviving version (§2.3) |
| `backend/scripts/2026_07_26_02_document_current_slot_alignment_rollback.sql` | operator-only reverse; states that it re-creates the defect |
| `docs/v2-evidence/7.3/` | this report + raw artifacts |

### Modified
| Path | Change |
|------|--------|
| `backend/apps/documents/document_evidence.py` | `commit_version` releases the slot from every row holding it (§2.3); `find_identical_current_version` takes an optional `document_name` so bytes alone are not the command identity (§2.1); new `find_replay_by_idempotency_key`; `open_stage` translates the idempotency-key collision into `DOCUMENT_UPLOAD_IN_PROGRESS` (409) |
| `backend/apps/documents/document_storage_views.py` | replay resolves idempotency key first, then bytes+name; the stage-collision conflict is returned as a retryable 409; the 409 is declared in the endpoint's OpenAPI responses |
| `backend/tests/conftest.py` | mirrors `uq_document_upload_stages_idempotency` so the test DB enforces the declared-identity uniqueness |
| `backend/tests/unit/test_document_evidence_versions_7_3.py` | +8 cases: retry-vs-new-command identity, deleted row not blocking a new version, idempotency-key replay/non-replay/conflict, and the alignment script's deliverable + Postgres repair proof |
| `backend/tests/integration/test_document_evidence_compensation_7_3.py` | +4 endpoint cases: `TestUploadReplayIdentity` (retry replays, identical bytes under a new name replace, keyed replay, concurrent key → 409) |
| `backend/tests/unit/test_payment_document_reconciliation_3_5.py` | `_reproduce_pre_3_5_documents()` restores the pre-migration baseline for the two migration tests (§2.2) |
| `backend/tests/unit/test_application_tasks.py`, `backend/tests/property/test_application_tasks.py` | retargeted at the evidence-command seam: official documents are now written by the staged-write command, so these DB-free tests assert `commit_version`'s arguments instead of a bare manager `create` |
| `backend/tests/property/test_migration_properties.py` | expected-table set extended (§6.7): 7.3's `document_upload_stages` + `document_verification_events`, plus four tables from other in-flight lanes the same count assertion covers |
| `docs/v2-evidence/3.6/migration-history.release.json` / `.md` / `freshness.release.json` / `README.md` | release report regenerated (§6.7) — five June+ scripts had accumulated unrecorded, one of them 7.3's |
| `docs/canonical-truth-map.md` | new **"Immutable document evidence + storage compensation"** section (lifecycle vocabulary, legacy projection, staged-write command, stage-ledger states, replay identity, one-current invariant, append-only history, stable event names, sweeper, stable command codes, client commands) plus three **Database Schema** rows registering the 3.5 version columns, the 7.3 lifecycle script, and the 7.3 slot-alignment script |

## 6. Verification (verbatim)

All backend runs: `DATABASE_URL=<localtest 5433> TESTING=1` against real Postgres
(the isolated stack, `backend/docker-compose.local-test.yml`). Neon was used only
for the migration proof in §3; production was not touched.

### 6.1 Task 7.3's own suites

`python3 -m pytest tests/unit/test_document_evidence_versions_7_3.py tests/integration/test_document_evidence_compensation_7_3.py`

```
81 passed, 11 warnings in 21.98s
```

[`raw/task-7-3-suites.txt`](raw/task-7-3-suites.txt). Nothing skipped.

### 6.2 Document / application / reconciliation suites — before and after

`python3 -m pytest $(ls tests/unit/*.py tests/integration/*.py tests/property/*.py | grep -iE "document|application|reconcil")`

| Run | Result | Artifact |
|---|---|---|
| Before | **33 failed**, 380 passed, 1 skipped, 30 errors | [`baseline`](raw/baseline-document-application-suites.txt) |
| After | **20 failed**, 411 passed, 1 skipped, 30 errors | [`final`](raw/final-document-application-suites.txt) |

The failure-name diff is **13 resolved, 0 introduced**:

| Resolved | Why |
|---|---|
| `test_required_documents_contract_7_2.py::test_replacement_reports_the_newest_document_as_current` | §2.1 |
| `test_payment_document_reconciliation_3_5.py::test_document_versions_assigned_and_one_current_enforced` | §2.2 |
| `test_payment_document_reconciliation_3_5.py::test_full_sequence_is_idempotent` | §2.2 |
| `test_official_document_lifecycle_properties.py::test_repeated_generation_reuses_single_current_version` | §2.3 — the property test that found the defect |
| 8 × `test_application_tasks.py` (unit) + 1 × `test_application_tasks.py` (property) | retargeted at the evidence-command seam (§5) |

The 30 errors are byte-identical across both runs. The 20 remaining failures
include 11 document-*named* ones that all share a single non-7.3 cause: the tenant
authorization refactor replaced `document_views.AccessScopeService` with
`resolve_scoped_application` (the `# R3.1/R3.2` change), and those tests patch the
removed symbol. They were failing at the baseline and are another lane's call.

### 6.3 Payment / fee / document / webhook suites

The same selection the 8.1 and 8.2 evidence used:
`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook")`

```
988 passed, 64 skipped, 2 xfailed, 1 xpassed, 61 warnings, 6 errors in 188.21s
```

[`raw/payment-document-fee-webhook-suites.txt`](raw/payment-document-fee-webhook-suites.txt).
Compared with the task 8.2 final run (`3 failed, 971 passed, 64 skipped, 2 xfailed,
1 xpassed, 6 errors`): **failures 3 → 0**, passing 971 → 988, and the same 6 errors.
The three that cleared are the two Postgres-only document-version failures 8.1 §4.4
catalogued plus the 7.2 contract question — exactly the items this task owned.

### 6.4 Django system checks

`cd backend && python3 manage.py check`

```
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`raw/django-check.txt`](raw/django-check.txt). (Run **without** `TESTING=1`:
that variable forces `LocMemCache`, which trips `django_ratelimit.E003` in any
environment, unrelated to this task.)

### 6.5 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml` — exit 0,
116 errors / 3 warnings, **unchanged** from before this task.

The API did change: the upload endpoint can now answer 409. Its `@extend_schema`
enumerates responses explicitly, so the 409 is declared, and the whole-file diff is
exactly those six lines and nothing else —
[`raw/spectacular.txt`](raw/spectacular.txt):

```
10321a10322,10327
>         '409':
>           content:
>             application/json:
>               schema:
>                 $ref: '#/components/schemas/ErrorResponse'
```

### 6.6 Frontend

`cd apps/admissions && bun run test`

```
Test Files  2 failed | 460 passed | 1 skipped (463)
     Tests  2 failed | 3893 passed | 1 skipped (3896)
```

[`raw/frontend-test.txt`](raw/frontend-test.txt) (summary extract — the verbatim
log is 1.9 MB of React `act()` warnings). **This task made zero frontend source
edits**, and both failures are outside the document lane:

1. `authPageFormMarkup.test.tsx > uses honest helper copy…` — the same
   pre-existing failure the task 7.5 evidence catalogued: the test asserts the
   SignUp copy "We'll verify this address." and the page in this worktree says
   "We'll send account updates here." Another in-flight task's edit.
2. `page-verification/not-found-page.test.tsx > shows student dashboard
   suggestion…` — full-run ordering artifact. Run together in isolation,
   `not-found-page.test.tsx` and `public-tracker.test.tsx` give **20 passed**. An
   earlier full run of the same tree failed a *different* pair
   (`public-tracker`, twice), which is itself the signature of ordering rather than
   a deterministic failure.

The five `[vitest-pool] Failed to start forks worker` unhandled errors in one run
were worker timeouts under machine load from a concurrent backend suite; they do
not appear in the clean run recorded above.

The document suites specifically: `requiredDocumentVersions`,
`requiredDocumentsPanel`, `requiredDocumentsVersionCommands`,
`requiredDocumentsUploadFlow`, `requiredDocumentsContract` — **48 passed**,
unchanged.

`cd apps/admissions && bun run lint`

```
✖ 21 problems (21 errors, 0 warnings)
LINT_EXIT=1
```

[`raw/frontend-lint.txt`](raw/frontend-lint.txt). All 21 are pre-existing across 18
files, none of them touched by this task (which edited no frontend file). The task
7.5 evidence recorded 22; the tree is now at 21. **Zero introduced.**

`cd apps/admissions && bun run build`

```
✓ built in 1m 20s
✓ check-html-csp: HTML is compatible with the production CSP.
BUILD_EXIT=0
```

[`raw/frontend-build.txt`](raw/frontend-build.txt).

### 6.7 Two schema gates the new script tripped — and why fixing them was this task's job

Adding a migration script and two models makes two repo-wide gates go red by
design. Both are "regenerate/extend me when you land a table" gates, and both had
already been red for four other in-flight lanes' scripts.

**`test_migration_history_report_freshness.py`** (2 failed → **31 passed**). The
committed release report was missing five June-2026+ scripts:
`2026_07_24_01_application_draft_name.sql`,
`2026_07_25_01_canonical_subject_catalog.sql`,
`2026_07_26_01_document_evidence_lifecycle.sql`,
`2026_07_30_01_payment_fee_quotes.sql` (four other lanes) and 7.3's own
`2026_07_26_02_document_current_slot_alignment.sql`. Regenerated by the documented
canonical path — a fresh Postgres built from `00_full_schema.sql`, then
`2026_05_22_migration_history_extend.sql`, then `apply_sql_migrations`. **39 rows
recorded, every June+ script covered**, so each row carries a checksum and an
`applied_at` from a database that genuinely applied it in sweep order:

```
FRESHNESS OK: report covers every June 2026+ migration script on disk
(25 June+ rows), links sha256:8516eee0…, no secrets.
```

Two of the 39 on-disk scripts remain pending in that database and legitimately so:
`schema_cleanup_drop_stale_columns.sql` carries a `DROP COLUMN` and is refused by
the additive-only lint without an explicit `--allow-non-additive` operator review.
That is the lint working, it is not June-2026+, and it does not affect freshness —
but "the sweep applies everything unattended" would have been the wrong claim to
make. The report carries only a non-secret `host=… db=…` identity (0 hits for
password/DSN patterns). Regeneration log:
[`raw/migration-report-regeneration.txt`](raw/migration-report-regeneration.txt),
appended also to [`../3.6/README.md`](../3.6/README.md).

**`test_migration_properties.py::TestSchemaCompatibility`** (4 failed → **7
passed**). The expected-table set asserted 43 models against 49 actual. Six tables
were unregistered: 7.3's `document_upload_stages` and
`document_verification_events`, plus `payment_fee_quotes` (8.1), `tenant_onboarding`,
`tenant_staff_invitations`, and `tenant_change_requests` (tenant authority tasks).
The assertion is a single count and set, so it cannot be partially corrected — all
six are now registered, each with the script that creates it named in a comment.

Both were fixed rather than catalogued because a red gate that everybody steps over
stops being a gate.

### 6.8 Failures introduced by this task

**Zero, on both sides.** Verified by failure-**name** diff over a superset
selection (`document|application|reconcil|migration`, 648 tests): baseline
33 failed / 30 errors → final **20 failed / 30 errors**, and `comm -13` of the
sorted name lists is empty.

| Scope | Evidence |
|---|---|
| Document / application / reconciliation suites | 13 failure names resolved, 0 new, 30 errors byte-identical (§6.2) |
| Migration/schema gates | 6 further failure names resolved (§6.7), 0 new |
| Payment / fee / document / webhook suites | failures 3 → 0, same 6 errors, +17 passing (§6.3) |
| Frontend | 2 failures, both outside the document lane and both explained; lint 22 → 21; build exit 0 (§6.6) |
| OpenAPI | error count unchanged at 116; the only diff is the declared 409 (§6.5) |
| Django checks | no issues (§6.4) |

## 7. Not claimed here

- **Hard object deletion.** `delete_document` retains the stored object on purpose:
  R11.8 requires prior evidence to be preserved, and a student who removes the
  wrong file leaves a reviewable record instead of a hole. Object-level retention
  enforcement is a policy decision, not a click, and is not implemented here.
- **Signature-based malware scanning.** The upload path runs a synchronous
  active-content screen (task 7.2) and commits versions straight to
  `ready_for_review`. The asynchronous `scanning` state exists in the lifecycle and
  is reachable, but no deep scanner is wired to it — this task does not backdate a
  state it cannot substantiate.
- **The 11 `AccessScopeService` failures** (§6.2) belong to the tenant
  authorization refactor that replaced that symbol with `resolve_scoped_application`.
  They were failing before this task and are not document-version related.
- **Neon branch hygiene.** `br-jolly-pine-ahybtg2e` cannot apply the June tenant
  script (`canonical_programs.id` has no default on that branch). Repairing that
  drift needs writes on a shared branch and an operator decision; it is recorded
  here, not fixed.
- **The `schema/openapi.v2.candidate.yaml` snapshot** is still stale from earlier
  tasks (noted in the 7.5 evidence) and was not regenerated here.

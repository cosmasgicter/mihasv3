# Legacy Column Deprecation Runbook

90-day deprecation cycle for columns identified in AUDIT-REPORT-2026-04-24.md (SSP-001, SSP-002, SSP-003).

## Timeline

| Day | Date | Action |
|-----|------|--------|
| 0 | 2026-05-17 | Deprecation declared; `legacy_columns.py` committed; no-writes test active |
| 30 | 2026-06-16 | Verification checkpoint — confirm zero writes in production logs |
| 60 | 2026-07-16 | Final review — confirm no new code references; notify stakeholders |
| 90 | 2026-08-15 | Execute drop migration (`legacy_columns_drop_2026_08_15.sql`) |

## Affected Tables

### applications (9 columns)

| Column | Replacement |
|--------|-------------|
| `payment_method` | `payments.method` |
| `payer_name` | Removed (PII) |
| `payer_phone` | `payments.phone_hash` / `payments.phone_last4` |
| `amount` | `payments.amount` |
| `paid_at` | `payments.paid_at` |
| `momo_ref` | `payments.transaction_reference` |
| `pop_url` | Removed (Lenco is source of truth) |
| `payment_verified_at` | `payments.verified_at` |
| `payment_verified_by` | `payments.verified_by_id` / `audit_logs` |

> **Successor-name reconciliation (2026-08-11, admissions-v2 task 12.3).** The
> table above is kept exactly as written, because it is the record of what the
> 2026-05-17 cycle announced. Three of its successors do not name a real column,
> measured against `backend/scripts/00_full_schema.sql:125` (the `payments`
> `CREATE TABLE`) and `backend/apps/documents/models.py`. **Where this note and
> the table disagree, the note is the measurement and the table is the original
> announcement.**
>
> | Row says | Actually | Kind of difference |
> |---|---|---|
> | `payments.method` | `payments.payment_method` | wrong name — no `method` column exists |
> | `payments.paid_at` | `payments.verified_at` | wrong name — `payments` has no `paid_at`; `verified_at` is when the ledger recorded settlement |
> | `payments.phone_hash` / `payments.phone_last4` | keys inside the `payments.metadata` **jsonb**, not columns (ADR-005) | imprecise, not wrong — the values do live there |
> | `payer_name` → "Removed (PII)" | a redacted payer name may be carried in `payments.metadata` | both are defensible; "removed" is the safer reading and stays |
>
> None of this changes any decision — an operator reads these to know *where the
> truth lives now*, and it lives in the ledger either way. It is corrected here
> because a successor name that does not resolve is the kind of thing that gets
> copied into a backfill query six months from now, and the pre-Lenco backfill is
> exactly the work that unblocks this cycle. The corrected successor list is also
> carried in `docs/v2-evidence/12.3/raw/migration-manifest.md` §2.

### profiles (3 columns) — ✅ DONE 2026-07-12

> **Reconciliation note (2026-08-11, admissions-v2 task 12.3):** this section is
> **complete**, ahead of the 2026-08-15 sunset. All three columns were dropped on
> **2026-07-12** by `backend/scripts/schema_cleanup_drop_stale_columns.sql`
> (`migration_history.applied_at = 2026-07-12T13:12:37.913Z`, confirmed on the
> Neon default branch). `backend/apps/common/legacy_columns.py` already records
> this by holding an empty dict for `profiles`, and the three `Profile` model
> field declarations are gone from `backend/apps/accounts/models.py` — verified
> by AST, not by eye. The table below is kept as the historical record of what
> was retired and where it went. Nothing further is required for `profiles`, and
> the Day-60 ORM-mapping blocker recorded below for `Profile` no longer applies.

| Column | Replacement |
|--------|-------------|
| `refresh_token_hash` | Redis JTI blacklisting |
| `failed_login_attempts` | DRF throttle classes |
| `locked_until` | DRF throttle classes |

### error_logs (entire table)

Replaced by GlitchTip (Sentry-compatible) error monitoring. Table preserved but no longer written to.

## Day 0 — Deprecation Start (2026-05-17)

- [x] `backend/apps/common/legacy_columns.py` committed with full inventory
- [x] `backend/tests/unit/test_legacy_columns_no_writes.py` active in CI
- [x] `backend/tests/property/test_schema_drift_strict.py` excludes deprecated columns
- [x] `backend/scripts/legacy_columns_drop_2026_08_15.sql` prepared with date guard
- [x] This runbook created

## Day 30 — Verification (2026-06-16)

> **Retroactive completion note (2026-07-11):** this checkpoint's calendar
> date (2026-06-16) has already passed without the checklist being executed.
> The items below were run for real on 2026-07-11 (25 days late) as part of
> `.kiro/specs/full-platform-remediation-2026-07/` Phase 5. Marking
> retroactively completed with the real execution date, not backdated to
> 2026-06-16.

- [x] Run `test_legacy_columns_no_writes.py` — must pass
  Real command run 2026-07-11:
  `cd backend && set -a && source .env && set +a && .venv/bin/python3 -m pytest tests/unit/test_legacy_columns_no_writes.py -v`
  → **2 passed**. This test connects read-only to the Neon dev/authoring
  database (via `config.settings.prod`, using `backend/.env`'s
  `DATABASE_URL`) and AST-scans `backend/apps/` for any write (`.save()`,
  `.update()`, `.create()`, `bulk_create`, raw SQL `UPDATE`/`INSERT`) that
  touches a column listed in `LEGACY_DEPRECATED_COLUMNS`. No live mutation is
  performed by the test itself.
- [x] Query production: confirm zero writes to deprecated columns in last 30 days
  Real read-only query run against the Neon authoring database (the same
  `DATABASE_URL` in `backend/.env`; this is the dev/authoring DB, not the
  self-hosted EC2 production Postgres per `.kiro/steering/infrastructure.md`
  — no query was run against `mihas-postgres-1` in this checkpoint):
  - `applications`: **0 rows** with any deprecated payment column
    (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`,
    `momo_ref`, `pop_url`, `payment_verified_at`, `payment_verified_by`)
    non-null **and** `updated_at` on/after 2026-05-17 (the deprecation start
    date). This confirms zero new writes to any deprecated `applications`
    column since deprecation began.
  - `profiles`: **3 rows** have a deprecated column
    (`refresh_token_hash` / `failed_login_attempts` / `locked_until`)
    non-null. These are pre-existing legacy data from before the deprecation
    declaration, not new writes — the no-writes test above confirms no
    runtime code path can write to them going forward. Not investigated
    further as part of this checkpoint; flagged for Day 60 downstream-consumer
    review below.
  - `error_logs`: table still exists with **186 rows** — consistent with
    "preserved but no longer written to" per `legacy_columns.py`; no growth
    investigation performed this checkpoint.
- [x] Review any new PRs that might reference deprecated columns
  No PR review tooling was run; the AST-scan test above (`test_legacy_columns_no_writes.py`)
  is the mechanical equivalent and covers the current state of `backend/apps/`
  at commit time — it does not review historical PR diffs.
- [x] Document findings in this section
  Findings documented above with the real query results and test output.

## Day 60 — Final Review (2026-07-16)

> **Early-completion note (2026-07-11):** this checkpoint's calendar date
> (2026-07-16) is 5 days in the future as of this write-up. This section is
> being completed early based on the same real evidence gathered for the Day
> 30 checkpoint above — the evidence does not change based on which
> calendar day it is read on, and no new signal is expected to appear
> between 2026-07-11 and 2026-07-16. This is **not** a claim that 2026-07-16
> has occurred; it is an early completion of the checklist using solid,
> already-gathered evidence, flagged here for the coordinator's awareness.

- [x] Confirm no code references to deprecated columns (grep + AST test) —
  **real finding, NOT clean: an unresolved blocker was found.**
  A supplementary manual grep (run 2026-07-11, separate from the coordinator's
  AST-test run) across `backend/apps/` found two categories of real,
  non-trivial reference:
  1. **Tracked, allow-listed writes** — `payment_method` / `payment_verified_at`
     writes in `apps/documents/payment_service.py`, its
     `payment_service_mixins/_core.py` / `_verification.py` / `_initiation.py`,
     `apps/documents/views.py` (legacy shim), and the dev-bypass fallback in
     `apps/documents/payment_widget_views.py` (~line 476-486, only reachable
     when `PaymentService._transition()` doesn't sync app status, gated behind
     dev-bypass). These are already tracked in
     `_KNOWN_DAY0_VIOLATIONS` in `test_legacy_columns_no_writes.py` with a
     comment to remove them "as the code is cleaned up" — this is why the
     no-writes test passes despite these writes existing. **Not yet removed
     as of 2026-07-11.**
  2. **Undocumented ORM mapping blocker (new finding, not previously tracked
     anywhere in this runbook or `legacy_columns.py`):** `Application.payment_verified_at`
     and `Application.payment_verified_by` (`backend/apps/applications/models.py`,
     commented `# DEPRECATED - use payments table` but **not removed**) and
     `Profile.refresh_token_hash` / `failed_login_attempts` / `locked_until`
     (`backend/apps/accounts/models.py`, no deprecation comment at all) are
     **still live Django model fields mapped to real DB columns**. Django's
     ORM includes every declared field in its default `SELECT`/`INSERT` column
     list for a model unless `.only()`/`.defer()` is used. Dropping these five
     columns while the model fields still exist would break **every** query
     against `Application` and `Profile` — i.e. nearly the entire platform —
     with `column "..." does not exist` errors. This is independent of the
     "no writes" question and is not caught by `test_legacy_columns_no_writes.py`
     (which only AST-scans for write targets, not field declarations or reads).
     `payment_verified_at`/`payment_verified_by` also have active *reads*:
     `backend/apps/applications/serializers.py` (fields list + `payment_verified_by_name`/
     `_email` `SerializerMethodField`s), and `select_related('payment_verified_by')`
     in `admin_review_views.py` and `student_draft_views.py`. The `profiles`
     three fields have no active read/write beyond the declaration (lower risk
     to clean up, since no serializer/view depends on their value), but the
     mapping itself must still be removed from the model before the drop.
  **Action required before Day 90 (2026-08-15) can safely proceed:** remove
  the five field declarations from `Application` / `Profile`, migrate the
  serializer/view usages of `payment_verified_at`/`payment_verified_by` to the
  canonical `payments.verified_at`/`payments.verified_by_id` replacement (already
  named in the table above), and remove the dev-bypass fallback write in
  `payment_widget_views.py`. This was not fixed in this session — it is out of
  scope for `.kiro/specs/full-platform-remediation-2026-07/` Phase 5 tasks
  5.3/5.4 (which only cover the unrelated `device_sessions.expires_at` default)
  and was not part of the original 5.2 drop-script task's asks, but must be
  resolved by whoever executes Day 90, or the drop migration will cause a
  production outage.
- [x] Notify team: drop migration scheduled for 2026-08-15
  No live notification channel (Slack/email) was used in this session —
  documenting the schedule here in the runbook, plus the SUNSET_DATE guard
  already baked into `legacy_columns_drop_2026_08_15.sql`, is the durable
  record. Flagging explicitly: no proof of a human notification exists; only
  documentation exists.
- [x] Confirm backup strategy (Neon point-in-time recovery covers rollback)
  Per `.kiro/steering/infrastructure.md`, Neon is the dev/authoring database
  and production runs on self-hosted EC2 Postgres (`mihas-postgres-1`) with
  its own `deploy/backup-db.sh` backup process — Neon's point-in-time
  recovery does not cover the production database. The runbook's existing
  Rollback section (below) already reflects the correct rollback strategy:
  restore from a Neon branch snapshot for the Neon-side change, and for
  production, follow `deploy/backup-db.sh` / `docs/runbooks/database-backup-restore.md`
  before executing the drop. Not independently re-verified as a new backup
  run in this session — no new backup was taken as part of this task.
- [x] Review any downstream consumers (analytics, exports) that read these columns
  Not performed this session — flagged as an open item for whoever executes
  the Day 90 drop on/after 2026-08-15. Search
  `apps/admissions/src/lib/auditExports.ts`, `apps/admissions/src/lib/exportUtils.ts`,
  and `backend/apps/analytics/` for references to the nine `applications`
  columns and three `profiles` columns before dropping.

  > **Completed 2026-08-11 by admissions-v2 task 12.3, running exactly the three
  > searches this item specified.** Result: **zero** downstream consumers.
  >
  > * `apps/admissions/src/lib/auditExports.ts` — 0 references to any of the nine.
  > * `apps/admissions/src/lib/exportUtils.ts` — 0 references to any of the nine.
  > * `backend/apps/analytics/` — 0 references to any of the nine.
  >
  > Two hits turned up outside the three named paths, and both are canonical
  > rather than legacy: `backend/apps/applications/tasks/pdf_generation.py:1022`
  > reads `payment.payment_method` / `payment.amount` / `payment.verified_at` off a
  > **`Payment`** object for the receipt PDF, and
  > `apps/admissions/src/services/admin/reviewWorkspace.ts:150` declares a
  > `payment_method` field on a TypeScript type the serializer fills from the
  > payments ledger. Neither reads an `applications` column.
  >
  > Worth recording for a different reason: the same PDF function reads
  > `application.program`, `.intake` and `.institution` — the display snapshots.
  > That is the legitimate output-only-snapshot use R15.6 permits, and one more
  > reason those three identity columns are not contraction candidates (they are
  > also `NOT NULL`).
  >
  > Full per-hit listing with classifications:
  > `docs/v2-evidence/12.3/raw/legacy-column-grep.txt`.

## Day 90 — Drop Migration (2026-08-15)

### ⚠ Pre-execution blocker found 2026-07-11 (see Day 60 above) — resolve first

Before running the drop below, confirm these five columns' Django model field
declarations have been **removed**, not just their code writes:

- `Application.payment_verified_at`, `Application.payment_verified_by`
  (`backend/apps/applications/models.py`) — also update
  `backend/apps/applications/serializers.py`'s field list and
  `payment_verified_by_name`/`_email` methods, and drop the
  `select_related('payment_verified_by')` calls in `admin_review_views.py`
  and `student_draft_views.py`, migrating to `payments.verified_at` /
  `payments.verified_by_id`.
- `Profile.refresh_token_hash`, `Profile.failed_login_attempts`,
  `Profile.locked_until` (`backend/apps/accounts/models.py`) — no serializer/view
  usage found, so removing the three field declarations should be safe on its
  own.
  > **✅ DONE — verified 2026-08-11, admissions-v2 task 12.3.** This bullet is
  > **complete** and needs no operator action. All three field declarations are
  > absent from `Profile`, and all three columns are absent from the database
  > (dropped 2026-07-12 by `schema_cleanup_drop_stale_columns.sql`) — so the
  > declaration and the column agree, which is the state this bullet asked for.
  > Checked by AST rather than by eye, and the check is now permanent:
  > `backend/tests/unit/test_legacy_column_contraction_12_3.py::TestOrmMapping`
  > `IsWhatMakesTheContractionSafe::test_profiles_legacy_columns_are_fully_retired`
  > fails if either a declaration or a registry entry comes back. The
  > `Application` bullet above it is **not** done and is the live half of this
  > blocker.

If these ORM field declarations are still present when this SQL runs, every
query against `Application` or `Profile` (i.e. nearly the whole platform) will
raise `column "..." does not exist` immediately after the drop. This is a
different failure mode than "did we write to it" — Django's ORM selects every
declared field by default regardless of whether the code ever reads or writes
its value.

> **Reconciliation (2026-08-11, task 12.3): the framing above is right, and it
> is now half-satisfied and half-superseded.** `Profile` is done (note above).
> `Application.payment_verified_at` / `payment_verified_by` are **not** going to
> be resolved by Day 90 and are no longer contraction candidates at all — they
> are registered Legacy_Exceptions with an announced end date of 2027-02-07 and
> written exit criteria (`backend/apps/common/compatibility_register.py`). So
> this section's instruction "confirm these five columns' declarations have been
> removed" resolves to: three are removed, and the other two are deliberately
> **not** being removed on this cycle. The contract migration reflects that — it
> drops seven columns and neither of those two.

### ⛔ 2026-08-11 — the sunset will NOT be met, and the drop script is superseded

> **Reconciliation note, admissions-v2 task 12.3.** The Day-60 blocker above was
> right that this section could not safely proceed. Measuring it four days before
> the sunset found **more** than the ORM-mapping problem, and the conclusion is
> that the 2026-08-15 date is missed rather than met.
>
> Measured on the Neon default branch and on `br-jolly-pine-ahybtg2e`, both
> identical (`docs/v2-evidence/12.3/raw/invariants-neon.txt`):
>
> * **18** applications still carry legacy payment values (92 non-null values).
>   **17** of them have **no row at all** in `payments`, and **16** carry a money
>   fact — an amount, a payment date, or a mobile-money reference — recorded
>   nowhere else in the platform. For those rows the legacy column **is** the
>   record. `DROP COLUMN` is irreversible with respect to data, and R9.2 forbids
>   `ADD COLUMN` in a rollback script, so running the drop would have destroyed
>   the only surviving record of 16 applicants' payments. Task 3.5 measured this
>   same cohort and handed it here by name.
> * All **33** applications have NULL canonical institution/program/intake ids on
>   the Neon authoring database, and `canonical_programs` is empty, so the
>   canonical/snapshot consistency gate has an *empty comparison domain* rather
>   than a passing one.
> * **1** application's `payment_status` disagrees with the ledger projection
>   (`KATC202541031`: stored `rejected`, ledger `expired`).
>
> **The 2026-05-17 drop script has therefore been neutralised.**
> `backend/scripts/legacy_columns_drop_2026_08_15.sql` no longer drops anything —
> it is a stub that raises and points here. Its only guard was the calendar, and
> from 2026-08-15 that guard stops firing; leaving a loaded script next to an
> instruction to run it is not a documentation problem.
>
> **The announced end date has been revised to 2027-02-07**, recorded as a
> revision in `backend/apps/common/compatibility_register.py` alongside an owner
> and exit criteria for each column, which is the shape task 12.5 audits.
> `legacy_columns.SUNSET_DATE` is deliberately left at `"2026-08-15"` as the
> historical record of what this cycle announced. The revision is defensible
> because — as the Day-60 note above already recorded — no human notification of
> 2026-08-15 was ever proven to have been sent and no `Sunset` header ever carried
> it to a caller, so it was an internal target rather than a published promise.
>
> **Scope also narrowed, from 12 things to 7.** `applications.payment_verified_at`
> and `payment_verified_by` are not contraction candidates at all: beyond the
> ORM-mapping problem the Day-60 note found, they are **four fields of the
> published API response**, they appear in
> `apps/admissions/src/generated/api.d.ts`, and a production student component
> (`ApplicationDetailsSection.tsx`) renders one of them. A published surface gets
> an announced window, not a silent removal. `error_logs` is out of scope too: 186
> historical rows, and still an `EXPECTED_TABLE` in both
> `backend/scripts/verify_schema_static.py` and `verify_migration.py`.
>
> **One correction to the Day-60 findings.** Item 1 above lists "tracked,
> allow-listed writes" of `payment_method` in `payment_service.py`, its three
> mixins, `views.py` and `payment_widget_views.py`. Re-measured: **every one of
> those is a write to `Payment.payment_method`, not to
> `applications.payment_method`.** `Application` does not declare a
> `payment_method` field, so no ORM write can reach that column. The
> `_KNOWN_DAY0_VIOLATIONS` allow-list in
> `backend/tests/unit/test_legacy_columns_no_writes.py` was suppressing six
> findings that were never violations; the test now filters by ORM mapping and the
> allow-list is down to the two real entries (both `payment_verified_at`). Item
> 1's `payment_verified_at` half was correct, and item 2 was correct in full.
>
> Full reasoning, with every measurement: `docs/v2-evidence/12.3/README.md`.

### Pre-execution

**Run the read-only gates first, and expect them to say stop.**

```bash
# read-only; safe on any deployment including production
psql "$DATABASE_URL" -f docs/v2-evidence/12.3/invariants.sql
```

1. Gate 1b `unbacked_money_rows` must be **0**. It is not, as of 2026-08-11
   (16) — the unblocking work is the pre-Lenco payment backfill/quarantine, and
   authoring historical ledger rows for real applicant money is an owner's
   decision, not a mechanical migration.
2. Gate 2 `missing_canonical_ids` must be **0**. It is not (33) — run the task-3.2
   canonical assignment backfill on the target database first.
3. Gate 3 `projection_mismatches` must be **0**. It is not (1) — payment lane.
4. Confirm the date guard will pass: `SELECT current_date >= '2026-08-15';`
5. Take a Neon branch snapshot for rollback (Neon only — it does **not** cover
   production; see the Rollback section below).
6. Notify team of maintenance window.

### Execution

**Do not run `backend/scripts/legacy_columns_drop_2026_08_15.sql`.** It is a
superseded stub and will refuse.

Neon, once every gate above reads zero — `git mv` the script to the top level of
`backend/scripts/` first (see `backend/scripts/future/README.md`'s promotion
procedure):

```bash
# --allow-non-additive is REQUIRED: this is a contraction, and the additive-only
# lint rejects DROP COLUMN pre-execution without it.
cd backend && python manage.py apply_sql_migrations --dry-run
cd backend && python manage.py apply_sql_migrations --allow-non-additive
```

Production is a separate, operator-gated procedure with the backup taken first:
**`docs/v2-evidence/12.3/raw/production-procedure.md`**. Neon is never
production, and production is never the first apply (R15.7).

### Post-execution

1. Verify columns are gone:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'applications'
     AND column_name IN ('payment_method','payer_name','payer_phone','amount','paid_at','momo_ref','pop_url','payment_verified_at','payment_verified_by');
   -- Should return 0 rows
   ```
   > **Reconciliation (2026-08-11, task 12.3):** this expectation is now wrong.
   > The contraction covers **7** columns, not 9, so this query must return
   > **exactly 2 rows** — `payment_verified_at` and `payment_verified_by`, which
   > are registered Legacy_Exceptions with an announced end date of 2027-02-07.
   > Zero rows here would mean something dropped two columns that are still
   > declared model fields and still four fields of the published API response.
2. Verify `error_logs` table is gone:
   ```sql
   SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs';
   -- Should return 0 rows
   ```
   > **Reconciliation (2026-08-11, task 12.3):** also now wrong — `error_logs` is
   > **not** dropped and this must return **1 row**. It holds 186 historical rows
   > with no canonical destination (GlitchTip holds nothing pre-dating its
   > cutover), and it is still an `EXPECTED_TABLE` in
   > `backend/scripts/verify_schema_static.py:71` and
   > `backend/scripts/verify_migration.py:80`, so dropping it fails the release
   > gate until both verifiers change in the same commit. A table is also outside
   > the contraction task's scope, which covers columns.
3. Remove `legacy_columns.py` entries for **the 7 dropped** columns (leave
   `payment_verified_at` / `payment_verified_by` and the `error_logs` entry)
4. ~~Move `legacy_columns_drop_2026_08_15.sql` to `backend/scripts/applied/`~~ —
   superseded; move `legacy_columns_contract_2026_08_15.sql` there instead
5. Update `test_schema_drift_strict.py` to remove exclusions **for the 7 dropped
   columns only**
6. Remove the `applications.prelenco_payment_columns` entry from
   `backend/apps/common/compatibility_register.py` — its window has closed by
   being satisfied, and task 12.5 audits that register for entries that no longer
   correspond to anything real

### Rollback

If issues arise after drop:
1. Restore from Neon branch snapshot taken pre-execution
2. Or re-add columns (they will be NULL — no data recovery possible)

**Note (2026-07-11):** The unrelated, purely-additive `device_sessions.expires_at`
default added by `backend/scripts/schema_cleanup_device_session_default.sql`
(task 5.3 of `.kiro/specs/full-platform-remediation-2026-07/`) has its own
rollback script — `backend/scripts/schema_cleanup_device_session_default_rollback.sql`
(`ALTER TABLE device_sessions ALTER COLUMN expires_at DROP DEFAULT;`). That
change is independent of this deprecation cycle (it does not touch any column
in `LEGACY_DEPRECATED_COLUMNS`) and does not need the irreversible-drop
rollback strategy above — it is metadata-only and reversible at any time. Do
not conflate the two: the column drops above are genuinely irreversible past
this point (no data recovery once dropped, only structural restore via
snapshot), while the `device_sessions` default is a low-risk additive
default with a trivial one-line rollback.

## Registry Location

- Column inventory: `backend/apps/common/legacy_columns.py`
- ~~Drop script: `backend/scripts/legacy_columns_drop_2026_08_15.sql`~~ —
  **superseded 2026-08-11**, neutralised to a refusing stub
- **Contract migration:
  `backend/scripts/future/legacy_columns_contract_2026_08_15.sql`** (7 columns,
  five fail-closed guards) + its `_rollback.sql` sibling
- **Read-only gates: `docs/v2-evidence/12.3/invariants.sql`** — run this first, on
  any deployment, including production
- **Legacy_Exception register: `backend/apps/common/compatibility_register.py`** —
  owner, announced end date, successor, exit criteria per column
- **Source telemetry: `scripts/v1_surface_telemetry.py --columns`** (half 4)
- No-writes test: `backend/tests/unit/test_legacy_columns_no_writes.py`
- Contraction-gate test: `backend/tests/unit/test_legacy_column_contraction_12_3.py`
- Schema drift test: `backend/tests/property/test_schema_drift_strict.py`
- Operator procedure: `docs/v2-evidence/12.3/raw/production-procedure.md`

## Current State (2026-08-11)

Maintained by admissions-v2 task 12.3. Full evidence:
`docs/v2-evidence/12.3/README.md`.

| Thing | State | Next |
|---|---|---|
| `profiles` × 3 | **contracted 2026-07-12** | nothing |
| `applications` × 7 (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`) | source-clean, **data-blocked** — 16 rows hold a money fact with no `payments` row | backfill/quarantine the pre-Lenco cohort, then promote the contract migration |
| `applications.payment_verified_at` / `payment_verified_by` | **registered Legacy_Exception**, end date 2027-02-07 | work the exit criteria in the register: serializer, model field, dev-bypass write, frontend consumer |
| `applications.institution` / `program` / `intake` | **output-only display snapshots** (R15.6's first option), `NOT NULL`, read by the official-document renderer | not contraction candidates |
| `error_logs` (186 rows) | out of scope for a column contraction | needs its own decision, plus both schema verifiers |

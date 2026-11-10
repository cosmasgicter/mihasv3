# Task 3.5 — Reconcile canonical payments and document versions (evidence index)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.5**
**Requirements:** R11.7–R11.8, R15.5–R15.6, R15.9
**Findings:** DATA-11 (payment truth split / nullable `Payment.application`),
STU-19 (no immutable document versions / one-current enforcement)
**Required evidence:** zero-orphan/mismatch/duplicate queries + migration rollback rehearsal
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
The task-3.5 artifacts (6 SQL scripts + rollbacks, `documents/models.py` edits, the
test, this evidence folder) are **untracked/unstaged working-tree changes on top
of** that commit, pending commit. See [`raw/commit.txt`](raw/commit.txt).

This task makes `Payment.application` mandatory for canonical rows and adds
immutable document version/provenance fields with a one-current partial unique
constraint — following expand → backfill → verify → switch (design §15.2),
Neon-branch-first. **No deprecated application payment column is dropped or
rewritten** (they stay as read-only snapshots through the observation window;
contraction is task 12.3, gated on the 18-row payment-projection mismatch reaching
zero). **No destructive SQL** was run: orphans are quarantined in place, never
deleted; document duplicates become preserved superseded versions.

## What shipped

### Payments — mandatory application relationship (R15.9, DATA-11)
- `payments.application_quarantined` flag + `payment_orphan_exceptions` ledger
  (mirrors task 3.2's quarantine pattern) so a legacy orphan is **preserved +
  flagged**, never deleted.
- `CHECK (application_id IS NOT NULL OR application_quarantined)` added `NOT VALID`
  in EXPAND, `VALIDATE`d in the switch phase (fails closed on an un-quarantined
  orphan — R15.3).
- FK `payments_application_id_fkey` reconciled `ON DELETE SET NULL -> CASCADE` to
  match the Django model (`on_delete=CASCADE`) + Django's runtime cascade, closing
  the raw-SQL orphan vector.
- `documents/models.py` `Payment.application` comment corrected;
  `application_quarantined` field mapped.

### Documents — immutable versions + one current (R11.7–R11.8, STU-19)
- Added `version`, `is_current`, `supersedes_id`, `superseded_at`, `content_hash`,
  `uploaded_by`, `provenance` (mapped on the `ApplicationDocument` model too).
- Backfill assigns deterministic versions per `(application, document_type)`
  (newest = current, older = **preserved** superseded history + supersedes chain).
- `uq_application_documents_one_current` partial unique index enforces exactly one
  current version per `(application, document_type)`.
- `chk_application_documents_version_positive` + provenance FKs, `NOT VALID` →
  validated.

## Scripts (backend/scripts/, additive + idempotent; `*_rollback.sql` operator-only)

| Forward | Rollback |
|---|---|
| `2026_07_19_01_payments_documents_expand.sql` | `…_expand_rollback.sql` |
| `2026_07_19_02_payments_documents_backfill.sql` | `…_backfill_rollback.sql` |
| `2026_07_19_03_payments_documents_validate.sql` | `…_validate_rollback.sql` |

## Required evidence

- **Zero-orphan / duplicate queries** — Stage 1 Block A on the Neon default
  branch: **0** null-application orphans, **0** dangling FK, **0** reference
  duplicates ([`stage1-preflight.md`](stage1-preflight.md),
  [`raw/preflight-neon-default.txt`](raw/preflight-neon-default.txt)); document
  duplicates 10 groups / 25 rows → after backfill **0** groups with multiple
  current ([`raw/rehearsal-neon-branch.txt`](raw/rehearsal-neon-branch.txt)).
- **Mismatch queries** — Stage 1 Block C: **18** reverse-orphan mismatches
  (baseline that blocks column contraction; owned by task 12.3), **0** verified-
  payment-vs-status contradictions.
- **Migration rollback rehearsal** — Stage 2 on reused branch
  `br-jolly-pine-ahybtg2e`: expand → backfill → validate advanced the real data
  (66 current + 25 superseded, CHECK validated, FK → CASCADE), then `03→02→01`
  rollbacks returned the branch to a state identical to BEFORE (21 payments /
  91 docs / 10 dup groups / FK `SET NULL`). See
  [`stage2-neon-branch.md`](stage2-neon-branch.md).
- **Regression suite** — `backend/tests/unit/test_payment_document_reconciliation_3_5.py`:
  **17 passed** on local Postgres ([`raw/pytest-pg-task-3.5.txt`](raw/pytest-pg-task-3.5.txt)),
  incl. the failing-first manifest gate (payments CHECK unvalidated → validated),
  one-current enforcement, orphan-quarantine-preserves, fail-closed-on-unquarantined,
  FK reconciliation, idempotence, and deprecated-value preservation.

## Verification commands

```
# task-3.5 suite (local Postgres via socket DSN, CI-parity)
cd backend && DATABASE_URL="postgresql:///beanola_v2_scratch" \
  .venv/bin/python -m pytest tests/unit/test_payment_document_reconciliation_3_5.py -q
# => 17 passed
```

The 1 pre-existing failure + 16 pre-existing errors seen in the wider
`-k "payment or document or manifest"` run originate in unrelated in-flight V2 work
(a broken `AccessScopeService` autouse fixture + an authority-policy test) and
reproduce with this task's `documents/models.py` change stashed — i.e. **not** a
task-3.5 regression.

## Files

| File | What it records |
|---|---|
| `inventory.sql` | READ-ONLY preflight Blocks A–F (orphan/dup/mismatch/deprecated-column/post-apply gates). Lives under `docs/`, never swept. |
| `stage1-preflight.md` | Neon default-branch read-only inventory + task-plan derivation. |
| `stage2-neon-branch.md` | Reused-branch expand/backfill/validate transition + rollback round-trip + lock notes + operator-gated production path. |
| `raw/preflight-neon-default.txt` | Raw Stage 1 SELECT results. |
| `raw/rehearsal-neon-branch.txt` | Raw Stage 2 phase-by-phase state snapshots (BEFORE → EXPAND → BACKFILL → VALIDATE → ROLLBACK). |
| `raw/pytest-pg-task-3.5.txt` | Raw 17-passed Postgres test run. |
| `raw/commit.txt` | Candidate commit SHA + branch. |

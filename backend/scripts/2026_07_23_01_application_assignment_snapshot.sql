-- Admissions V2 — task 5.2 (canonical assignment + requirement resolution),
-- application snapshot columns. EXPAND phase (additive, idempotent).
--
-- Spec:        .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R7.1-R7.3, R7.5, R10.5-R10.6, R11.6
-- Findings:    DATA-01, DATA-04, STU-01, STU-13
-- Design:      design.md §7.2 (Application Assignment — the application stores
--              assignment_version + display snapshots and the server derives +
--              snapshots every field under one configuration version), §8.3
--              (Readiness — versioned required-document states), §9.3 (Required
--              Documents snapshotted to the application assignment).
--
-- What this adds
-- --------------
-- Four additive columns on ``applications`` so a canonical StartDraft-style
-- assignment can snapshot the resolved offering configuration onto the
-- application row instead of re-deriving it (and failing open) at read/submit
-- time:
--
--   * configuration_version — the deterministic content version of the resolved
--     offering configuration captured at assignment time (R7.2 "one
--     transactionally consistent configuration version"). Readiness (task 6.5)
--     recomputes and compares this to detect drift.
--   * requirements_snapshot  — the versioned dynamic Required_Documents resolved
--     for the assigned offering/canonical/default scope (R11.6, design §9.3).
--   * eligibility_snapshot   — the eligibility rules resolved for the assigned
--     offering (design §7.2 "eligibility").
--   * assignment_version     — optimistic-concurrency version for the assignment
--     (design §7.2). Starts at 1 on draft creation; the reroute command
--     (task 6.4) bumps it.
--
-- Online-safety: ADD COLUMN with a constant default (or NULL) is metadata-only
-- on PG 11+. Every statement is idempotent (ADD COLUMN IF NOT EXISTS) so a
-- re-run after a tracking-table wipe converges. No data mutation, no backfill:
-- legacy rows keep NULL snapshots + assignment_version = 1 and continue to work
-- through the additive read-fallback path in the application services.

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS configuration_version varchar(64) NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS requirements_snapshot jsonb NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS assignment_version integer NOT NULL DEFAULT 1;

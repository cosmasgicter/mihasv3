# Design: Production Launch Finalization

## Overview

This spec closes the gap between "major implementation complete" and
`production-launch-ready` as reported by `scripts/launch-verification/rollup.py`.
Ground truth as of this design (verified, not assumed):

- 6 of 11 gates already `passed`: Bundle_Guard, Suite_Execution, Brand_Scan,
  Contract_Sync, Operational_Readiness, Scope.
- 5 gates `unknown`/missing evidence: Migration, Smoke, Performance, Mobile_UI,
  Onboarding.
- Production (`apply.beanola.com`, `api.beanola.com`) is live and reachable
  (verified: both return 200 on health/landing).
- Every gate harness already exists under `scripts/launch-verification/` and is
  runnable (`--help` confirmed for `run-smoke-gate.py`,
  `run-onboarding-smoke.py`, `record-migration-evidence.py`).

## Hard Constraint: No Fabricated Evidence

Every harness for the 5 missing gates is explicitly marked in its own `--help`
text as **deployed-target, operator-run, NOT auto-run in CI**. This design does
not fabricate `"status":"passed"` for any gate. Each gate below is one of:

- **A. Runnable now, read-only, against production** — I execute it directly.
- **B. Requires operator credentials/writes I do not hold** (super-admin token,
  staging cookies, production DB migration apply, disposable Postgres restore
  target) — I prepare the exact command and hand it to the operator; the gate
  stays `unknown` until they run it and the artifact is committed.

| Gate | Class | Reason |
|---|---|---|
| Smoke (Gate 2) | A | Read-only HTTP probes against live prod; `run-smoke-gate.py` has a `--dry-run`/unauth-probe path needing no secrets for the base checks. |
| Performance (Gate 3) | A (partial) | Lighthouse + API timing sampling are read-only against live prod. Cache-observation sub-checks need staging cache-flag rollout (operator) — recorded as not-yet-observed rather than faked. |
| Mobile UI (Gate 4) | A | Headless-chrome viewport checks against live prod are read-only. |
| Migration (Gate 1) | B | `record-migration-evidence.py` explicitly ingests **operator-captured** backup/dry-run/apply output. I do not have write access to run `apply_sql_migrations` against prod, nor a fresh backup timestamp to report honestly. |
| Onboarding (Gate 10) | B | Requires a super-admin token/cookie against a target where creating a real tenant is acceptable (staging, not prod). I hold no such credential. |

## Architecture Of The Work

Five parallel-safe tracks, matching the runbook's PR split and this repo's
existing bucket convention (Requirement 1.4):

1. **Track A — Smoke evidence (Gate 2).** Run `run-smoke-gate.py` against
   `https://apply.beanola.com` / `https://api.beanola.com` with no
   `--invoke-shell-smoke` (that flag runs local shell probes, not needed for a
   live-target read-only pass). Commit the real artifact.
2. **Track B — Performance evidence (Gate 3).** Run `run-lighthouse.mjs`
   against the canonical public/auth/student/admin routes on production, and
   `sample-api-timings.py` against the read-only API endpoints. Feed both into
   `performance_eval.py`. Cache-observation and cursor-polling sub-claims are
   recorded honestly (`observed: true` only if I can prove it from code +
   response headers, not staging telemetry I can't see).
3. **Track C — Mobile UI evidence (Gate 4).** Headless-chrome screenshots at
   the five mandated viewports across the six mandated route classes, checked
   programmatically for horizontal overflow and touch-target size (≥44×44px).
4. **Track D — Frontend/backend residual correctness (Requirements 2, 3, 7).**
   Re-verify (not re-implement, most already shipped per prior sessions) the
   notification cursor-polling contract, brand scan, capability-only
   authority, and performance-cache code paths are real in the current tree —
   close any residual gaps found, with tests.
5. **Track E — Operator handoff.** Consolidate exact runnable commands for
   Migration (Gate 1) and Onboarding (Gate 10) into the existing
   `docs/runbooks/operator-gated-launch-actions.md`, plus the backup/restore
   drill and Postgres-target test run from Phase 3/6 of the runbook.

Tracks A–D are independent file/output sets (evidence JSON under
`docs/launch-evidence/0{2,3,4}-*/`, plus scoped source diffs in Track D) so they
run as parallel subagents safely. Track E is a documentation-only consolidation
I do directly after A–D report back, since it depends on knowing exactly what
Migration/Onboarding still need.

## Verification Gates

- Every new/changed evidence artifact must parse as JSON, be non-empty, and
  carry a `status` field of `passed`/`failed`/`unknown` plus a timestamp
  (Requirement 5.9) — never hand-authored `passed` without a backing real run.
- After Tracks A–D land, re-run `python3 scripts/launch-verification/rollup.py`
  and report the real verdict — it will likely remain
  `not-production-launch-ready` because Migration and Onboarding require the
  operator. That is the honest, correct outcome per Requirement 5.8.
- Track D changes must pass the existing targeted test commands listed in the
  runbook Phase 2/3/8 sections, not a newly invented test list.

## Rollback

All evidence artifacts are additive JSON files under `docs/launch-evidence/`;
removing them reverts to the current `unknown` state. Track D code changes
follow the same commit-before-push discipline as prior sessions (targeted
verify → grep for behavior-asserting tests → commit → CI → deploy).

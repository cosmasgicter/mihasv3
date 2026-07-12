# Tasks: Production Launch Finalization

- [x] 1. Track A — Generate real Smoke evidence (Gate 2) against production
  - Run `scripts/launch-verification/run-smoke-gate.py` against
    `https://apply.beanola.com` / `https://api.beanola.com` (read-only probes:
    health, landing, session, CSRF-rejection, admin surfaces exist/redirect).
  - Write `docs/launch-evidence/02-smoke/smoke-evidence.json` from the real run.
  - Note any check that cannot be safely exercised read-only (state-changing
    submit/pay/document-generation) as `unknown`/skipped with reason, not faked.
  - _Requirements: 5.2, 5.9, 9.10_

- [x] 2. Track B — Generate real Performance evidence (Gate 3) against production
  - Run `scripts/launch-verification/run-lighthouse.mjs` against the canonical
    public/auth/student-dashboard/admin-dashboard routes on production.
  - Run `scripts/launch-verification/sample-api-timings.py` against read-only
    endpoints (`/health/*`, `/api/v1/catalog/context/`, etc.).
  - Feed results through `performance_eval.py`; write
    `docs/launch-evidence/03-performance/performance-evidence.json`.
  - Record cache/cursor-polling sub-claims only where provable from code +
    response headers; mark unobservable staging-only claims honestly.
  - _Requirements: 5.3, 5.9, 7.9_

- [x] 3. Track C — Generate real Mobile UI evidence (Gate 4) against production
  - Headless-chrome capture at 360x800, 390x844, 768x1024, 1024x768, 1440x900
    across public, auth, student, admin-login-wall, and application-wizard
    entry routes reachable without auth (plus note which need staff creds).
  - Programmatically check: no horizontal overflow, touch targets ≥44x44px.
  - Write `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json`.
  - _Requirements: 5.4, 5.9_

- [x] 4. Track D — Re-verify residual frontend/backend correctness
  - Confirm notification polling uses Cursor_Polling (`?after=<id>`) after
    initial load, 60s interval, tab-visibility pause; page-number mode only on
    the full communications page. Fix + test if any gap found.
  - Confirm capability caches (60s/45s/450s TTLs) and invalidation-on-write are
    real in code, not just documented. Fix + test if any gap found.
  - Re-run the brand scan and confirm zero unauthorized MIHAS/KATC hits in
    active frontend runtime code.
  - Run the existing targeted backend + frontend test commands from the
    runbook (not a new invented list).
  - _Requirements: 2.15, 2.16, 3.1-3.5, 7.1-7.4, Requirement 9_

- [x] 5. Track E — Operator handoff for Migration (Gate 1) and Onboarding (Gate 10)
  - Extend `docs/runbooks/operator-gated-launch-actions.md` with the exact
    `record-migration-evidence.py --inputs ...` invocation and what
    operator-captured facts it needs (backup timestamp, dry-run output,
    staging apply output, migration_history rows, rollback posture).
  - Extend it with the exact `run-onboarding-smoke.py --base-url
    https://staging.beanola.com --super-admin-token ...` invocation and what
    credential the operator must supply.
  - Do not run either — they require credentials/writes I do not hold.
  - _Requirements: 4.9, 4.14, 5.1, 5.5_

- [x] 6. Re-run the rollup and report the honest verdict
  - Run `python3 scripts/launch-verification/rollup.py`.
  - Report the real gate table — expect `not-production-launch-ready` to
    persist until the operator runs Track E, and say so plainly.
  - _Requirements: 5.6, 5.7, 5.8, 8.5_

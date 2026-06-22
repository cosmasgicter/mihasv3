# Beanola Platform — Codebase Postmortem

**Date:** 2026-06-21  
**Analyst:** Codebase Health & Audit Synthesis  
**Scope:** Full monorepo (`/home/cosmas/Downloads/mihasv3`)  
**Status:** Pre-launch hardening / production-readiness phase  

---

## 1. Executive Summary

The Beanola admissions platform is a mature, multi-tenant monorepo composed of a Vercel-hosted React admissions SPA, a self-hosted Django/Celery/Postgres backend, and nascent `jobs-ops`, `student-portal`, and `website` apps. Recent work has focused on production-readiness hardening, tenant-scoped admin access, and Beanola re-branding.

**Bottom line:** The codebase is **mostly launch-ready** on the security, operations, and performance surfaces, but it is currently carrying **uncommitted production work**, **regressing backend tests**, and **schema drift** that would fail CI if merged as-is. Three backend unit tests are failing, two `jobs-ops` router tests are stale, and the working tree is dirty with 226 changed files.

**Most critical immediate actions:**
1. Fix duplicate `payment_set` prefetch in `backend/apps/applications/admin_review_views.py`.
2. Resolve or baseline the 3 OpenAPI breaking changes and 6 linter regressions.
3. Commit or stash the 226 dirty files before any further CI/deploy.
4. Update `pytest` to `>=9.0.3` (CVE-2025-71176).
5. Reconcile `jobs-ops` auth design decision with its failing router tests.

---

## 2. Incident / State Definition

This postmortem treats the **current repository state** as the incident: a production-bound codebase with active, uncommitted changes and known test/regression failures that would block a clean launch if deployed.

### Key Signals

| Signal | Value |
|--------|-------|
| Branch | `main` |
| Dirty files | **226** (139 modified + ~90 untracked) |
| Recent theme | Beanola production-readiness; tenant-scoped admin; preloader/perf |
| Admissions unit tests | 3,282 pass, 1 skip |
| Backend unit tests | **3 failing** |
| jobs-ops unit tests | **2 failing** |
| OpenAPI quality | 3 breaking changes, 6 new linter issues, 1 linter error |
| Security scan | pytest CVE-2025-71176; bandit high-severity `hashlib.md5` flags |
| Property tests | 1,135 errors when run full-suite on SQLite (state-leakage suspected) |

---

## 3. What Happened (Timeline)

| Date | Event |
|------|-------|
| 2026-04-23/24 | Exhaustive security/audit passes identified 18 bugs and 9 zero-day-class risks. |
| 2026-04-24 | `RE-AUDIT-REPORT` and `CONTINUATION-LEDGER` produced; most critical items remediated. |
| 2026-05 | UX/admin audits flagged dead code, mobile friction, missing ARIA/focus management. |
| 2026-05-17 | Dead-code removal sprint recommended but deferred (net-additive truth program). |
| 2026-06 (recent) | Beanola re-branding, tenant-scoped admin views, preloader/perf work landed in working tree. |
| 2026-06-21 | Postmortem snapshot: 226 dirty files, backend test regressions, schema drift, pytest CVE. |

---

## 4. Detailed Findings

### 4.1 Backend Regressions

#### Failing Test: `tests/unit/test_cross_tenant_isolation.py` (2 failures)
**Symptom:** HTTP 500 on `/api/v1/applications/` for scoped admin users.  
**Root cause:** `admin_review_views.py` calls `.prefetch_related('payment_set')` and then `_with_payment_summary(queryset)`, which adds a second `Prefetch('payment_set', …)`. Django rejects duplicate prefetches with different querysets.  
**Fix:** Remove the bare `'payment_set'` from the prefetch list; let `_with_payment_summary()` own the prefetch.

#### Failing Test: `tests/unit/test_api_quality_script.py`
**Symptom:** API quality gate fails against baseline.  
**Root cause:** Schema evolved without updating baseline.

| Breaking Change | Detail |
|-----------------|--------|
| `Program.institution_id` | Became required |
| `CanonicalProgram.available_offerings` | Changed `string` → `array` |
| `POST /admin/institutions/{id}/domains/` | Lost its 200 response |

**Additional regressions:** 6 new linter issues (963 vs 957 baseline); `GET /documents/{document_id}/download/` missing success response.  
**Fix:** Either the schema changes are intentional → update `openapi.v1.baseline.yaml` and `lint_baseline.json`; or revert the changes.

### 4.2 Frontend / jobs-ops

#### Failing Test: `tests/unit/router.test.ts` (2 failures)
**Symptom:** Expects unauthenticated users to redirect to `/signin`.  
**Root cause:** `apps/jobs-ops/src/auth/ProtectedRoute.tsx` is intentionally a no-op (public scaffold). The tests predate the design decision.  
**Fix:** Align tests with the public-scaffold decision, or restore auth gating if the decision has changed.

### 4.3 Security Findings

| Finding | Severity | Detail |
|---------|----------|--------|
| pytest 8.4.2 CVE-2025-71176 | Medium | Fixed in `>=9.0.3`. |
| `hashlib.md5` in analytics views | High (bandit) | Used for cache keys, not cryptographic, but flagged. Prefer `hashlib.sha256` or keyed hashing. |
| Hardcoded dev secret key | Low / dev-only | In `config/settings/base.py`; ensure production override. |
| Hardcoded `/tmp/celerybeat-schedule` | Low | Operational portability issue. |

### 4.4 Property-Test Instability

- Full `tests/property/` suite produces 1,135 errors on SQLite.
- Individual tests and small subsets pass.
- Likely cause: test-state leakage / SQLite concurrency. CI uses Postgres with 8 shards, so this is primarily a local-dev friction issue, not a CI blocker.

### 4.5 Code-Quality Maturity Gaps

| Dimension | State | Risk |
|-----------|-------|------|
| Backend type annotations | 22% return-type coverage | High — no static checker catches contract drift. |
| Python formatter/linter | Ruff configured but **not enforced in CI** | Medium — style drift, missed lints. |
| Prettier / Black / isort | None configured | Medium — inconsistent formatting. |
| Pre-commit hooks | None | Medium — local guardrails absent. |
| Test coverage thresholds | None enforced | Medium — regressions can slip in. |
| Oversized files | Multiple files >1,000 LOC | Medium — review burden, bug density. |

### 4.6 Monorepo / Operational Debt

- `shared/` package is essentially empty — cross-app reuse is not realized.
- `apps/website/` and `apps/student-portal/` are placeholders but still mention "MIHAS" in READMEs, contradicting Beanola branding.
- `open-design/` is a nested git repo (~4.6 GB / 1,464 files) inside the monorepo tree — verify it is intentional and not build output.
- `.env*` files (including production-looking ones) are present in the working tree despite being gitignored — rotate if they contain real credentials.

---

## 5. Root Cause Analysis

### 5.1 Why are tests failing now?

1. **Schema/feature evolution outpaced baseline updates.** The OpenAPI and quality-script baselines are treated as gates, but no process requires updating them when intentional changes land.
2. **Refactor side-effects.** The `_with_payment_summary()` helper was added/updated without removing the older bare `payment_set` prefetch, causing a runtime crash.
3. **Scaffold code without aligned tests.** `jobs-ops` is a public scaffold; its tests still assume authenticated routing.

### 5.2 Why did these slip through?

1. **No pre-commit hooks.** Developers can commit/push without running tests, lint, or type checks locally.
2. **Backend lint/format not enforced in CI.** Ruff exists but CI allows it to pass silently or is not running it.
3. **Bandit runs with `continue-on-error: true`.** Security findings are reported but do not block merge.
4. **Large dirty working tree.** 226 uncommitted files make it hard to distinguish intentional changes from accidents.
5. **No coverage/type-coverage thresholds.** Test volume is high, but gates do not prevent regressions in uncovered areas.

---

## 6. Impact Assessment

| Area | Impact | Likelihood if Deployed |
|------|--------|------------------------|
| Admin application list | HTTP 500 for scoped admins | High |
| API consumers | Breaking contract changes | Medium |
| CI/CD | Build/test failure | High |
| Security | CVE exposure, bandit flags | Medium |
| Developer velocity | Local property tests unreliable | High |
| Brand consistency | MIHAS leakage in placeholders | Low |

---

## 7. What Went Well

- **Strong audit discipline:** 50+ audit reports across security, UX, API contract, payments, ops, and performance.
- **Security hardening succeeded:** R10 security/privacy review cleared launch with zero high/medium findings.
- **Frontend admissions quality is high:** Strict TS, ESLint with `--max-warnings 0`, ~3,282 passing unit tests, low `any` usage.
- **CI is comprehensive:** type-check, lint, build, bundle guard, contract sync, drift guards, brand scan, scope gate.
- **Operational posture is strong:** backup/rollback, monitoring, rate-limiting, and deployment runbooks are documented and verified.
- **Documentation is rich:** canonical truth map, ADRs, runbooks, and launch-evidence docs exist.

---

## 8. What Did Not Go Well

- **Dirty main branch:** 226 uncommitted files indicate WIP is mixed with stable code.
- **Backend quality gates are weaker than frontend:** no enforced formatter/linter/static-type checker.
- **Baseline drift:** OpenAPI and API-quality baselines are stale relative to code.
- **jobs-ops immaturity:** scaffold app with stale tests and almost no coverage.
- **Local dev friction:** SQLite property-test suite is unreliable; devs may skip running it.
- **Credential hygiene:** local `.env*` files with live-looking values remain on disk.

---

## 9. Corrective Actions

### Immediate (before next deploy)

| # | Action | Owner | Verification |
|---|--------|-------|--------------|
| 1 | Fix duplicate `payment_set` prefetch in `admin_review_views.py` | Backend | `test_cross_tenant_isolation.py` passes |
| 2 | Decide intent of OpenAPI changes; update baselines or revert code | Backend/API | `test_api_quality_script.py` passes |
| 3 | Update `pytest` to `>=9.0.3` | Backend/Deps | `pip-audit` no longer flags CVE-2025-71176 |
| 4 | Commit, review, and merge the 226 dirty files (or split into focused PRs) | Team | `git status` clean |
| 5 | Align `jobs-ops` router tests with auth design | Frontend | `tests/unit/router.test.ts` passes |

### Short-term (next 1–2 sprints)

| # | Action | Owner | Verification |
|---|--------|-------|--------------|
| 6 | Enforce `ruff check` and `ruff format` in CI | Backend | CI fails on lint/format errors |
| 7 | Add `mypy` or `pyright` incrementally to backend | Backend | Type-coverage improves; no new un-annotated public APIs |
| 8 | Add pre-commit hooks (ruff, eslint, type-check, forbid secrets) | Platform | Local guards active |
| 9 | Fix or remove `hashlib.md5` uses; replace with `sha256` | Backend/Security | bandit clean |
| 10 | Move celerybeat schedule path to config | Backend/Ops | No hardcoded `/tmp` paths |
| 11 | Add test-coverage thresholds (start low, ratchet up) | Platform | CI enforces coverage |
| 12 | Rebrand placeholder app READMEs to Beanola | Frontend/Docs | No tenant-name leakage |

### Medium-term

| # | Action | Owner | Verification |
|---|--------|-------|--------------|
| 13 | Decide fate of `apps/website/` and `apps/student-portal/` (build, archive, or document as future) | Product | Clear status in README |
| 14 | Audit and remove dead code flagged in UX audits | Frontend | Dead-code report updated |
| 15 | Break up oversized files (`useWizardController.ts`, `catalog/services.py`, etc.) | Engineering | Files <500 LOC |
| 16 | Stabilize SQLite property-test suite or document Postgres-only local testing | Backend | Local test command reliable |
| 17 | Rotate any live credentials in local `.env*` files | Security/Ops | Continuation ledger updated |

---

## 10. Lessons Learned

1. **Gates must fail the build.** Reporting-only checks (bandit `continue-on-error`, unenforced ruff, no type checker) inevitably drift.
2. **Baselines are code.** OpenAPI and lint baselines should be updated in the same PR as the schema change, with explicit review.
3. **Pre-commit hooks save CI.** Local validation prevents the costliest feedback loop.
4. **Scaffold code needs scaffold tests.** If auth is intentionally disabled in `jobs-ops`, the tests must reflect that decision.
5. **A dirty `main` is a risk.** WIP should live on branches; `main` should remain deployable.
6. **Frontend/backend parity matters.** Strong frontend gates make backend gaps more visible and should be matched.

---

## 11. Appendix: Supporting Data

### A. Repository Scale

| Component | Files | Approx. LOC |
|-----------|-------|-------------|
| `backend/` | ~707 `.py` | 165,000 |
| `apps/admissions/` | ~520 `.ts/.tsx` | 91,000 |
| `apps/jobs-ops/` | ~47 `.ts/.tsx` | 4,500 |
| `apps/website/` + `apps/student-portal/` | 4 tracked | minimal |
| `open-design/` | 1,464 files | nested git repo |

### B. Recent Commits

```
9115722f2 test: align tests with batch changes
32daa4658 perf+ux+multitenant: stop GlitchTip 429s, sleeker preloader, faster first paint, scoped admin
a67bb51fa chore: clean up root file structure
21616c0cb beanola-production-readiness: record per-school reviewers seeded
e1f6e16a2 beanola-production-readiness: finalize — seed school admins, rebrand README/steering
```

### C. Audit Inventory

- `docs/audits/`: 17 recent verification/final-domain audits (launch-cleared).
- `audit-results/`: 33 historical reports, superseded by canonical-truth work.
- Key recent verdict: **R10 security/privacy review — GO for launch** with 3 LOW residual items.

### D. Still-Open Audit Items (from earlier reports)

- `paymentRecoveryStore` not cleared on draft deletion (P0).
- Auto-set enrollment deadline on approval; auto-assign waitlist position (P1).
- Route admin review / defer payment transitions through `_transition()`.
- Add `@idempotent` to `SuperAdminPaymentCorrectionView`.
- UX P0–P2 backlog: dead-code deletion, ARIA tabs, mobile field attributes, focus management.
- Lighthouse mobile and live API timings deferred to staging.

---

## 12. Conclusion

The Beanola platform has passed its major launch-readiness audits and has strong operational, security, and frontend-engineering foundations. The current blocker is **repository hygiene and backend test/schema regressions**, not architectural or security fundamentals. Fixing the five immediate actions above will return `main` to a deployable state and restore CI confidence. The medium-term quality investments (enforced Python lint/format/type checking, pre-commit hooks, coverage thresholds) will prevent recurrence.

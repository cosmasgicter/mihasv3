# Task 0.5 — Required Evidence

**Task:** Capture the immutable pre-change baseline.
**Spec:** `admissions-v2-canonical-rebuild` · **Requirements:** R1.5, R18.5 ·
**Findings:** GOV-04, GOV-05.
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`,
working tree dirty with in-flight tasks 0.1–1.5 — see manifest).
**Captured:** 2026-07-15 (UTC). Supersedes the 2026-07-13 snapshot at the same
commit; the working tree evolved as tasks 1.2–1.5 landed. See `manifest.json`
→ `capture_history`.

## What this is

An honest, immutable snapshot of the **current (pre-change)** state of the
candidate. No product source was modified to make any suite greener; failing
tests were left failing; skipped/unverified work was **not** relabeled as
complete (R1.5). Release identity — commit, product/build version, dependency
lock checksums, DB schema fingerprint, per-suite commands and raw results, the
OpenAPI artifact, bundle/design audit, accessibility smoke, browser-suite state,
known exceptions and the (N/A) rollback decision — is recorded per R18.5.

## Files

| File | Contents |
|---|---|
| `manifest.json` | Machine-readable baseline: identity, capture history, versions, lock checksums, schema fingerprint, every suite command + result counts, artifacts, known exceptions, rollback decision. |
| `baseline-findings.md` | Current failures/skips/unverified work as `BL-0.5-*` findings (feeds `findings.md`). |
| `raw/` | Raw command outputs + reproducibility helper scripts (see below). |

## Raw reports (`raw/`)

- `backend-pytest.txt`, `backend-pytest-junit.xml`, `backend-pytest-skips.txt` — backend suite (SQLite `config.settings.test`): **14 failed / 3565 passed / 138 skipped / 2 xfailed / 1 xpassed** (3720 collected). `parse_junit_failures.py` enumerates the 14 failures.
- `admissions-vitest.txt`, `admissions-vitest.json`, `admissions-vitest.exit` — **3 real failures / 3495 passed / 1 skipped** (3499 tests); 8 files failed (3 real + 5 Playwright harness collection errors). `parse_vitest.py` enumerates them.
- `admissions-typecheck.txt` (PASS), `admissions-lint.txt` (24 errors: 18 R14.3 architecture-enforcement + 6 unused-directive), `admissions-build.txt` (PASS), `admissions-check-all.txt` (PASS), `admissions-launch-bundle-guard.txt` (FAIL: framer-motion on entry).
- `jobs-ops-typecheck.txt` / `jobs-ops-lint.txt` / `jobs-ops-build.txt` — all PASS.
- `openapi-candidate.yaml` (2.0.0, 147 paths), `openapi-generation.txt` (generates without `--skip-checks`; 20 non-fatal errors from 5 V2 demo views).
- `impeccable-detect.txt` — 2 non-actionable findings (mandated Inter font).
- `schema-static-verify.txt` — static schema verifier PASS.
- `db-invariants.json` + `db_readonly_introspect.py` — READ-ONLY Neon introspection (schema fingerprint + canonical/payment invariants).
- `verify_migration-attempt.json` — live migration verifier attempt (blocked: localhost, no DB credentials).
- `inventory/` + `route-inventory-summary.json` + `route-inventory.log` — route/authority/source inventory (185 routes, zero unclassified) reproduced at this commit.
- `playwright-e2e-list.txt` — Playwright default config enumeration (138 tests / 8 files, runtime-gated per GOV-04).
- `parse_junit_failures.py`, `parse_vitest.py`, `db_readonly_introspect.py` — read-only reproducibility helpers.

## Headline baseline facts

- Product version `2.0.0` (admissions/backend); API prefix remains `/api/v1/`; a committed `/api/v2/` candidate exists (in-flight task 1.x).
- OpenAPI committed v1 baseline `1.0.0`/141 vs committed v2 candidate `2.0.0`/142 vs freshly generated `2.0.0`/147 (known drift while V2 tasks 1.x are in flight, GOV-05).
- **14 backend failures and 3 real vitest failures are all in-flight V2 work** (tasks 0.4/1.3/1.4/1.6), not shipped-product regressions; the 24 lint errors come from the new R14.3 architecture rule (task 1.5) flagging files awaiting migration.
- Neon authoring DB (read-only): schema fingerprint `c48f57d9…`; **all 33 applications have NULL canonical assignment IDs**, `canonical_program_id`/`intake_offering_id` columns absent, `canonical_programs` empty, 0 active memberships (BL-0.5-08 → DATA-01/02/07/11, STU-01). This is the Neon dev DB, **not** production.
- Browser journeys remain runtime-gated (GOV-04); the un-gated replacement is the task-0.4 harness.

## Reproduce

```bash
# identity + locks
git rev-parse HEAD
sha256sum bun.lock backend/requirements.txt apps/admissions/package.json

# backend suite (SQLite fast suite)
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 .venv/bin/python -m pytest -q -p no:cacheprovider -rs

# frontend
cd apps/admissions && bun x vitest run && bun run type-check && bun run lint ; bun run build
cd apps/jobs-ops && bun run type-check && bun run lint && bun run build

# OpenAPI
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py spectacular --file /tmp/schema.yaml

# audits + inventory + read-only DB
cd apps/admissions && (yes | impeccable detect src/) && bun run check:all ; bun scripts/launch-bundle-guard.ts
backend/.venv/bin/python scripts/inventory_admissions_v2.py --json
cd backend && .venv/bin/python scripts/verify_schema_static.py
backend/.venv/bin/python docs/v2-evidence/0.5/raw/db_readonly_introspect.py   # READ ONLY

# browser suite enumeration (runtime-gated; skip by default)
cd apps/admissions && bun x playwright test --list
```

# Continuation Ledger — 2026-04-24

This pass does two things:

1. Confirms the current inventory anchors:
   - total repository files discovered in `all-files.txt`: `7481`
   - runtime-relevant files listed in `runtime-files.txt`: `1732`
2. Records only the files directly audited and re-validated in this pass.

The remaining runtime-relevant files stay unresolved for the next passes.

## Current Pass Counts

- total files audited: `17`
- total suspicious files audited: `17`
- files improved: `2`
- files recommended for removal: `0`
- files ignored as correct: `12`
- files still unresolved: `1715`

## Per-File Classification

- `./.env.example` | `improve` | `confirmed-bug` | `VITE_API_BASE_URL` points to `***REMOVED***` while the production template uses `***REMOVED***`; this is config drift in a shared template.
- `./.env.development` | `ignore-as-correct` | `none` | Development template intentionally uses sandbox widget URL and explicit dev bypass flags with clear comments.
- `./.env.production` | `ignore-as-correct` | `none` | Production template uses placeholders for secrets and clearly separates frontend Vercel variables from backend Koyeb variables.
- `./.github/workflows/ci.yml` | `ignore-as-correct` | `none` | CI covers backend checks, contract tests, admissions build/test/lint, and jobs-ops build/type-check; no immediate drift found in the inspected workflow.
- `./.github/workflows/backend-governance.yml` | `ignore-as-correct` | `none` | Governance workflow correctly targets backend/schema/outbox checks and runs static schema verification plus focused governance tests.
- `./.gitignore` | `ignore-as-correct` | `none` | Ignores env files, stagehand script, OCR assets, and local tooling outputs as expected for this repo shape.
- `./backend/.gitignore` | `ignore-as-correct` | `none` | Correctly excludes backend env files, caches, local sqlite, coverage, and static build output.
- `./backend/Dockerfile` | `ignore-as-correct` | `none` | Current file already purges `gcc` and drops to a non-root `app` user; earlier audit findings against this file are stale.
- `./backend/docker-compose.yml` | `ignore-as-correct` | `none` | Local parity compose is coherent with Postgres, Redis, web, worker, and beat services and uses explicit env fallbacks for local runtime.
- `./backend/config/settings/base.py` | `ignore-as-correct` | `none` | Neon/Redis/Celery baseline is internally consistent in the inspected sections; no direct contract drift was confirmed from this pass.
- `./package.json` | `ignore-as-correct` | `none` | Root workspace and top-level scripts are minimal and consistent with the monorepo layout.
- `./shared/package.json` | `ignore-as-correct` | `none` | Shared package metadata is inert and does not introduce runtime drift on its own.
- `./docs/runbooks/secrets-rotation.md` | `ignore-as-correct` | `none` | Runbook is operationally useful and aligned with the currently observed secret set and smoke-check expectations.
- `./docs/schema-ownership.md` | `improve` | `confirmed-bug,suspicious-stale-path` | References `docs/migration/2026-03-07-manual-migration-order.md`, which is missing in the current tree, so the documented migration workflow is broken.
- `./audit-results/RE-AUDIT-REPORT-2026-04-24.md` | `needs-human-decision` | `suspicious-stale-path` | Historical audit artifact claims full runtime closure and should not remain an unqualified source of truth without being clearly marked historical and superseded.
- `./audit-results/backend-core-findings.md` | `needs-human-decision` | `suspicious-stale-path` | Contains findings contradicted by the current tree, including Dockerfile-root hardening that is already fixed; keep only if re-labeled as stale history.
- `./audit-results/hardening-security.md` | `needs-human-decision` | `suspicious-stale-path` | Includes at least one outdated hardening finding against the current Dockerfile and should not be relied on without a historical/stale marker.

## Local-Only Operational Risk Not Counted As Tracked Repo Findings

The following were observed locally but are not tracked repository files based on `git ls-files`:

- `./backend/.env`
- `./backend/.env.production`
- `./.env.local`
- `./.env.vercel.development`
- `./.env.vercel.preview`

These local-only files contain live-looking credentials and deployment tokens. They are not counted in the tracked repository audit totals above, but they should still be treated as urgent rotation candidates if they are in active use.

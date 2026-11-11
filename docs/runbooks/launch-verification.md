# Launch Verification: the gates that remain

Date: 2026-11-09 (platform-simplification task 11.4, decision D2)

## Purpose

CI runs a small set of blocking gates. Each one checks something a machine can
check on every change. There is no combined launch verdict: the rollup that used to
print "production-launch-ready" is gone, because its verdict covered neither document
upload nor the student journey, and a verdict that could not fail on those was not
evidence of readiness. Readiness for students is shown by the student journey gate
(`bash harness/bin/harness journey-gate`, workflow `student-journey-gate.yml`).

## The kept gates

| Gate | Script | Where it runs | What it checks |
|------|--------|---------------|----------------|
| Contract_Sync_Gate | `scripts/launch-verification/check-contract-sync.py` | `ci.yml`, `backend` job, blocking | The tenant-admin endpoints the frontend declares match the generated OpenAPI schema |
| Brand_Scan_Gate | `scripts/launch-verification/run-brand-scan.py` (core `brand_eval.py`) | `ci.yml`, `backend-drift-guards` job, blocking | No hard-coded school brand outside the allowlist |
| Scope_Gate | `scripts/launch-verification/check-launch-scope.py` (core `scope_eval.py`) | `ci.yml`, `backend-drift-guards` job, blocking | The stub routes stay unreachable unless their flag is on |
| Version consistency | `scripts/launch-verification/version_eval.py` | `backend-governance.yml`, blocking | Version and API-major drift across the files that name them |
| Bundle_Guard | `apps/admissions/scripts/launch-bundle-guard.ts` | `ci.yml`, `admissions` job | The entry path stays within its gzip budget and loads no excluded chunk (PDF engines, OCR, charts) |

Each gate writes an `Evidence_Artifact` JSON under `docs/launch-evidence/` and CI
uploads it as a build artefact. The artefact schema and the redaction helper live in
`backend/apps/common/launch_verification/` (`evidence.py`, `redaction.py`).

## Post-deploy smoke

`scripts/launch-verification/run-smoke-gate.py` probes a live, deployed target by
hand after a production deploy. Its procedure is in
`docs/runbooks/post-deploy-smoke-check.md`. It is an operator step and is not run in CI.

## Safety rules

- **Backup-first.** Before any production database apply, take a backup with
  `./deploy/backup-db.sh`.
- **Neon-first.** Author and prove every schema or data change on a Neon branch
  before it touches production.
- **No public Postgres port.** Reach the production database only through
  `docker compose exec postgres ...` on the EC2 box.
- **No PII or secrets in artefacts.** Every gate writes through the shared
  redaction helper. Do not hand-edit an artefact to add a value.

## Removed on 2026-11-09

The Gate 12 rollup job and its verdict, the suite-result collector, the verdict
documents (`rollup.json`, `launch-readiness.md`) and the operator-run scripts that fed
only that verdict (migration evidence, performance and Lighthouse, mobile UI,
operational readiness, onboarding smoke) are removed. They remain in git history.
Where an operator still needs a migration or operational check, use
`deploy/RUNBOOK.md`, `docs/runbooks/multi-tenant-operations.md` and
`docs/runbooks/database-backup-restore.md`.

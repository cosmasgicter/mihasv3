# Production Hardening Plan

This plan captures the highest-value improvements that raise production safety without adding unnecessary platform complexity.

## Current Goal

Move MIHAS from "strong MVP with production traffic" to "operationally safe production system" by tightening:

- database recovery
- release traceability and rollback
- critical flow test trust

## Priority 1: Database Recovery

Status: `IN PROGRESS`

Tasks:
- Add a concrete Neon backup and restore runbook
- Define pre-deploy DB safety steps for risky changes
- Define restore drill procedure and evidence to record
- Define service repoint procedure after restore

Implemented:
- Added [docs/runbooks/database-backup-restore.md](docs/runbooks/database-backup-restore.md)

Why this improves the system:
- Gives operators a recovery path for schema drift, bad SQL, and data corruption
- Reduces unmanaged-schema risk from `managed=False`
- Makes DB recovery procedural instead of improvised

Remaining:
- Execute one real restore drill in staging or a Neon branch and capture timings/results

## Priority 2: Release Tagging And Rollback

Status: `IN PROGRESS`

Tasks:
- Define release tagging convention
- Create lightweight release tag helper
- Add deployment record template
- Add rollback steps for backend, frontend, and DB

Implemented:
- Added [docs/runbooks/release-and-rollback.md](docs/runbooks/release-and-rollback.md)
- Added [scripts/create_release_tag.sh](scripts/create_release_tag.sh)

Why this improves the system:
- Makes every deploy identifiable
- Makes rollback possible under pressure
- Gives backend/frontend/database changes a shared release reference

Remaining:
- Start using tags before every production deploy
- Record the first tagged production deployment

## Priority 3: Critical Flow Test Trust

Status: `IN PROGRESS`

Tasks:
- Validate payment/application/auth critical slice
- Fix any failing payment-step regression first
- Keep CI pressure on critical tests before broad-suite perfection

Implemented:
- Hardened payment UI so supported mobile-money operators are explicitly visible
- Restored the `PaymentStep` critical test contract

Why this improves the system:
- Keeps payment confidence high without needing a full E2E platform first
- Prevents visual refactors from silently breaking business-critical UX expectations

Remaining:
- Run the critical frontend slice in CI as a required gate
- Continue burning down non-critical failing tests separately

## Additional Low-Complexity Wins

Status: `OPEN`

Tasks:
- Fill secrets rotation runbook
- Add post-deploy smoke checklist
- Stand up minimal staging if cost allows
- Add rollback verification checklist

## Admissions/Backend Security Gates

Status: `IN PROGRESS`

Implemented:
- Removed `script-src 'unsafe-inline'` from the admissions production CSP
- Moved the admissions preloader behavior into same-origin `/preloader.js`
- Tightened production admissions build env requirements for API URL, app/site URL, version, Lenco public key, and GlitchTip DSN
- Minimized public application tracking data and removed public payment status exposure
- Added a dedicated `/api/v1/applications/track/` rate-limit scope
- Added a public endpoint classification guard for `AllowAny` backend views
- Added a Redis/Postgres-backed backend parity check script

Remaining:
- Run the full required frontend and backend gates in CI or an equivalent production-parity environment
- Capture the first production release tag, deploy record, smoke result, and Neon restore drill evidence before declaring production-ready

## Recommended Operating Model

1. Tag every production release.
2. Run critical backend/frontend slices before deploy.
3. Take a Neon safety branch before risky DB changes.
4. Use the rollback runbook instead of ad-hoc rollback.
5. Run a restore drill at least once per quarter.

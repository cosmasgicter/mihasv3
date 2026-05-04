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
- Added repeatable admissions production E2E modes in `scripts/e2e-production-admissions.sh`
- Added role-aware CSV export hardening: super-admin receives full exports; regular admin receives redacted direct identifiers
- Added authenticated API `no-store` cache headers for bearer-token and auth-cookie requests
- Added optional `LENCO_WEBHOOK_ALLOWED_IPS` source allowlisting for Lenco webhooks
- Added [docs/production-readiness-status-2026-05-04.md](docs/production-readiness-status-2026-05-04.md)
- Hardened the student application wizard contract: unique grade subjects, explicit submit confirmation, no automatic submit retries, safe repeat-submit response, and stable preview/OCR fallback behavior

Remaining:
- Run the full required frontend and backend gates in CI or an equivalent production-parity environment
- Capture E2E evidence for the hardened wizard path: 5 unique subjects, result slip/NRC upload, payment success or deferment, confirmation checkbox, first submit, repeat submit, and OCR/manual-entry fallback
- Capture the first production release tag, deploy record, smoke result, and Neon restore drill evidence before declaring production-ready
- Rotate/document any historical secrets referenced by `.kiro`/Context7/Supabase-style findings and re-run secret scanning
- Revalidate whether frontend `style-src 'unsafe-inline'` can be removed without breaking runtime styles

## Recommended Operating Model

1. Tag every production release.
2. Run critical backend/frontend slices before deploy.
3. Take a Neon safety branch before risky DB changes.
4. Use the rollback runbook instead of ad-hoc rollback.
5. Run a restore drill at least once per quarter.

# Admissions Production Readiness Status

Date: 2026-05-04

## Readiness Summary

Current assessment: 88-90% production-ready.

The admissions flow is production-usable and materially hardened. Final production-ready signoff still depends on proving the hardened application wizard path end to end: 5 unique subjects, OCR fallback/manual entry, payment confirmation or deferment, explicit final confirmation, and safe repeat submit behavior. The remaining gap is operational maturity: release evidence, restore evidence, recurring monitors, and proof that known historical secrets were rotated.

## Verified Live Behavior To Preserve

- Production smoke checks pass.
- `/health/ready/` reports database and Redis readiness.
- `/health/redis/` reports Redis readiness.
- Frontend CSP does not allow `script-src 'unsafe-inline'`.
- OpenAPI docs are anonymous-gated.
- Default `/admin/` is absent; Django admin is on `/mihas-admin-panel/`.
- Public tracking returns minimized fields only.
- Curl-based admissions E2E has been manually proven with controlled dev accounts.

## Evidence Still Required

Record the first complete evidence bundle here or link to the external incident/deploy system.

| Evidence | Required Value | Status |
| --- | --- | --- |
| Release tag | `vYYYY.MM.DD-N` for known-good commit | Pending |
| Known-good commit | `4556b1b53` or successor commit after hardening | Pending |
| Vercel deploy ID | Frontend production deployment ID | Pending |
| Backend deploy ID | Backend production deployment ID | Pending |
| Operator | Person who deployed and verified | Pending |
| Deploy time | UTC start/end timestamps | Pending |
| Smoke results | `scripts/smoke-production.sh` output | Pending |
| E2E result | `scripts/e2e-production-admissions.sh safe-write` output | Pending |
| Secret scan | Repo plus git history scan result | Pending |
| Neon restore drill | Branch name, timings, smoke result | Pending |

## Changes Added For This Milestone

- `scripts/e2e-production-admissions.sh` provides repeatable production modes:
  - `smoke`
  - `readonly-smoke`
  - `safe-write`
  - `manual-payment`
- Regular admin CSV exports are redacted; super-admin exports retain full values.
- Authenticated API requests with bearer tokens or auth cookies receive `Cache-Control: no-store, no-cache, must-revalidate, private`.
- Lenco does not publish a stable public webhook source IP range. Keep `LENCO_WEBHOOK_ALLOWED_IPS` empty unless Lenco provides a dedicated static range for this integration; webhook authenticity is enforced by `X-Lenco-Signature` HMAC-SHA512 verification plus transaction re-query/reconciliation.
- Student submit now requires `{"confirm_submission": true}` and repeat submit of an already submitted same-owner application returns the current submitted record.
- Grade sync rejects duplicate subjects and requires at least 5 unique valid subjects for the batch save used by the wizard.
- The wizard counts unique subjects, surfaces duplicate rows inline, keeps OCR non-blocking, and avoids replacing deterministic preview copy with AI text.

## Security Debt Tracker

| Item | Required Action | Status |
| --- | --- | --- |
| `.kiro`/Context7/Supabase-style historical secret references | Rotate any exposed tokens and record rotation evidence | Pending evidence |
| Historical secret examples in tracked docs/specs | Remove, redact, or document why retained | Pending review |
| Secret scanning | Re-run against working tree and git history | Pending |
| Frontend `style-src 'unsafe-inline'` | Revalidate Radix/runtime styles without it | Pending |
| Lenco webhook source controls | Leave `LENCO_WEBHOOK_ALLOWED_IPS` empty unless Lenco provides a dedicated static range; rely on HMAC signature verification and re-query/reconciliation | Accepted/ready |

## Monitoring Matrix

| Monitor | Target | Threshold | Owner |
| --- | --- | --- | --- |
| Frontend availability | `***REMOVED***/` | 2 failures over 5 minutes | Admissions ops |
| API liveness | `/health/live/` | 2 failures over 5 minutes | Backend ops |
| API readiness | `/health/ready/` | 1 failure over 5 minutes | Backend ops |
| Redis health | `/health/redis/` | 1 failure over 5 minutes | Backend ops |
| Auth session | `/api/v1/auth/session/` | non-2xx or malformed envelope | Backend ops |
| Catalog programs | `/api/v1/catalog/programs/` | non-2xx or empty active catalog | Admissions ops |
| Payment failures | payment error/failure metric | >5% over 15 minutes | Finance/ops |
| Frontend GlitchTip ingestion | known frontend test event | missing after release | Frontend ops |
| Backend GlitchTip ingestion | known backend test event | missing after release | Backend ops |
| Async task failures | acceptance letters, finance receipts, email, payment polling | any sustained failures | Backend ops |

## Required Next Milestone Test Plan

Run and attach results before declaring the next production-ready milestone:

1. `scripts/smoke-production.sh`
2. `scripts/e2e-production-admissions.sh readonly-smoke`
3. `scripts/e2e-production-admissions.sh safe-write`
4. Frontend build and targeted CSP/preloader tests.
5. Backend `manage.py check` with production-parity Postgres and Redis.
6. Secret scan over repo and git history.
7. Admin export permission/redaction tests.
8. Public endpoint classification tests.
9. Neon restore drill with recorded timings and smoke results.
10. Manual checks: student login, wizard open, document upload, fee resolution, mobile-money operators visible, dashboard, admin applications page.

## Jobs/Ops Scope

Jobs/Ops routes remain outside this admissions readiness declaration. Production keeps scaffold domains disabled unless `ENABLE_JOBS_OPS_ROUTES=true`; do not enable until every endpoint is authenticated and reviewed.

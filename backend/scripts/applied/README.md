# Applied SQL Scripts

Scripts in this directory have been **fully applied to production** and are
kept for historical reference only. They must **not** be re-run against any
environment.

## Contents

| Script | Purpose | Applied |
|--------|---------|---------|
| `payment_hardening_indexes.sql` | Phase 1 payment hardening indexes (receipt uniqueness, user+status) | 2026-05-10 |
| `payment_hardening_preflight.sql` | Phase 1 preflight schema checks | 2026-05-10 |

## Audit Finding Resolution (SSP-008 through SSP-014, BUG-016)

The April 2026 audit identified 7 stale SQL scripts plus `idempotency_redesign.sql`
(BUG-016) for archival. Investigation on 2026-05-27 confirmed these files were
**never committed to git** — they were executed directly against Neon and only
referenced in the audit inventory (`all-files.txt`). See
`backend/scripts/archive/README.md` for the full disposition.

Their schema effects are captured in `backend/scripts/00_full_schema.sql`.

## Active Scripts

Active scripts (migrations, backfills, rollbacks, verification) remain in
`backend/scripts/`.

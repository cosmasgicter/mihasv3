# Applied SQL Scripts

Scripts in this directory have been **fully applied to production** and are kept for historical reference only. They must **not** be re-run against any environment.

## Why This Directory Exists

During the April 2026 repository audit (AUDIT-REPORT-2026-04-24.md, findings SSP-008 through SSP-014), 7 stale SQL scripts were identified as fully applied. Moving them here prevents accidental re-execution and clarifies which scripts in `backend/scripts/` are still active.

## Contents

Scripts are moved here via `git mv` once confirmed applied. See `backend/scripts/archive/README.md` for the original audit inventory.

## Active Scripts

Active scripts (preflight checks, verification, pending migrations) remain in `backend/scripts/`.

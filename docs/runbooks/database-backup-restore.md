# Database Backup And Restore Runbook

## Purpose

This runbook defines the minimum safe recovery procedure for MIHAS production data on Neon Postgres.

Use it for:

- bad SQL deployments
- accidental destructive updates
- schema drift recovery
- application regressions caused by DB changes
- corruption investigation

## Recovery Principles

- Prefer Neon branch-based recovery over manual SQL undo.
- Take a safety branch before risky schema or data operations.
- Restore into a new branch first. Do not restore directly into the live production branch.
- Repoint services only after verification passes.

## Before Risky Changes

1. Record the release tag for the deploy.
2. Record the current production Neon branch/database name.
3. Create a Neon safety branch from production.
4. Record:
   - release tag
   - branch name
   - operator
   - reason
   - timestamp

Suggested branch naming:

- `predeploy-2026-04-22-v2026.04.22-1`
- `restore-incident-2026-04-22`

## Restore Procedure

1. Identify the incident window.
2. Choose the restore timestamp or source branch in Neon.
3. Create a new restore branch from the last known good point.
4. Validate the restore branch:
   - application critical tables present
   - auth/session tables present
   - payment records consistent
   - current schema verification scripts pass
5. Point staging or a temporary backend instance at the restore branch.
6. Run smoke checks:
   - health endpoints
   - auth session
   - application listing
   - payment lookup path
7. If valid, update production `DATABASE_URL` to the restored branch.
8. Redeploy backend workers/web service.
9. Verify application health and payment flows.

## Verification Checklist

- `python3 backend/scripts/verify_schema_static.py`
- `python3 backend/manage.py check`
- auth session loads
- application create/list paths respond
- payment read/initiate path responds
- admin can view recent applications

## Restore Drill

Run once per quarter:

1. Create a non-production restore branch.
2. Repoint a staging/local parity backend to it.
3. Run smoke checks.
4. Record:
   - restore start time
   - restore ready time
   - smoke results
   - issues found

## Evidence To Record

- release tag
- Neon source branch
- Neon restore branch
- incident start/end time
- operator
- verification results
- final production DB target

## Notes

- Because many tables are `managed=False`, schema recovery discipline is mandatory.
- If a DB restore crosses payment state changes, reconcile with payment provider records before closing the incident.

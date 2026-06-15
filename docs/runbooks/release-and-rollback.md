# Release And Rollback Runbook

## Release Tagging Convention

Use date-based release tags:

- `vYYYY.MM.DD-N`

Examples:

- `v2026.04.22-1`
- `v2026.04.22-2`

## Before Deploy

1. Ensure critical CI/tests are green.
2. Create a release tag.
3. Record:
   - tag
   - backend commit
   - frontend commit
   - DB change artifact, if any
   - deploy operator
   - deploy time
4. If DB changes are risky, create a Neon safety branch first.

## Tag Creation

Use:

```bash
./scripts/create_release_tag.sh
```

Or create manually:

```bash
git tag v2026.04.22-1
git push origin v2026.04.22-1
```

## Deployment Record Template

Capture the following for every production release:

- Release tag:
- Backend commit:
- Frontend commit:
- Database artifact:
- Operator:
- Start time:
- End time:
- Smoke checks:
- Rollback needed:

## Rollback Triggers

Rollback when:

- auth/session flow is broken
- payment initiation or verification is broken
- application create/submit is broken
- 5xx rate spikes after deploy
- admin access is broken

## Backend Rollback

1. Identify previous known-good release tag.
2. Redeploy backend from the previous commit or image.
3. Restart web, worker, and beat services.
4. Run smoke checks.

## Frontend Rollback

1. Identify previous known-good release tag.
2. Redeploy the prior Vercel build or commit.
3. Confirm public, student, and admin entry pages load.

## Database Rollback

Do not improvise manual SQL reversal during an incident unless the change is trivial and verified.

The database rollback posture is **forward-only**: all production schema ships as
additive, idempotent SQL scripts under `backend/scripts/`, so a routine rollback
rolls back **code only** and leaves the additive columns/tables in place — old
code simply ignores the new columns and legacy rows stay readable (R14.7). There
is no schema revert in a routine rollback, and tenant tables/columns are never
dropped as part of one. A genuine destructive teardown is a separately reviewed
non-additive script applied manually with `--allow-non-additive` after a fresh
backup, never through the container-startup sweep.

Preferred path for data-level recovery (corruption or a bad data write only):

1. Follow [database-backup-restore.md](database-backup-restore.md)
2. Restore to a Neon branch
3. Validate
4. Repoint services

> The **canonical rollback posture** — code rollback, forward-only schema,
> feature-flag disable, and the graceful-degradation levers below — lives in
> [database-backup-restore.md](database-backup-restore.md) §"Rollback Posture".

## Graceful-Degradation Posture (R14.4–R14.7)

If a risky surface fails after launch, degrade it safely **without destroying the
underlying data** — hide or gate the surface, never delete the records behind it.

- **A tenant feature fails (R14.4):** disable the feature route/action and keep
  the data intact. Prefer a feature-flag flip back to `False` (then redeploy) or
  gating the route over any data change.
- **Payment fails after launch (R14.5):** stop payment initiation while keeping
  application submission safe — students may defer payment and submit. Do **not**
  block submission on the payment gateway, and a failed payment never produces a
  paid receipt.
- **Official-document generation fails (R14.6):** the system shows "generation
  failed" and **blocks the download** rather than serving a stale or
  client-rendered PDF. Official documents are backend-generated and backend-only;
  they never fall back to the `@/lib/pdf` preview/draft generators. A failed
  generation records a `failed` status and leaves any prior Official_Document
  unchanged.
- **Database rollback is forward-only (R14.7)** unless a tested rollback script
  exists; **code rollback is always allowed** and is the first lever.

### Rollback decision order

1. **Code rollback first** (previous image SHA) — fixes most regressions, zero
   data risk.
2. **Flip the relevant feature flag(s) to `False`** and redeploy — disables a
   risky surface without dropping data.
3. **Graceful-degradation lever** — stop payment initiation / block official-doc
   download while keeping submission and reads working.
4. **Neon branch restore** (last resort, data-level) — only for corruption or a
   bad data write; restore to a new branch, validate, repoint. Never improvise
   destructive SQL during an incident.

## Post-Rollback Checks

- `/health/live/`
- `/health/ready/`
- auth session
- student dashboard
- application wizard
- payment initiation path
- admin applications view

## Simplicity Rule

Keep deployment manual if needed, but never untracked:

- every deploy should have a tag
- every production change should have a rollback target

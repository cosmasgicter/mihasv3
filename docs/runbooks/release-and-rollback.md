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

Preferred path:

1. Follow [database-backup-restore.md](database-backup-restore.md)
2. Restore to a Neon branch
3. Validate
4. Repoint services

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

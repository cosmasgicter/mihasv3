# Post-Deploy Smoke Check

## Purpose

Run this immediately after production deploys to catch obvious regressions before users do.

## Automated Smoke Script

```bash
./scripts/smoke-production.sh
```

Optional overrides:

```bash
APP_URL=***REMOVED*** API_URL=***REMOVED*** ./scripts/smoke-production.sh
```

This verifies:

- frontend landing page responds `200`
- backend `/health/live/` responds `200`
- backend `/health/ready/` responds `200`
- public auth session endpoint responds `200`

## Manual Critical Checks

After the script passes, verify:

1. Sign in with a test student account.
2. Open the application wizard.
3. Confirm application fee resolves on the payment step.
4. Confirm mobile-money operators are visible.
5. Confirm the dashboard loads.
6. Confirm admin applications page loads.

## If Anything Fails

1. Stop further rollout.
2. Compare against the previous release tag.
3. Use [release-and-rollback.md](release-and-rollback.md).

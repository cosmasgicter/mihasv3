# Secrets Rotation Runbook

## Purpose

This runbook defines how to rotate production secrets without guessing under pressure.

## Rotation Log

| Date | Secret | Reason | Operator action taken |
|------|--------|--------|------------------------|
| 2026-07-05 | Super-admin password (`cosmas@beanola.com`) | Password was pasted in an AI chat session (Kiro CLI) across multiple prior turns — treated as compromised per this repo's safety guardrails. | Rotated directly via a `profiles.password_hash` update (raw bcrypt, matching `apps/accounts/services.py:verify_password`'s `$2`-prefix check — **not** Django's `make_password`, which produces an incompatible `bcrypt_sha256$$` prefix this platform's login path does not recognize). Verified via a real login call (`POST /api/v1/auth/login/` → 200, `role: super_admin`). All 184 pre-existing `device_sessions` rows for this user were invalidated (`is_active=false`) to force re-authentication everywhere. **The new password is not recorded in this file or in git** — it was communicated to the account owner out of band. |

**Full remediation status** (per `.kiro/specs/full-platform-remediation-2026-07/`):
- [x] Super-admin password rotated (2026-07-05) — task 1.1.
- [ ] Full inventory rotation (SECRET_KEY, JWT_SIGNING_KEY, LENCO keys, RESEND_API_KEY,
  S3/R2 keys, ZOHO_SMTP_PASSWORD, GLITCHTIP_DSN, DATABASE_URL/REDIS_URL creds) — task 1.2,
  still pending. Each of these lives at a third-party provider dashboard or requires a
  backend restart with a maintenance window; they are **operator-gated** and are not
  rotated by an agent session. See the inventory below for the exact steps per secret.
- [ ] Git history purge of any committed `.env` files — task 1.3, **irreversible**,
  requires coordinating with all clones first. Not run in this session.

## Rotation Inventory

### Super-admin / staff application passwords

- Stored as `profiles.password_hash` (raw bcrypt, `$2b$...` — verified by
  `apps/accounts/services.py:verify_password`, which explicitly rejects
  Django's own `make_password` output because it does not start with `$2`).
- Rotate via a direct `UPDATE profiles SET password_hash = '<bcrypt hash>',
  password_changed_at = NOW() WHERE email = '<email>'` against the production
  Postgres container (see `.kiro/steering/infrastructure.md` for the
  `docker compose exec postgres psql` access pattern). There is no
  `POST /api/v1/auth/change-password/` endpoint yet — only the email-based
  `password-reset/` flow — so a direct DB rotation is the correct
  operator-gated path when the account owner does not have inbox access to
  the reset flow in the moment.
- After rotation, invalidate all existing sessions for that user:
  `UPDATE device_sessions SET is_active=false WHERE user_id = (SELECT id FROM
  profiles WHERE email = '<email>');` — access tokens still expire naturally
  within 30 minutes, but this forces immediate re-authentication everywhere.
- Validate: a real `POST /api/v1/auth/login/` call with the new password
  returns `200` and the expected `role`.

### `SECRET_KEY`

- Used by Django internals and signing features.
- Rotate only during a controlled maintenance window.
- Requires backend restart.
- Risk:
  - signed values may become invalid
  - some sessions/messages may be impacted

### `JWT_SIGNING_KEY`

- Used to sign access and refresh tokens.
- Rotation invalidates existing JWTs.
- Requires backend restart.
- Rollout note:
  - announce maintenance if needed
  - expect forced re-authentication

### `AUDIT_LOG_ENCRYPTION_KEY`

- Used to encrypt raw audit IP/user-agent context.
- Rotation without re-encryption makes old encrypted audit values unreadable.
- Do not rotate casually.
- If rotation is required:
  - export old values if needed
  - implement managed re-encryption or accept loss of decryptability

### `DATABASE_URL`

- Used by backend web, worker, and beat services.
- Rotation or repoint requires backend restart.
- Validate:
  - `/health/ready/`
  - auth/session
  - application list

### `REDIS_URL` / `CELERY_BROKER_URL`

- Used by cache, rate limiting, Celery, JTI blacklist, token rotation dedupe.
- Rotation requires backend worker/beat restart and usually web restart.
- Validate:
  - `/health/redis/`
  - Celery task processing
  - refresh flow

### `LENCO_API_SECRET_KEY`

- Used for payment operations.
- Rotate carefully and validate:
  - payment initiate path
  - payment verification/webhook path

### `SMTP_PASSWORD`

- Used by Zoho SMTP outbound delivery.
- Rotate in the mail provider first, then update backend hosting secrets.
- Validate:
  - test email dispatch
  - email queue drain

### `RESEND_API_KEY`

- Used for outbound mail fallback.
- Validate:
  - test email dispatch
  - email queue drain

### `S3_ACCESS_KEY` / `S3_SECRET_KEY`

- Used for file/document storage.
- Validate:
  - upload
  - retrieval
  - document generation paths

### `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY`

- Used for web-push credentials when push delivery is enabled.
- Rotation may require clients to re-subscribe.
- Validate:
  - subscription creation
  - a test push notification

### `GLITCHTIP_DSN` / frontend error reporting keys

- Used for monitoring only.
- Lower operational risk.
- Validate:
  - test error capture event

## Rotation Procedure

1. Identify the secret to rotate.
2. Check dependent services.
3. Record:
   - operator
   - reason
   - time
   - impacted services
4. Update the secret in the hosting platform.
5. Restart or redeploy affected services.
6. Run the relevant smoke checks.
7. Confirm monitoring is clean.

## Minimum Smoke Checks After Rotation

- backend `manage.py check`
- `/health/live/`
- `/health/ready/`
- auth session
- application create/list
- payment path if payment secret changed
- email dispatch if email secret changed

## Caution Notes

- `JWT_SIGNING_KEY` rotation logs users out
- `AUDIT_LOG_ENCRYPTION_KEY` rotation affects historical decryptability
- `DATABASE_URL` and `REDIS_URL` changes affect all runtime services
- If any `.env.vercel.*` file ever contained production credentials, delete the local file and rotate every affected secret before treating the incident as closed.

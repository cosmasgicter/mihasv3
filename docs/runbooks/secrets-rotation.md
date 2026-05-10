# Secrets Rotation Runbook

## Purpose

This runbook defines how to rotate production secrets without guessing under pressure.

## Rotation Inventory

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

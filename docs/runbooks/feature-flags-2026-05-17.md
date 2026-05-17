# Feature Flags Runbook (2026-05-17)

This is the canonical inventory of every runtime feature flag, build-time flag,
and required secret across the admissions platform. Every entry has a rollback
path.

The `manage.py check_production_state --strict` command asserts that the
"Production value" column matches reality at deploy time. The pre-deploy gate
fails if any flag is misconfigured.

## Backend payment-hardening flags

These four flags gate the payment-hardening rollout (spec
`.kiro/specs/payment-hardening/`). All four are hardcoded `True` in
`prod.py` and `staging.py`.

| Flag | Type | Default in `base.py` | Production value | Rollback |
|------|------|---------------------|------------------|----------|
| `PAYMENT_HARDENING_FORWARD_ONLY` | hardcoded in `base.py` | `True` | `True` | None — forward-only is canonical now |
| `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | env-gated | `False` | `True` (via `prod.py:54`) | Set env `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=false`, redeploy |
| `PAYMENT_HARDENING_RATE_LIMITS` | env-gated | `False` | `True` (via `prod.py:55`) | Set env to false, redeploy |
| `PAYMENT_HARDENING_FORCE_APPROVED` | env-gated | `False` | `True` (via `prod.py:56`) | Set env to false, redeploy |

## Backend AI-hardening flags

Mandatory in production for PII protection. Override applied in `prod.py`
and `staging.py` to mirror the payment-hardening pattern (Decision A5).

| Flag | Type | Default in `base.py` | Production value | Rollback |
|------|------|---------------------|------------------|----------|
| `AI_HARDENING_CIRCUIT_BREAKER` | env-gated | `False` | `True` (via `prod.py`) | Set env to false |
| `AI_HARDENING_RATE_LIMITS` | env-gated | `False` | `True` (via `prod.py`) | Set env to false |
| `AI_HARDENING_CACHE` | env-gated | `False` | `True` (via `prod.py`) | Set env to false |
| `AI_HARDENING_REDACTION` | env-gated | `False` | `True` (via `prod.py`) | Set env to false **with extreme caution** — disabling redaction sends PII to upstream |

## Frontend build-time flags

| Flag | Set in | Production value | Rollback |
|------|--------|-----------------|----------|
| `VITE_PAYMENT_HARDENING_UI` | Vercel project env | `true` | Set to `false`, redeploy |
| `VITE_PAYMENT_DEV_BYPASS` | Vercel project env | `false` (must be) | n/a — must remain false in prod |
| `VITE_STUDENT_DASHBOARD_PRIORITY` | Vercel project env | (future) | Set to false |
| `VITE_LENCO_PUBLIC_KEY` | Vercel project env | live key | swap to sandbox key |
| `VITE_LENCO_WIDGET_URL` | Vercel project env | https URL | n/a |
| `VITE_GLITCHTIP_DSN` | Vercel project env | live DSN | empty disables frontend tracking |

## Backend operational flags

| Flag | Type | Default | Production | Rollback |
|------|------|---------|------------|----------|
| `PAYMENT_DEV_BYPASS` | env | `false` | **must be `false`** | n/a — blocked by `check_production_state` |
| `READ_ONLY_MODE` | env | `false` | `false` | Set `true`, redeploy to put backend in maintenance mode |
| `ENABLE_JOBS_OPS_ROUTES` | env | `false` | as needed | Toggle |
| `LOG_LEVEL` | env | `INFO` | `INFO` | Set `DEBUG` for triage |
| `REQUEST_METRIC_SAMPLE_RATE` | env (planned) | `1.0` | `0.1` (planned) | Set `1.0` |

## Required secrets (presence asserted by `check_production_state`)

| Secret | Where used | Rotation runbook |
|--------|-----------|------------------|
| `SECRET_KEY` | Django session/token signing fallback | `docs/runbooks/secrets-rotation.md` |
| `JWT_SIGNING_KEY` | JWT issuance/validation | `docs/runbooks/secrets-rotation.md` |
| `DATABASE_URL` | Neon Postgres connection | Neon dashboard |
| `REDIS_URL` | Celery broker + cache + JTI blacklist | Upstash dashboard |
| `LENCO_API_SECRET_KEY` | Outbound Lenco API | Lenco dashboard |
| `LENCO_PUBLIC_KEY` | Frontend widget + webhook signing | Lenco dashboard |
| `LENCO_WEBHOOK_ALLOWED_IPS` | Webhook ingress allow-list | Lenco support |
| `AUDIT_LOG_ENCRYPTION_KEY` | IP/UA encryption in audit_logs | `docs/runbooks/secrets-rotation.md` |
| `GLITCHTIP_DSN` | Backend error tracking | GlitchTip dashboard |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Cloudflare R2 storage | Cloudflare dashboard |
| `RESEND_API_KEY` | Fallback transactional email | Resend dashboard |
| `ZOHO_SMTP_USERNAME`, `ZOHO_SMTP_PASSWORD` | Primary outbound email | Zoho mail console |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Vercel dashboard |
| `ALLOWED_HOSTS` | Django host validation | env |
| `CORS_ALLOWED_ORIGINS` | CORS allow-list | env |

## How To Verify Production State

```bash
# On the production Koyeb instance:
python manage.py check_production_state --strict
```

Expected output: zero warnings, exit code 0. Any non-zero exit blocks deploy.

## How To Add A New Flag

1. Add the flag to `base.py` with `env-gated False` default.
2. Add a hardcoded production override to `prod.py` and `staging.py`.
3. Add the flag to the appropriate table in this file.
4. Add a check to `manage.py check_production_state`.
5. Add the rollback procedure.

## How To Roll A Flag Back

For env-gated flags:
1. Set the env var to `false` in the Koyeb dashboard.
2. Redeploy (or hot-restart the service).
3. The flag's runtime check returns False; the legacy code path runs.

For build-time `VITE_*` flags:
1. Update the Vercel project env var.
2. Redeploy the frontend.

## Rollback Order If Multiple Flags Misbehave

1. Frontend `VITE_PAYMENT_HARDENING_UI` (visible UX).
2. Backend `AI_HARDENING_REDACTION` only if confirmed to break the AI path AND PII implications are accepted.
3. Backend `PAYMENT_HARDENING_RATE_LIMITS` if causing legitimate-user lockouts.
4. Backend `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` if causing missed webhook events.
5. Backend `PAYMENT_HARDENING_FORCE_APPROVED` (highest data-integrity risk to roll back).

Always document the rollback in `docs/runbooks/` and capture the incident.

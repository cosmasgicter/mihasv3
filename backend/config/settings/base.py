"""Base settings shared across all environments."""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured


def split_csv_env(name: str, default: str = "") -> list[str]:
    """Read a comma-separated env var into a trimmed list."""
    return [
        value.strip()
        for value in os.environ.get(name, default).split(",")
        if value.strip()
    ]

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("SECRET_KEY", "insecure-dev-key-change-me")

DEBUG = False

ALLOWED_HOSTS: list[str] = []


def validate_debug_not_serving_production_hosts() -> None:
    """Prevent DEBUG=True from serving production API hostnames."""
    if DEBUG and "api.mihas.edu.zm" in ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "DEBUG=True must not be used with api.mihas.edu.zm in ALLOWED_HOSTS."
        )

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "django_ratelimit",
    "django_filters",
    "storages",
    # Project apps
    "apps.accounts",
    "apps.applications",
    "apps.documents",
    "apps.catalog",
    "apps.common",
    "apps.jobs",
    "apps.outreach",
    "apps.automation",
    "apps.integrations",
    "apps.analytics",
]

MIDDLEWARE = [
    # 1. CORS must run before any middleware that can return an error response,
    # otherwise browsers hide legitimate 4xx/5xx API responses as CORS failures.
    "corsheaders.middleware.CorsMiddleware",
    # 2. Custom security headers (HSTS, X-Content-Type-Options, etc.)
    "apps.common.middleware.SecurityHeadersMiddleware",
    # 3. Django built-in security (SSL redirect, SECURE_PROXY_SSL_HEADER)
    "django.middleware.security.SecurityMiddleware",
    # 4. WhiteNoise for static files
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # 5. Request ID generation/propagation
    "apps.common.middleware.RequestIDMiddleware",
    # 5.5. Request metrics (after RequestID so request_id is available)
    "apps.common.middleware.MetricsMiddleware",
    # 6. Per-scope rate limiting
    "apps.common.middleware.RateLimitMiddleware",
    # 7. URL normalization
    "django.middleware.common.CommonMiddleware",
    # 8. Audit logging for state-changing operations
    "apps.common.middleware.AuditMiddleware",
    # 9. Read-only mode (disabled by default — activates via READ_ONLY_MODE env var)
    "apps.common.readonly.ReadOnlyMiddleware",
    # 10. Idempotency: now handled per-view via @idempotent decorator
    # Django defaults needed for admin
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database — Neon Postgres with connection pooling
# ---------------------------------------------------------------------------
#
# Connection pooling strategy:
#   - Use Neon's built-in pooler endpoint (append ?pgbouncer=true or use the
#     pooled connection string from the Neon dashboard) in DATABASE_URL.
#   - CONN_MAX_AGE=300 reuses connections within each Uvicorn worker process
#     for up to 5 minutes, reducing connection churn against the Neon pooler.
#     Kept conservative for 0.25 CU Neon instances with limited connection slots.
#   - conn_health_checks=True validates connections before use (avoids stale
#     connections after Neon cold starts or pooler restarts).
#   - For Celery workers, set a separate DATABASE_URL with lower pool limits
#     (e.g. ?pool_size=2) to avoid exhausting Neon connection slots.
#   - Monitor active connections; log warnings at 80% utilization.
#
# Requirements: 20.1, 20.2, 20.3, 20.4

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL", ""),
        conn_max_age=300,
        conn_health_checks=True,
        ssl_require=True,
    )
}

# ---------------------------------------------------------------------------
# Celery — Redis broker and result backend
# ---------------------------------------------------------------------------

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# Celery Beat — periodic task schedule
from celery.schedules import crontab  # noqa: E402

# Store the beat schedule file in /tmp so the non-root container user can write it
CELERY_BEAT_SCHEDULE_FILENAME = "/tmp/celerybeat-schedule"

CELERY_BEAT_SCHEDULE = {
    "keep-alive": {
        "task": "apps.common.tasks.keep_alive_task",
        "schedule": 240.0,  # Every 4 minutes — prevents Koyeb cold starts (free tier sleeps after ~5m inactivity)
    },
    "check-uptime": {
        "task": "apps.common.tasks.check_uptime_task",
        "schedule": 900.0,  # Every 15 minutes (was 5m — reduced to conserve Upstash free-tier Redis requests)
    },
    "cleanup-stale-sessions": {
        "task": "apps.accounts.tasks.cleanup_stale_sessions_task",
        "schedule": crontab(hour=2, minute=30),
    },
    "cleanup-audit-logs": {
        "task": "apps.common.tasks.cleanup_audit_logs_task",
        "schedule": crontab(hour=3, minute=0),
    },
    "poll-pending-payments": {
        "task": "apps.documents.tasks.poll_pending_payments_task",
        "schedule": 600.0,
    },
    "manage-intakes": {
        "task": "apps.catalog.tasks.intake_manager_task",
        "schedule": crontab(hour=4, minute=0),
    },
    "interview-auto-complete": {
        "task": "apps.applications.tasks.interview_auto_complete_task",
        "schedule": 7200.0,  # Every 2 hours
    },
    "interview-reminder": {
        "task": "apps.applications.tasks.interview_reminder_task",
        "schedule": 3600.0,  # Every hour
    },
    "draft-expiry-reminder": {
        "task": "apps.applications.tasks.draft_expiry_reminder_task",
        "schedule": crontab(hour=6, minute=0),
    },
    "review-sla-reminder": {
        "task": "apps.applications.tasks.review_sla_reminder_task",
        "schedule": crontab(hour=7, minute=0),
    },
    "condition-expiry": {
        "task": "apps.applications.tasks.condition_expiry_task",
        "schedule": crontab(hour=5, minute=0),
    },
    "document-verification-sla": {
        "task": "apps.documents.tasks.document_verification_sla_task",
        "schedule": crontab(hour=8, minute=0),
    },
    "deferred-payment-reminder": {
        "task": "apps.documents.tasks.deferred_payment_reminder_task",
        "schedule": crontab(hour=11, minute=0),
    },
    "enrollment-confirmation-expiry": {
        "task": "apps.applications.tasks.enrollment_confirmation_expiry_task",
        "schedule": crontab(hour=9, minute=0),
    },
    "waitlist-cascade": {
        "task": "apps.applications.tasks.waitlist_cascade_task",
        "schedule": crontab(hour=10, minute=0),
    },
    "cleanup-idempotency-keys": {
        "task": "apps.common.tasks.cleanup_idempotency_keys",
        "schedule": crontab(hour=3, minute=0),
    },
    "process-pending-emails": {
        "task": "apps.common.tasks.process_pending_emails_task",
        "schedule": 120.0,  # Every 2 minutes — sweep stale pending EmailQueue rows
    },
}

# Enable TLS for rediss:// connections (Upstash, Redis Cloud, etc.)
if CELERY_BROKER_URL.startswith("rediss://"):
    import ssl
    CELERY_BROKER_USE_SSL = {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    CELERY_REDIS_BACKEND_USE_SSL = {"ssl_cert_reqs": ssl.CERT_REQUIRED}

# Shared cache backend for rate limiting and other cross-process state.
# Django-ratelimit rejects in-process and file-backed caches, so keep the cache
# contract Redis-based across environments. Local dev can satisfy this via the
# compose Redis service or an externally provided REDIS_URL.
REDIS_CACHE_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/1")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_CACHE_URL,
    }
}
# django-ratelimit only whitelists django-redis's backend string, but Django's
# built-in Redis cache is sufficient for the shared atomic operations we use.
SILENCED_SYSTEM_CHECKS = ["django_ratelimit.W001"]
# Fail open if the shared cache is unavailable so Redis outages do not
# block legitimate requests on rate-limited endpoints.
RATELIMIT_FAIL_OPEN = True

# ---------------------------------------------------------------------------
# JWT — SimpleJWT with shared signing key for dual-run compatibility
# ---------------------------------------------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", ""),
    "ALGORITHM": "HS256",
    "ROTATE_REFRESH_TOKENS": True,  # Declarative only — actual rotation/blacklisting logic is in backend/apps/accounts/tokens.py
    "BLACKLIST_AFTER_ROTATION": True,  # Declarative only — actual rotation/blacklisting logic is in backend/apps/accounts/tokens.py
}

# ---------------------------------------------------------------------------
# CORS — allowed origins and regexes from env vars (comma-separated)
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = split_csv_env("CORS_ALLOWED_ORIGINS")
CORS_ALLOWED_ORIGIN_REGEXES = split_csv_env("CORS_ALLOWED_ORIGIN_REGEXES")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = list(dict.fromkeys([*default_headers, "cache-control", "x-csrf-token", "x-csrf-recovery", "idempotency-key"]))
CORS_EXPOSE_HEADERS = ["X-CSRF-Token", "X-Request-ID", "X-Backend-Version"]
CORS_PREFLIGHT_MAX_AGE = 86400

# ---------------------------------------------------------------------------
# Security settings
# ---------------------------------------------------------------------------

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Request body size limits (prevent memory exhaustion attacks)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB for JSON/form data
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB for file uploads

# ---------------------------------------------------------------------------
# Auth cookie settings (subdomain strategy)
# ---------------------------------------------------------------------------

AUTH_COOKIE_DOMAIN = ".mihas.edu.zm"
AUTH_COOKIE_SAMESITE = "Lax"  # Same-site subdomains: apply.mihas.edu.zm -> api.mihas.edu.zm
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_HTTPONLY = True

# ---------------------------------------------------------------------------
# S3/R2 storage via django-storages
# ---------------------------------------------------------------------------

AWS_S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")
AWS_STORAGE_BUCKET_NAME = os.environ.get("S3_BUCKET", "")
AWS_S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY", "")
AWS_S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_KEY", "")
AWS_QUERYSTRING_EXPIRE = 900  # 15-minute signed URLs
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_DEFAULT_ACL = None

# ---------------------------------------------------------------------------
# Static files — WhiteNoise (serves admin panel + API docs in production)
# ---------------------------------------------------------------------------
# WhiteNoise is configured as middleware (position 3 in MIDDLEWARE) and
# serves compressed, cache-busted static files directly from the ASGI app
# server without needing nginx or a CDN for admin/docs assets.
# Requirement: 21.4

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        "OPTIONS": {
            "endpoint_url": AWS_S3_ENDPOINT_URL,
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "access_key": AWS_S3_ACCESS_KEY_ID,
            "secret_key": AWS_S3_SECRET_ACCESS_KEY,
            "querystring_expire": AWS_QUERYSTRING_EXPIRE,
            "signature_version": AWS_S3_SIGNATURE_VERSION,
            "default_acl": AWS_DEFAULT_ACL,
        },
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "apps.common.renderers.EnvelopeRenderer",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.JWTCookieAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "error_report": "5/min",
        "payment_initiate": "6/min",
        "payment_verify": "30/min",
        "mobile_money_initiate": "5/min",
        "payment_mobile_money": "6/min",
        "payment_resolve_fee": "30/min",
        "payment_correct": "3/min",
        "payment_risk_flags": "30/min",
        # AI hardening scopes (gated by AI_HARDENING_RATE_LIMITS)
        "ai_admin_summary": "60/hour",
        "ai_document_extract": "5/hour",
        "ai_student_preview": "10/hour",
    },
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.common.exceptions.envelope_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# ---------------------------------------------------------------------------
# drf-spectacular — OpenAPI 3.0 schema generation
# ---------------------------------------------------------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "MIHAS Platform APIs",
    "DESCRIPTION": """
Creator: Cosmas Kanchepa
Developed by Beanola Technologies - https://beanola.com

The MIHAS platform API surface now includes the existing admissions backend plus the implemented
Jobs Ops v1 domain for AI-driven job discovery, application operations, outreach, and reporting.

## What this API demonstrates

- Product-led operations design: clear user flows, fast operator workflows, and strong contract boundaries
- Backend discipline: JWT auth, CSRF protection, rate limiting, audit trails, idempotency, and async task processing
- Deployment rigor: ASGI-first Django on Koyeb, Redis-backed coordination, Cloudflare R2 storage, and OpenAPI-driven integration

## Surface areas

- `auth`: login, session, refresh, registration, and password recovery
- `applications`: submission, draft handling, review, tracking, and interview workflows
- `catalog`: institutions, programs, intakes, and subject metadata
- `documents` and `payments`: uploads, extraction, verification, and receipt operations
- `jobs` and `job-applications`: discovery, match scoring, review decisions, and job pursuit flows
- `outreach`, `automation`, `integrations`, `analytics`, and `reports`: the Jobs Ops scaffold domains
- `admin`: dashboard, user management, settings, and audit visibility
- `meta`: platform identity and attribution metadata

## Authentication

Protected endpoints accept either:

- a bearer access token for direct API testing
- or the `access_token` cookie issued by the login flow
""".strip(),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVERS": [
        {"url": "https://api.mihas.edu.zm", "description": "Production"},
        {"url": "http://localhost:8000", "description": "Local development"},
    ],
    "TAGS": [
        {"name": "auth", "description": "Authentication, session, and identity flows."},
        {"name": "sessions", "description": "Device sessions and token lifecycle controls."},
        {"name": "applications", "description": "Student application creation, review, tracking, and drafts."},
        {"name": "catalog", "description": "Programs, institutions, intakes, and subject reference data."},
        {"name": "documents", "description": "Uploads, OCR extraction, and document operations."},
        {"name": "payments", "description": "Payment verification and receipt flows."},
        {"name": "admin", "description": "Operational dashboards, staff actions, settings, and audits."},
        {"name": "notifications", "description": "Notifications, SSE streams, and messaging preferences."},
        {"name": "email", "description": "Email delivery and messaging endpoints."},
        {"name": "health", "description": "Operational liveness and readiness endpoints."},
        {"name": "jobs", "description": "Job discovery, scoring, review, and detail endpoints."},
        {"name": "job-applications", "description": "Job pursuit records, approvals, and submission actions."},
        {"name": "outreach", "description": "Contacts, campaigns, message generation, and send flows."},
        {"name": "automation", "description": "Rules, orchestration runs, approvals, and cancellation flows."},
        {"name": "integrations", "description": "Telegram, OpenAI, and provider connectivity endpoints."},
        {"name": "analytics", "description": "Funnel and source performance reporting."},
        {"name": "reports", "description": "Digest-style reporting endpoints."},
        {"name": "meta", "description": "Platform identity, creator, and developer metadata."},
        {"name": "errors", "description": "Frontend error reporting endpoints."},
    ],
    # Contact / license metadata (fixes linter `Missing recommended info field: contact`)
    "CONTACT": {
        "name": "MIHAS Admissions Platform Team",
        "email": "admissions@mihas.edu.zm",
        "url": "https://mihas.edu.zm",
    },
    "LICENSE": {
        "name": "Proprietary",
        "url": "https://mihas.edu.zm",
    },
    "TERMS_OF_SERVICE": "https://mihas.edu.zm/terms",
    "EXTERNAL_DOCS": {
        "description": "Operator documentation",
        "url": "https://mihas.edu.zm/docs/api/",
    },
    # Auto-tag operations that lack an explicit tags= kwarg on @extend_schema.
    # This catches legacy views that were never tagged and emits a consistent
    # domain tag derived from the URL prefix under /api/v1/.
    # Auto-summary: every operation must carry a human-readable one-liner.
    # Auto-error-responses: every operation documents the standard error codes
    # (adjusted for public endpoints that skip 401/403).
    "POSTPROCESSING_HOOKS": [
        "apps.common.openapi.auto_tag_by_url_prefix",
        "apps.common.openapi.auto_summary_from_operation_id",
        "apps.common.openapi.auto_document_error_responses",
    ],
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "displayRequestDuration": True,
        "filter": True,
        "persistAuthorization": True,
        "docExpansion": "list",
        "defaultModelsExpandDepth": 2,
    },
}

# ---------------------------------------------------------------------------
# Email — Zoho SMTP (primary) + Resend (fallback)
# ---------------------------------------------------------------------------

# Zoho SMTP (primary outbound email)
EMAIL_HOST = os.environ.get('ZOHO_SMTP_HOST', 'smtp.zoho.com')
EMAIL_PORT = int(os.environ.get('ZOHO_SMTP_PORT', '465'))
EMAIL_HOST_USER = os.environ.get('ZOHO_SMTP_USERNAME', '')
EMAIL_HOST_PASSWORD = os.environ.get('ZOHO_SMTP_PASSWORD', '')
EMAIL_USE_SSL = True  # Port 465 uses SSL
EMAIL_USE_TLS = False
DEFAULT_FROM_EMAIL = os.environ.get('ZOHO_FROM_EMAIL', os.environ.get('EMAIL_FROM', 'admin@mihas.edu.zm'))

# Resend (fallback)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "noreply@mihas.edu.zm")
ERROR_ALERT_EMAIL = os.environ.get("ERROR_ALERT_EMAIL", "admin@mihas.edu.zm")

# ---------------------------------------------------------------------------
# Uptime monitoring — internal health check URL
# ---------------------------------------------------------------------------

HEALTH_CHECK_URL = os.environ.get(
    "HEALTH_CHECK_URL", "https://api.mihas.edu.zm/health/ready/"
)

KEEP_ALIVE_URL = os.environ.get(
    "KEEP_ALIVE_URL", "https://api.mihas.edu.zm/health/live/"
)

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Default primary key field type
# ---------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Logging — structured JSON for production log aggregation
# ---------------------------------------------------------------------------

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {
            "()": "apps.common.logging.RequestContextFilter",
        },
    },
    "formatters": {
        "json": {
            "()": "apps.common.logging.JsonLogFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_context"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Lenco payment gateway
# ---------------------------------------------------------------------------

LENCO_API_SECRET_KEY = os.environ.get("LENCO_API_SECRET_KEY", "")
LENCO_API_BASE_URL = os.environ.get(
    "LENCO_API_BASE_URL", "https://sandbox.lenco.co/access/v2/"
)
LENCO_PUBLIC_KEY = os.environ.get("LENCO_PUBLIC_KEY", "")
LENCO_SANDBOX = os.environ.get("LENCO_SANDBOX", "").lower() in ("1", "true", "yes")
LENCO_WEBHOOK_ALLOWED_IPS = split_csv_env("LENCO_WEBHOOK_ALLOWED_IPS")

# Vercel AI Gateway
AI_GATEWAY_API_KEY = os.environ.get("AI_GATEWAY_API_KEY", "")
AI_GATEWAY_BASE_URL = os.environ.get("AI_GATEWAY_BASE_URL", "https://ai-gateway.vercel.sh/v1")
AI_MODEL_FAST = os.environ.get("AI_MODEL_FAST", "google/gemini-2.5-flash")  # cheap, fast tasks
AI_MODEL_VISION = os.environ.get("AI_MODEL_VISION", "google/gemini-2.5-flash")  # document OCR
AI_MODEL_ANALYSIS = os.environ.get("AI_MODEL_ANALYSIS", "openai/gpt-4o-mini")  # structured JSON extraction (cheapest)
AI_MODEL_SMART = os.environ.get("AI_MODEL_SMART", "deepseek/deepseek-v3")  # complex reasoning (cheapest: $0.28/M input)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://apply.mihas.edu.zm")
PAYMENT_DEV_BYPASS = os.environ.get("PAYMENT_DEV_BYPASS", "").lower() in (
    "1",
    "true",
    "yes",
)

# ---------------------------------------------------------------------------
# Payment hardening feature flags — see .kiro/specs/payment-hardening/
# ---------------------------------------------------------------------------
# Phase 2: gates ``PaymentService._transition()`` enforcement and the
# hardened view branches (new stable codes, audit, metrics). When False the
# legacy code paths remain in effect so the flag can be flipped per env.
PAYMENT_HARDENING_FORWARD_ONLY = os.environ.get(
    "PAYMENT_HARDENING_FORWARD_ONLY", ""
).lower() in ("1", "true", "yes")

# Phase 3: gates canonical-JSON + ``WebhookEventIdentity`` strict dedup on
# the webhook path. When False the previous dedup behaviour remains.
PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT = os.environ.get(
    "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT", ""
).lower() in ("1", "true", "yes")

# Phase 5: per-user DRF throttle scopes (payment_initiate, payment_verify,
# payment_mobile_money, payment_resolve_fee). When False the pre-existing
# throttle configuration remains in effect.
PAYMENT_HARDENING_RATE_LIMITS = os.environ.get(
    "PAYMENT_HARDENING_RATE_LIMITS", ""
).lower() in ("1", "true", "yes")

# Phase 5: admin override path creates a ``force_approved`` Payment instead
# of the legacy synthetic zero-amount ``successful`` row. When False the
# legacy behaviour is preserved.
PAYMENT_HARDENING_FORCE_APPROVED = os.environ.get(
    "PAYMENT_HARDENING_FORCE_APPROVED", ""
).lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# AI hardening flags — see docs/ai-data-flows.md and apps/common/ai_*.py
# ---------------------------------------------------------------------------

# Enables the Redis-backed circuit breaker in ``apps.common.ai_circuit_breaker``
# around every AI Gateway call. When False the breaker is a pass-through.
AI_HARDENING_CIRCUIT_BREAKER = os.environ.get(
    "AI_HARDENING_CIRCUIT_BREAKER", ""
).lower() in ("1", "true", "yes")

# Enables ``AIUserScopedRateThrottle`` on admin-summary, document-extract,
# and student-preview endpoints. When False those throttles are no-ops.
AI_HARDENING_RATE_LIMITS = os.environ.get(
    "AI_HARDENING_RATE_LIMITS", ""
).lower() in ("1", "true", "yes")

# Enables Redis caching of admin-summary and student-preview AI responses
# via ``apps.common.ai_cache``. When False the caching layer is bypassed.
AI_HARDENING_CACHE = os.environ.get(
    "AI_HARDENING_CACHE", ""
).lower() in ("1", "true", "yes")

# Enables PII redaction in ``apps.common.ai_prompt_redactor`` before
# admin-summary and student-preview prompts are sent to the AI Gateway.
AI_HARDENING_REDACTION = os.environ.get(
    "AI_HARDENING_REDACTION", ""
).lower() in ("1", "true", "yes")

# Reconciliation minimum-age cutoff before pending payments are re-queried
# via Lenco. Default 300s (5 minutes) per the design's Phase 2 rollout.
PAYMENT_RECONCILE_MIN_AGE_SECONDS = int(
    os.environ.get("PAYMENT_RECONCILE_MIN_AGE_SECONDS", "300")
)

AUDIT_LOG_ENCRYPTION_KEY = os.environ.get("AUDIT_LOG_ENCRYPTION_KEY", "").strip()

# ---------------------------------------------------------------------------
# Required environment variables — validated at startup (task 1.3)
# ---------------------------------------------------------------------------

REQUIRED_ENV_VARS = [
    "SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SIGNING_KEY",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "RESEND_API_KEY",
    "S3_ENDPOINT_URL",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
]

# ---------------------------------------------------------------------------
# Startup environment validation — skip during tests
# ---------------------------------------------------------------------------

import sys  # noqa: E402

_is_testing = "test" in sys.argv or os.environ.get("TESTING", "").lower() in (
    "1",
    "true",
    "yes",
) or "pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ

if _is_testing:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "mihas-test-cache",
        }
    }

if REQUIRED_ENV_VARS and not _is_testing:
    from apps.common.env_validator import validate_required_env_vars

    validate_required_env_vars()

# ---------------------------------------------------------------------------
# GlitchTip / Sentry-compatible error tracking
# ---------------------------------------------------------------------------
# Feature gates for scaffold domains
# ---------------------------------------------------------------------------

ENABLE_JOBS_OPS_ROUTES = os.environ.get('ENABLE_JOBS_OPS_ROUTES', 'false').lower() in ('1', 'true', 'yes')

# ---------------------------------------------------------------------------

GLITCHTIP_DSN = os.environ.get("GLITCHTIP_DSN", "")

if GLITCHTIP_DSN and not _is_testing:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration

    sentry_sdk.init(
        dsn=GLITCHTIP_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.01,
        send_default_pii=False,
        auto_session_tracking=False,
        environment=os.environ.get("ENVIRONMENT", "production"),
    )

# Warn if Lenco payment gateway is not configured
if not _is_testing and not LENCO_API_SECRET_KEY:
    import logging

    logging.getLogger("django").warning(
        "LENCO_API_SECRET_KEY is not set — payment processing will be unavailable."
    )

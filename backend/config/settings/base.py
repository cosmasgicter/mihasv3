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
_secret_key = os.environ.get("SECRET_KEY")
if not _secret_key:
    _settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "")
    if "dev" in _settings_module or "test" in _settings_module:
        import warnings
        warnings.warn("SECRET_KEY not set — using insecure default (dev/test only)", stacklevel=1)
        _secret_key = "insecure-dev-key-change-me-do-not-use-in-prod"
    else:
        raise ImproperlyConfigured("SECRET_KEY environment variable must be set in production")
SECRET_KEY = _secret_key

DEBUG = False

ALLOWED_HOSTS: list[str] = []

# Explicitly registered hosts that serve the neutral Beanola shared portal.
# Only these hosts may honor the narrow public ``?institution=`` selector;
# unknown, ambiguous, or tenant hosts must never become arbitrary tenant
# selectors. Tenant domains remain authoritative whenever they resolve.
SHARED_PORTAL_HOSTS = split_csv_env(
    "SHARED_PORTAL_HOSTS",
    "apply.beanola.com,api.beanola.com,localhost,127.0.0.1,testserver,web,0.0.0.0",
)


def validate_debug_not_serving_production_hosts() -> None:
    """Prevent DEBUG=True from serving production API hostnames."""
    if DEBUG and "api.beanola.com" in ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "DEBUG=True must not be used with api.beanola.com in ALLOWED_HOSTS."
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
        # SSL is required for managed Postgres (Neon) but not for a
        # same-host container DB. Controlled via DB_SSL_REQUIRE
        # (default True preserves the managed-DB contract).
        ssl_require=os.environ.get("DB_SSL_REQUIRE", "true").lower() != "false",
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
    # admissions-v2 task 10.2 (R13.9, STU-16): chase a condition deadline BEFORE
    # it lands. Scheduled an hour after the expiry sweep so the two never argue
    # about a condition that is expiring today.
    "condition-reminder": {
        "task": "apps.applications.tasks.condition_reminder_task",
        "schedule": crontab(hour=6, minute=30),
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
        "task": "apps.common.tasks.cleanup_idempotency_keys_task",
        "schedule": crontab(hour=3, minute=0),
    },
    "process-pending-emails": {
        "task": "apps.common.tasks.process_pending_emails_task",
        "schedule": 120.0,  # Every 2 minutes — sweep stale pending EmailQueue rows
    },
    "sweep-pending-domain-verifications": {
        "task": "apps.catalog.tasks.sweep_pending_domain_verifications_task",
        "schedule": 300.0,  # Every 5 minutes — re-dispatch committed-but-undispatched domain verification jobs (broker-down recovery, R5.1 / design §6.3/§17)
    },
    "sweep-pending-official-document-jobs": {
        "task": "apps.applications.tasks.official_document_sweep.sweep_pending_official_document_jobs_task",
        "schedule": 300.0,  # Every 5 minutes — re-dispatch committed-but-undispatched official-document generation jobs (broker-down recovery, admissions-v2 task 10.4; R13.11/R17.1/R17.4, design §11.3/§17)
    },
    "reconcile-document-storage": {
        "task": "apps.documents.tasks.reconcile_document_storage_task",
        "schedule": 900.0,  # Every 15 minutes — delete staged document objects whose metadata commit never landed, retry deferred compensation, and mark exhausted rows orphaned (admissions-v2 task 7.3; R11.8/R17.1/R17.4, design §9.3/§17)
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
# Fail closed if the shared cache is unavailable — the in-memory fallback in
# RateLimitMiddleware provides a safety net during Redis outages.
RATELIMIT_FAIL_OPEN = False

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

# Validate JWT signing key is set in non-dev/test environments
_jwt_settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "")
if not SIMPLE_JWT["SIGNING_KEY"] and "test" not in _jwt_settings_module and "dev" not in _jwt_settings_module:
    raise ImproperlyConfigured(
        "JWT_SIGNING_KEY environment variable must be set (non-empty) outside of dev/test environments"
    )

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

# Number of trusted reverse proxies (count from right of X-Forwarded-For)
NUM_PROXIES = int(os.environ.get("NUM_PROXIES", "1"))

# Request body size limits (prevent memory exhaustion attacks)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB for JSON/form data
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB for file uploads

# ---------------------------------------------------------------------------
# Auth cookie settings (subdomain strategy)
# ---------------------------------------------------------------------------

AUTH_COOKIE_DOMAIN = ".beanola.com"
AUTH_COOKIE_SAMESITE = "Lax"  # Same-site subdomains: apply.beanola.com -> api.beanola.com
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_HTTPONLY = True

# ---------------------------------------------------------------------------
# S3/R2 storage via django-storages
# ---------------------------------------------------------------------------

AWS_S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")
AWS_STORAGE_BUCKET_NAME = os.environ.get("S3_BUCKET", "")
AWS_S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY", "")
AWS_S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_KEY", "")
# Host the BROWSER can reach, used only to compute signatures (signing is local,
# so the backend need not reach it). Defaults to the internal endpoint, which is
# the production behaviour (R2 is reachable from both sides).
AWS_S3_PUBLIC_ENDPOINT_URL = (
    os.environ.get("S3_PUBLIC_ENDPOINT_URL", "").strip() or AWS_S3_ENDPOINT_URL
)
if AWS_S3_PUBLIC_ENDPOINT_URL and not AWS_S3_PUBLIC_ENDPOINT_URL.startswith(("http://", "https://")):
    from django.core.exceptions import ImproperlyConfigured as _ImproperlyConfigured

    raise _ImproperlyConfigured("S3_PUBLIC_ENDPOINT_URL must start with http:// or https://")


def _signed_url_ttl_seconds() -> int:
    from django.core.exceptions import ImproperlyConfigured

    raw = os.environ.get("S3_SIGNED_URL_TTL_SECONDS", "").strip()
    if not raw:
        return 900  # 15-minute signed URLs
    try:
        value = int(raw)
    except ValueError:
        value = -1
    if not 10 <= value <= 3600:
        raise ImproperlyConfigured("S3_SIGNED_URL_TTL_SECONDS must be an integer between 10 and 3600")
    return value


AWS_QUERYSTRING_EXPIRE = _signed_url_ttl_seconds()
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
        "anon": "100/min",
        "user": "1000/min",
        "error_report": "5/min",
        "payment_initiate": "6/min",
        "payment_defer": "6/min",
        "payment_verify": "30/min",
        "mobile_money_initiate": "5/min",
        "payment_mobile_money": "6/min",
        "payment_resolve_fee": "30/min",
        "payment_correct": "3/min",
        "payment_risk_flags": "30/min",
        # Document-extraction retry scope (gated by DOCUMENT_EXTRACT_RATE_LIMITS).
        # admissions-v2 task 7.4 retired the ai_admin_summary and
        # ai_student_preview scopes with the endpoints they throttled.
        "document_extract": "5/hour",
        # Public-tracker FAILED attempts per IP (admissions-v2 task 10.5,
        # R13.12 / STU-22). A holder of a valid tracking link never spends this
        # budget — only lookups that resolved nothing do — so it can be far
        # tighter than the coarse 20/10m request budget RateLimitMiddleware
        # already applies to the same path. DRF's own rate grammar (N/period),
        # not django-ratelimit's N/Nm.
        "public_tracking_failure": "10/hour",
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
    "TITLE": "Beanola Platform APIs",
    "DESCRIPTION": """
Creator: Cosmas Kanchepa
Developed by Beanola Technologies - https://beanola.com

The Beanola platform API surface now includes the existing admissions backend plus the implemented
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
    "VERSION": "2.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVERS": [
        {"url": "https://api.beanola.com", "description": "Production"},
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
        "name": "Beanola Admissions Platform Team",
        "email": "admissions@beanola.com",
        "url": "https://beanola.com",
    },
    "LICENSE": {
        "name": "Proprietary",
        "url": "https://beanola.com",
    },
    "TERMS_OF_SERVICE": "https://beanola.com/terms",
    "EXTERNAL_DOCS": {
        "description": "Operator documentation",
        "url": "https://beanola.com/docs/api/",
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
DEFAULT_FROM_EMAIL = os.environ.get('ZOHO_FROM_EMAIL', os.environ.get('EMAIL_FROM', 'admin@beanola.com'))

# Resend (fallback)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "noreply@beanola.com")
ERROR_ALERT_EMAIL = os.environ.get("ERROR_ALERT_EMAIL", "admin@beanola.com")

# ---------------------------------------------------------------------------
# Uptime monitoring — internal health check URL
# ---------------------------------------------------------------------------

HEALTH_CHECK_URL = os.environ.get(
    "HEALTH_CHECK_URL", "https://api.beanola.com/health/ready/"
)

KEEP_ALIVE_URL = os.environ.get(
    "KEEP_ALIVE_URL", "https://api.beanola.com/health/live/"
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
APP_VERSION = os.environ.get("APP_VERSION", "2.0.0")

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
# Optional operator-prefix overrides (comma-separated two-digit MSISDN
# prefixes after +260). Defaults follow the ZICTA numbering plan:
# MTN 96/76, Airtel 97/77. Override only if Lenco routing diverges.
LENCO_MTN_PREFIXES = os.environ.get("LENCO_MTN_PREFIXES", "")
LENCO_AIRTEL_PREFIXES = os.environ.get("LENCO_AIRTEL_PREFIXES", "")

# Vercel AI Gateway
# Jobs-ops AI gateway -- jobs-ops product only, NOT admissions.
#
# admissions-v2 task 7.4 (R11.9; design 9.1: "If jobs-ops retains an AI
# integration, its dependency and settings move behind the jobs-ops boundary so
# admissions has no runtime import"). The only reader is ``apps.jobs.ai_service``
# and its jobs-ops callers. The admissions domain (applications / documents /
# catalog / accounts / common) must not read these, and
# ``tests/unit/test_no_admissions_generative_ai_guard.py`` fails the build if it
# does. The env-var names are unchanged so no deployment has to be re-keyed;
# only the Django setting names moved into the jobs-ops namespace.
JOBS_OPS_AI_GATEWAY_API_KEY = os.environ.get("AI_GATEWAY_API_KEY", "")
JOBS_OPS_AI_GATEWAY_BASE_URL = os.environ.get(
    "AI_GATEWAY_BASE_URL", "https://ai-gateway.vercel.sh/v1"
)
# gemini-2.5-flash: cheap, fast jobs-ops scoring/messaging
JOBS_OPS_AI_MODEL_FAST = os.environ.get("AI_MODEL_FAST", "google/gemini-2.5-flash")
# gpt-4o-mini: structured JSON extraction
JOBS_OPS_AI_MODEL_ANALYSIS = os.environ.get("AI_MODEL_ANALYSIS", "openai/gpt-4o-mini")
# deepseek-v3: complex reasoning
JOBS_OPS_AI_MODEL_SMART = os.environ.get("AI_MODEL_SMART", "deepseek/deepseek-v3")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://apply.beanola.com")
PAYMENT_DEV_BYPASS = os.environ.get("PAYMENT_DEV_BYPASS", "").lower() in (
    "1",
    "true",
    "yes",
)

# ---------------------------------------------------------------------------
# Payment feature flags
# ---------------------------------------------------------------------------
# admissions-v2 task 8.2 removed three of the five payment-hardening flags,
# because each of them selected between two implementations of the same
# behaviour and the duplicate has been deleted:
#
#   PAYMENT_HARDENING_FORWARD_ONLY        → ``PaymentService._transition`` is
#                                           the only mutator (ADR-007).
#   PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT→ ``WebhookEventIdentity`` is the
#                                           only dedup contract (ADR-004).
#   PAYMENT_HARDENING_FORCE_APPROVED      → an admin override is always a
#                                           ``force_approved`` row (ADR-002).
#
# Parity was proven before deletion (tests/unit/test_payment_path_parity_8_2.py,
# docs/v2-evidence/8.2/). Rollback is no longer a flag flip — see
# docs/runbooks/payment-hardening-rollout.md.
#
# What survives is a genuine *policy* switch, not a second code path: it
# chooses how strictly the one payment path is throttled, and both settings
# run the same state machine.
PAYMENT_HARDENING_RATE_LIMITS = os.environ.get(
    "PAYMENT_HARDENING_RATE_LIMITS", ""
).lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# Server-authored fee quotes — admissions-v2 task 8.1 (R12.1, R12.2, R12.6)
# ---------------------------------------------------------------------------
# The backend is the sole authority on money. These settings hold the two inputs
# the frontend used to invent for itself (finding STU-08): how long a quoted price
# stays honourable, and the provider-fee policy that used to be a hardcoded 1% in
# ``PaymentForm.tsx``. Changing the policy here changes what every student is
# quoted — there is no second copy in the client.
#
# TTL: long enough for a student on a weak connection to finish a mobile-money
# approval, short enough that a fee change is not honoured indefinitely.
FEE_QUOTE_TTL_SECONDS = int(os.environ.get("FEE_QUOTE_TTL_SECONDS", "1800"))
# Provider-fee policy. ``percent`` is a percentage of the canonical fee (1.0 == 1%,
# matching the rate Lenco charges and the value the client used to hardcode);
# ``fixed`` is a flat surcharge in the fee currency; ``cap`` (when > 0) bounds the
# computed provider fee. ``bearer`` decides who pays it: ``customer`` adds it to
# the quoted total (the current Lenco collection is sent with bearer=customer),
# ``merchant`` absorbs it so the student is quoted the bare canonical fee.
PAYMENT_PROVIDER_FEE_PERCENT = os.environ.get("PAYMENT_PROVIDER_FEE_PERCENT", "1.0")
PAYMENT_PROVIDER_FEE_FIXED = os.environ.get("PAYMENT_PROVIDER_FEE_FIXED", "0")
PAYMENT_PROVIDER_FEE_CAP = os.environ.get("PAYMENT_PROVIDER_FEE_CAP", "0")
PAYMENT_PROVIDER_FEE_BEARER = os.environ.get(
    "PAYMENT_PROVIDER_FEE_BEARER", "customer"
)
# Quote signing key. Falls back to SECRET_KEY so no deployment needs re-keying to
# get signed quotes; set it explicitly to rotate quote signatures independently of
# session/JWT signing. Bump FEE_QUOTE_SIGNATURE_VERSION when rotating so historical
# rows stay attributable to the key that signed them.
FEE_QUOTE_SIGNING_KEY = os.environ.get("FEE_QUOTE_SIGNING_KEY", "") or SECRET_KEY
FEE_QUOTE_SIGNATURE_VERSION = int(os.environ.get("FEE_QUOTE_SIGNATURE_VERSION", "1"))

# ---------------------------------------------------------------------------
# Document-extraction rate-limit gate
# ---------------------------------------------------------------------------
# admissions-v2 task 7.4 (R11.9) removed the AI_HARDENING_* family together with
# the admissions AI it hardened: the circuit breaker, the prompt redactor, the
# summary cache, and the two summary throttles all went with the endpoints. What
# survives is the one cap that was never about AI -- the per-user ceiling on
# local OCR re-extract calls, which is still a real CPU/DoS lever.
DOCUMENT_EXTRACT_RATE_LIMITS = os.environ.get(
    "DOCUMENT_EXTRACT_RATE_LIMITS", ""
).lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# Public-tracker failed-attempt gate (admissions-v2 task 10.5, R13.12 / STU-22)
# ---------------------------------------------------------------------------
# Defaults to **True**, unlike the two gates above. Those harden authenticated
# endpoints, so shipping them off and flipping them on is a rollout choice; this
# one is the boundary of an *unauthenticated* endpoint, so its absence must not
# be the same as its disablement. An operator can still turn it off explicitly.
PUBLIC_TRACKING_RATE_LIMITS = os.environ.get(
    "PUBLIC_TRACKING_RATE_LIMITS", "true"
).lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# System performance hardening — scoped cache feature flags
# (spec: .kiro/specs/system-performance-hardening). Each defaults to False so
# the pre-feature code path (direct computation, no cache) stays in effect
# until the flag is explicitly flipped. The caches are thin callers of
# ``apps.common.scoped_cache`` and degrade gracefully on any cache error.
# Rollout/blast-radius order: capabilities -> dashboard -> catalog.
# ---------------------------------------------------------------------------

# Gates the per-user capability/scope cache wrapping
# ``GET /api/v1/admin/scope/`` and ``GET /api/v1/admin/capabilities/`` (R5).
PERF_CACHE_CAPABILITIES = os.environ.get(
    "PERF_CACHE_CAPABILITIES", ""
).lower() in ("1", "true", "yes")

# Gates the short-lived admin dashboard aggregate cache on
# ``AdminDashboardView`` (R2).
PERF_CACHE_DASHBOARD = os.environ.get(
    "PERF_CACHE_DASHBOARD", ""
).lower() in ("1", "true", "yes")

# Gates the catalog read-response cache (programs, canonical programs,
# intakes, subjects, assignment-safe responses) (R4).
PERF_CACHE_CATALOG = os.environ.get(
    "PERF_CACHE_CATALOG", ""
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

# RESEND_API_KEY is deliberately absent: Zoho SMTP is the primary sender and
# ``_send_via_resend`` skips itself when the key is unset, so it is optional.
REQUIRED_ENV_VARS = [
    "SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SIGNING_KEY",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
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
            "LOCATION": "beanola-test-cache",
        }
    }

# Enforced after the final settings module is loaded, by
# ``apps.common.apps.CommonConfig.ready()``. Calling the validator while this
# module is still being imported read a half-built settings object and never
# saw REQUIRED_ENV_VARS, so the check silently did nothing (R1-b).
STARTUP_ENV_VALIDATION = False  # prod.py and staging.py turn it on
IS_TEST_PROCESS = _is_testing

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

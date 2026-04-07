"""Base settings shared across all environments."""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers


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
    # 1. Custom security headers (HSTS, X-Content-Type-Options, etc.)
    "apps.common.middleware.SecurityHeadersMiddleware",
    # 2. Django built-in security (SSL redirect, SECURE_PROXY_SSL_HEADER)
    "django.middleware.security.SecurityMiddleware",
    # 3. WhiteNoise for static files
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # 4. CORS enforcement
    "corsheaders.middleware.CorsMiddleware",
    # 5. Request ID generation/propagation
    "apps.common.middleware.RequestIDMiddleware",
    # 6. Per-scope rate limiting
    "apps.common.middleware.RateLimitMiddleware",
    # 7. URL normalization
    "django.middleware.common.CommonMiddleware",
    # 8. JWT authentication from cookies/Bearer
    "apps.common.middleware.JWTAuthenticationMiddleware",
    # 9. Custom CSRF enforcement (X-CSRF-Token header)
    "apps.common.middleware.CSRFEnforcementMiddleware",
    # 10. Audit logging for state-changing operations
    "apps.common.middleware.AuditMiddleware",
    # 11. Read-only mode (disabled by default — activates via READ_ONLY_MODE env var)
    "apps.common.readonly.ReadOnlyMiddleware",
    # 12. Idempotent request processing (Idempotency-Key header)
    "apps.common.idempotency.IdempotencyMiddleware",
    # Django defaults needed for admin
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
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
#   - CONN_MAX_AGE=600 reuses connections within each Uvicorn worker process
#     for up to 10 minutes, reducing connection churn against the Neon pooler.
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
        conn_max_age=600,
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

CELERY_BEAT_SCHEDULE = {
    "check-uptime": {
        "task": "apps.common.tasks.check_uptime_task",
        "schedule": 900.0,  # Every 15 minutes (was 5m — reduced to conserve Upstash free-tier Redis requests)
    },
    "cleanup-audit-logs": {
        "task": "apps.common.tasks.cleanup_audit_logs_task",
        "schedule": crontab(hour=3, minute=0),
    },
    "cleanup-sse-events": {
        "task": "apps.common.tasks.cleanup_sse_events_task",
        "schedule": crontab(hour=4, minute=0),
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
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
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
CORS_ALLOW_HEADERS = list(dict.fromkeys([*default_headers, "cache-control", "last-event-id", "x-csrf-token"]))
CORS_EXPOSE_HEADERS = ["X-CSRF-Token", "X-Request-ID"]
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

# ---------------------------------------------------------------------------
# Auth cookie settings (subdomain strategy)
# ---------------------------------------------------------------------------

AUTH_COOKIE_DOMAIN = ".mihas.edu.zm"
AUTH_COOKIE_SAMESITE = "Lax"  # Production overrides to "None" in prod.py for cross-origin cookie support (api.mihas.edu.zm → apply.mihas.edu.zm)
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_HTTPONLY = True

# ---------------------------------------------------------------------------
# S3/R2 storage via django-storages
# ---------------------------------------------------------------------------

DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
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
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

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
        {"url": "***REMOVED***", "description": "Production"},
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
# Email — Resend
# ---------------------------------------------------------------------------

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "noreply@mihas.edu.zm")
ERROR_ALERT_EMAIL = os.environ.get("ERROR_ALERT_EMAIL", "***REMOVED***")

# ---------------------------------------------------------------------------
# Uptime monitoring — internal health check URL
# ---------------------------------------------------------------------------

HEALTH_CHECK_URL = os.environ.get(
    "HEALTH_CHECK_URL", "***REMOVED***"
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

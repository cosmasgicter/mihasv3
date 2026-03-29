"""Base settings shared across all environments."""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

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
    "storages",
    # Project apps
    "apps.accounts",
    "apps.applications",
    "apps.documents",
    "apps.catalog",
    "apps.common",
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

WSGI_APPLICATION = "config.wsgi.application"

# ---------------------------------------------------------------------------
# Database — Neon Postgres with connection pooling
# ---------------------------------------------------------------------------

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

CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# ---------------------------------------------------------------------------
# JWT — SimpleJWT with shared signing key for dual-run compatibility
# ---------------------------------------------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", ""),
    "ALGORITHM": "HS256",
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ---------------------------------------------------------------------------
# CORS — allowed origins from env var (comma-separated)
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
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
AUTH_COOKIE_SAMESITE = "Lax"
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
# Static files — WhiteNoise
# ---------------------------------------------------------------------------

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
    "TITLE": "MIHAS Admissions API",
    "DESCRIPTION": "Django REST Framework API for the MIHAS admissions portal",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------------------------------------------------------------------------
# Email — Resend
# ---------------------------------------------------------------------------

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "noreply@mihas.edu.zm")

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
)

if REQUIRED_ENV_VARS and not _is_testing:
    from apps.common.env_validator import validate_required_env_vars

    validate_required_env_vars()

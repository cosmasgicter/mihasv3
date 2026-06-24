"""Development settings — relaxed security for local dev."""

import os

from .base import *  # noqa: F401,F403

# ---------------------------------------------------------------------------
# Safety guard: dev settings must NEVER be loaded in a production process.
# ---------------------------------------------------------------------------
if os.environ.get("ENVIRONMENT", "").lower() == "production" or os.environ.get("DJANGO_PRODUCTION_MODE", ""):
    raise RuntimeError(
        "Development settings (config.settings.dev) loaded in a production environment. "
        "Set DJANGO_SETTINGS_MODULE to config.settings.prod instead."
    )

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Use a default secret key for local development
SECRET_KEY = os.environ.get("SECRET_KEY", "insecure-dev-key-change-me")  # noqa: F405

# Relax security for local development
SECURE_HSTS_SECONDS = 0
SECURE_SSL_REDIRECT = False
SECURE_CONTENT_TYPE_NOSNIFF = False
AUTH_COOKIE_SECURE = False
AUTH_COOKIE_DOMAIN = None  # Allow localhost cookies
AUTH_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Allow all CORS origins in development
CORS_ALLOW_ALL_ORIGINS = True

# Database — allow non-SSL connections locally
DATABASES = {
    "default": dj_database_url.config(  # noqa: F405
        default=os.environ.get("DATABASE_URL", "postgres://localhost:5432/beanola"),  # noqa: F405
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=False,
    )
}

# Skip env var validation in development
REQUIRED_ENV_VARS = []

# Local/test payment simulation is still gated by DEBUG in the endpoint.
PAYMENT_DEV_BYPASS = os.environ.get("PAYMENT_DEV_BYPASS", "true").lower() in (  # noqa: F405
    "1",
    "true",
    "yes",
)

# Jobs/Ops backend routes are scaffold-only and must stay opt-in until shipped.
ENABLE_JOBS_OPS_ROUTES = os.environ.get("ENABLE_JOBS_OPS_ROUTES", "false").lower() in (  # noqa: F405
    "1",
    "true",
    "yes",
)

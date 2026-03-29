"""Development settings — relaxed security for local dev."""

from .base import *  # noqa: F401,F403

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
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Allow all CORS origins in development
CORS_ALLOW_ALL_ORIGINS = True

# Database — allow non-SSL connections locally
DATABASES = {
    "default": dj_database_url.config(  # noqa: F405
        default=os.environ.get("DATABASE_URL", "postgres://localhost:5432/mihas"),  # noqa: F405
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=False,
    )
}

# Skip env var validation in development
REQUIRED_ENV_VARS = []

"""Production settings — full security, SSL redirect enabled.

Domain: api.beanola.com (self-hosted EC2 + Caddy)
Frontend: apply.beanola.com / jobs.beanola.com (self-hosted EC2 + Caddy)
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

# Refuse to start when a REQUIRED_ENV_VARS name is missing (checked in CommonConfig.ready()).
STARTUP_ENV_VALIDATION = True

DEBUG = False

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "api.beanola.com").split(",")  # noqa: F405
    if host.strip()
]
validate_debug_not_serving_production_hosts()  # noqa: F405

# Outbound defaults. ``base.py`` defaults these to local or empty values so no
# other settings module can reach a production host; production keeps today's
# values here (task 4.1). Env vars still win.
HEALTH_CHECK_URL = os.environ.get(  # noqa: F405
    "HEALTH_CHECK_URL", "https://api.beanola.com/health/ready/"
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://apply.beanola.com")  # noqa: F405
EMAIL_HOST = os.environ.get("ZOHO_SMTP_HOST", "smtp.zoho.com")  # noqa: F405
# Full security with SSL redirect
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Auth cookie domain — shared across apply.beanola.com and api.beanola.com.
# Env-driven so the platform domain can move without a code change.
AUTH_COOKIE_DOMAIN = os.environ.get("AUTH_COOKIE_DOMAIN", ".beanola.com")  # noqa: F405
AUTH_COOKIE_SAMESITE = "None"
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "None"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = "None"

# Production Lenco integration must not silently use sandbox defaults.
LENCO_API_BASE_URL = os.environ.get("LENCO_API_BASE_URL", "https://api.lenco.co/access/v2/")  # noqa: F405
if not LENCO_API_SECRET_KEY or not LENCO_PUBLIC_KEY:  # noqa: F405
    raise ImproperlyConfigured("LENCO_API_SECRET_KEY and LENCO_PUBLIC_KEY are required in production.")
if not AUDIT_LOG_ENCRYPTION_KEY:  # noqa: F405
    raise ImproperlyConfigured("AUDIT_LOG_ENCRYPTION_KEY is required in production.")

# Payment rate limiting is mandatory in production, so a missing env var cannot
# silently leave the payment endpoints unthrottled. The forward-only,
# strict-dedup, and force-approved flags no longer exist: admissions-v2 task 8.2
# deleted the alternative implementations they used to select, so their
# behaviour is now unconditional.
PAYMENT_HARDENING_RATE_LIMITS = True

# AI hardening is mandatory in production for PII protection. Mirrors the
# payment-hardening pattern: env vars cannot silently leave PII redaction off.
DOCUMENT_EXTRACT_RATE_LIMITS = True

# Production log volume: sample healthy 200s at 10%. Slow requests (>1s)
# and 4xx/5xx responses are always logged regardless of sample rate.
# Override via the REQUEST_METRIC_SAMPLE_RATE env var, which still wins.
#
# This is a SETTING, not an ``os.environ.setdefault``. Until task 13.6
# remediation M2 it was the latter, and that made *importing* this module — which
# is inspection, not activation — silently re-sample every ``MetricsMiddleware``
# constructed later in the same process. One test does exactly that import
# (``tests/property/test_production_cors_pagination_fix_exploration.py:78``), and
# on the day its environment-conditional skip stopped firing, two unrelated
# metrics properties in ``tests/property/test_production_readiness_metrics.py``
# began measuring 0.1 instead of the 1.0 they assert under. Measured, with the
# mechanism and the 1.0 -> 0.1 / 200-of-200 -> 26-of-200 readings, in
# docs/v2-evidence/13.6/remediation/M1-M2/raw/11-m2-mechanism.txt.
#
# The env var keeps precedence so an operator override behaves exactly as it did
# under ``setdefault``; ``MetricsMiddleware`` resolves env first, then this
# setting, then 1.0.
REQUEST_METRIC_SAMPLE_RATE = 0.1

# CORS — production frontend only (explicit origins, no regexes)
CORS_ALLOWED_ORIGINS = split_csv_env(  # noqa: F405
    "CORS_ALLOWED_ORIGINS",
    "https://apply.beanola.com,https://api.beanola.com,https://jobs.beanola.com,https://beanola.com,https://www.beanola.com",
)
CORS_ALLOWED_ORIGIN_REGEXES = []
CORS_ALLOW_ALL_ORIGINS = False

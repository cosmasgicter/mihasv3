"""Staging settings — production-like with full security."""

from .base import *  # noqa: F401,F403

# Refuse to start when a REQUIRED_ENV_VARS name is missing (checked in CommonConfig.ready()).
STARTUP_ENV_VALIDATION = True

DEBUG = False

# Staging should exercise the same payment posture as production. The
# forward-only, strict-dedup, and force-approved flags were deleted with their
# duplicate implementations in admissions-v2 task 8.2.
PAYMENT_HARDENING_RATE_LIMITS = True

# AI hardening is mandatory in production for PII protection. Mirrors the
# payment-hardening pattern: env vars cannot silently leave PII redaction off.
DOCUMENT_EXTRACT_RATE_LIMITS = True

# Staging names its own frontend and health-check host; there is no default, and
# startup validation refuses to start without them (task 4.1).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")  # noqa: F405
HEALTH_CHECK_URL = os.environ.get("HEALTH_CHECK_URL", "")  # noqa: F405
REQUIRED_ENV_VARS = [*REQUIRED_ENV_VARS, "FRONTEND_URL", "HEALTH_CHECK_URL"]  # noqa: F405
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "").split(",")  # noqa: F405
    if host.strip()
]
validate_debug_not_serving_production_hosts()  # noqa: F405

# Full security enabled
SECURE_SSL_REDIRECT = False  # TLS terminated at load balancer
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Cookie domain - staging uses its own subdomain, not the production apex.
_staging_domain = os.environ.get("COOKIE_DOMAIN", "")  # noqa: F405
if _staging_domain:
    SESSION_COOKIE_DOMAIN = _staging_domain
    AUTH_COOKIE_DOMAIN = _staging_domain
    CSRF_COOKIE_DOMAIN = _staging_domain

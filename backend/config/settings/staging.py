"""Staging settings — production-like with full security."""

from .base import *  # noqa: F401,F403

DEBUG = False

# Staging should exercise the same payment-hardening posture as production.
PAYMENT_HARDENING_FORWARD_ONLY = True
PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT = True
PAYMENT_HARDENING_RATE_LIMITS = True
PAYMENT_HARDENING_FORCE_APPROVED = True

# AI hardening is mandatory in production for PII protection. Mirrors the
# payment-hardening pattern: env vars cannot silently leave PII redaction off.
AI_HARDENING_CIRCUIT_BREAKER = True
AI_HARDENING_RATE_LIMITS = True
AI_HARDENING_CACHE = True
AI_HARDENING_REDACTION = True

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

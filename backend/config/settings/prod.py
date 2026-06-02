"""Production settings — full security, SSL redirect enabled.

Domain: api.mihas.edu.zm (Koyeb)
Frontend: apply.mihas.edu.zm (Vercel)
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "api.mihas.edu.zm").split(",")  # noqa: F405
    if host.strip()
]
validate_debug_not_serving_production_hosts()  # noqa: F405

# Full security with SSL redirect
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Auth cookie domain — shared across apply.mihas.edu.zm and api.mihas.edu.zm
AUTH_COOKIE_DOMAIN = ".mihas.edu.zm"
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

# Payment hardening is mandatory in production. These settings intentionally
# override the rollout flags from base.py so a missing env var cannot silently
# leave the legacy payment paths active.
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

# Production log volume: sample healthy 200s at 10%. Slow requests (>1s)
# and 4xx/5xx responses are always logged regardless of sample rate.
# Override via REQUEST_METRIC_SAMPLE_RATE env var if needed.
import os as _os  # noqa: E402
_os.environ.setdefault("REQUEST_METRIC_SAMPLE_RATE", "0.1")

# CORS — production frontend only (explicit origins, no regexes)
CORS_ALLOWED_ORIGINS = split_csv_env(  # noqa: F405
    "CORS_ALLOWED_ORIGINS",
    "https://apply.mihas.edu.zm,https://api.mihas.edu.zm,https://jobs.mihas.edu.zm,https://mihas.edu.zm,https://www.mihas.edu.zm,https://katc.edu.zm,https://www.katc.edu.zm,https://beanola.com,https://www.beanola.com",
)
CORS_ALLOWED_ORIGIN_REGEXES = []
CORS_ALLOW_ALL_ORIGINS = False

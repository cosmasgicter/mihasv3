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

# CORS — production frontend only
CORS_ALLOWED_ORIGINS = split_csv_env(  # noqa: F405
    "CORS_ALLOWED_ORIGINS",
    "***REMOVED***",
)
CORS_ALLOWED_ORIGIN_REGEXES = split_csv_env(  # noqa: F405
    "CORS_ALLOWED_ORIGIN_REGEXES",
    (
        r"^https://([A-Za-z0-9-]+\.)*beanola\.com$,"
        r"^https://([A-Za-z0-9-]+\.)*mihas\.edu\.zm$,"
        r"^https://([A-Za-z0-9-]+\.)*katc\.edu\.zm$"
    ),
)
CORS_ALLOW_ALL_ORIGINS = False

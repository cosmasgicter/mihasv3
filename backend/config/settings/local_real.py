"""Local production-parity settings — staging posture over http://localhost.

Purpose: run the most production-realistic stack possible on a developer
machine WITHOUT the two things that break on plain-HTTP localhost:
  - SSL redirect loops
  - Secure-only cookies (browser drops them on http://)

It inherits the full staging security + payment/AI hardening posture, then
relaxes ONLY transport-level flags that require HTTPS. Everything else
(payment forward-only, webhook dedup, rate limits, AI redaction, DRF renderers,
CSRF enforcement) stays exactly as production runs it.

This module is for LOCAL TESTING ONLY. It is never used in production
(prod uses config.settings.prod). It is safe because:
  - DEBUG stays False (production-like error handling)
  - it points at the local throwaway DB via DATABASE_URL in .env.local.real
  - Lenco stays on the sandbox base URL (test money only)
"""

from .staging import *  # noqa: F401,F403  (inherits prod-parity hardening flags)

# --- Transport: localhost is plain HTTP, so disable HTTPS-only behaviours ---
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# Cookies must work over http://localhost (Secure cookies are dropped on http).
AUTH_COOKIE_SECURE = False
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_DOMAIN = None          # host-only cookie for localhost
SESSION_COOKIE_SECURE = False
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_DOMAIN = None
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_DOMAIN = None

# Local hosts + CSRF trusted origins (frontend dev server + local API).
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get(  # noqa: F405
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,web,testserver",
    ).split(",")
    if h.strip()
]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get(  # noqa: F405
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if o.strip()
]

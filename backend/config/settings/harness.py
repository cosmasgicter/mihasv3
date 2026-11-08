"""Isolated local V2 E2E harness settings.

This module powers the disposable local release harness described in
``.kiro/specs/admissions-v2-canonical-rebuild`` design section 16 and
requirement R18.1. It is NEVER used in production (production uses
``config.settings.prod``) and it never talks to Neon, Cloudflare R2, Zoho,
Resend, or the real Lenco gateway.

Posture
-------
It inherits the production-parity ``local_real`` posture (full security,
payment/AI hardening ON, cookies that work over plain-HTTP localhost) and then
repoints every *external* dependency at a local, deterministic substitute:

* object storage -> MinIO (S3-compatible) at ``S3_ENDPOINT_URL``
* email          -> Mailpit SMTP sink (a console/test inbox) at ``EMAIL_HOST``
* payment        -> the deterministic Lenco-compatible adapter at
                    ``LENCO_API_BASE_URL`` (``harness/adapters``)
* domain DNS     -> the deterministic domain adapter at
                    ``HARNESS_DOMAIN_ADAPTER_URL`` (``harness/adapters``)

Everything else (canonical services, DRF renderers, CSRF enforcement, capability
authorization, forward-only payments, webhook dedup) runs exactly as production
does, so a browser journey against this harness exercises real behaviour rather
than a mocked shortcut.

All values are local/deterministic. There are no production credentials here.
"""

import os

from .local_real import *  # noqa: F401,F403  (prod-parity posture over http://localhost)

# ---------------------------------------------------------------------------
# Hosts — neutral Beanola context + two example tenant hosts, all on *.localhost
# ---------------------------------------------------------------------------
# ``*.localhost`` resolves to the loopback address in Chromium/Playwright and
# most resolvers without any /etc/hosts editing, so the two tenant hosts and the
# neutral shared-portal host all reach the harness edge proxy (Caddy).
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "ALLOWED_HOSTS",
        # neutral host, loopback, the compose service names, and the two
        # example tenant hosts used by the two-tenant isolation journeys.
        "localhost,127.0.0.1,web,caddy,testserver,"
        ".localhost,mihas.localhost,katc.localhost",
    ).split(",")
    if h.strip()
]

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CSRF_TRUSTED_ORIGINS",
        # Caddy edge (8090) plus the direct backend port (8000) for API helpers.
        "http://localhost:8090,http://127.0.0.1:8090,"
        "http://mihas.localhost:8090,http://katc.localhost:8090,"
        "http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if o.strip()
]

# The harness is a closed local network; allow all CORS origins so the API
# helpers and the edge proxy can call the backend from any *.localhost host.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Coarse IP-keyed rate limiting -> OFF. Per-user payment throttles stay ON.
# ---------------------------------------------------------------------------
# ``RateLimitMiddleware`` (apps/common/middleware.py) budgets by **client IP**
# (``get_client_ip``: the real client behind a trusted proxy, so production keys
# each applicant separately since SJR R3-a):
# ``/auth/login/`` 10/5m, ``/auth/register/`` 5/5m, ``/payments/`` 60/10m, and so
# on. That is correct in production, where each applicant arrives from their own
# address. It cannot mean the same thing here: every request in this harness —
# every student, the platform admin, and the browser itself — arrives through one
# Caddy container, so the whole required journey matrix collapses onto a single
# budget and a later journey is refused 429 for something an earlier journey did.
#
# That refusal tests the harness topology, not the platform. ``config.settings.test``
# already makes this same call (``RATELIMIT_ENABLE = False``) for the same reason.
#
# What is NOT relaxed: ``PAYMENT_HARDENING_RATE_LIMITS`` stays ``True`` (inherited
# from ``staging``), so ``PaymentUserScopedRateThrottle`` — the throttle that is
# keyed per **user** and therefore still means in a harness what it means in
# production — remains active on initiate / mobile-money / verify / resolve-fee.
# The per-user budget is the one payment hardening actually relies on
# (``docs/runbooks/payment-hardening-rollout.md``); the IP budget is the coarse
# outer layer this topology cannot reproduce.
RATELIMIT_ENABLE = False

# ---------------------------------------------------------------------------
# Email -> Mailpit (console/test inbox). Never Zoho, never Resend.
# ---------------------------------------------------------------------------
# base.py defaults to SSL on port 465 (Zoho). Mailpit speaks plain SMTP on 1025.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "mailpit")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "1025"))
EMAIL_USE_SSL = False
EMAIL_USE_TLS = False
EMAIL_HOST_USER = ""
EMAIL_HOST_PASSWORD = ""
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.environ.get("EMAIL_FROM", "no-reply@harness.beanola.local")
# Belt-and-braces: keep the Resend fallback disabled in the harness.
RESEND_API_KEY = ""

# ---------------------------------------------------------------------------
# Deterministic domain-verification adapter (harness/adapters).
# ---------------------------------------------------------------------------
# When set, ``apps.catalog.tasks._lookup_dns_records`` resolves published DNS
# records from this adapter instead of the real network. Absent in every other
# settings module, so production keeps using real DNS.
HARNESS_DOMAIN_ADAPTER_URL = os.environ.get(
    "HARNESS_DOMAIN_ADAPTER_URL", "http://adapters:9099/dns"
)

# ---------------------------------------------------------------------------
# Deterministic payment adapter (harness/adapters) — same Lenco contract.
# ---------------------------------------------------------------------------
# LENCO_API_BASE_URL / LENCO_API_SECRET_KEY come from the harness env file and
# point at the local adapter; the real PaymentService/webhook code is unchanged.
# The real deterministic-provider path is exercised, so PAYMENT_DEV_BYPASS stays
# OFF (no simulated shortcut).
PAYMENT_DEV_BYPASS = False

# ---------------------------------------------------------------------------
# Internal health check target (used by check_uptime_task) -> local backend.
# ---------------------------------------------------------------------------
HEALTH_CHECK_URL = os.environ.get(
    "HEALTH_CHECK_URL", "http://web:8000/health/ready/"
)

# The neutral platform frontend URL used when generating tenant-agnostic links.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8090")

# Verification base used when minting new tenant-domain DNS targets locally.
TENANT_DOMAIN_VERIFICATION_BASE = os.environ.get(
    "TENANT_DOMAIN_VERIFICATION_BASE", "verify.harness.localhost"
)

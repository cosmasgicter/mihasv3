"""Centralized tenant/platform frontend URL generation for transactional emails.

This module is the single source of truth for constructing links that appear in
outbound emails (password reset, duplicate registration, acceptance letters,
submission confirmations, etc.). It resolves the correct base URL from:

1. A resolved tenant domain (e.g. ``apply.mihas.edu.zm``) if the email is sent
   in a tenant context with an active domain.
2. The ``FRONTEND_URL`` environment setting (default ``https://apply.beanola.com``)
   as the neutral Beanola platform fallback.

This ensures:
- No hardcoded URLs scattered across views and email templates.
- Tenant-aware links when the recipient belongs to a resolved tenant context.
- Correct, registered frontend route paths only.
- A single place to update when routes change.

Decision (Task 1.6, STU-21, R9.7): Email verification is NOT implemented, and
the contract is deliberately REMOVED rather than built. There is no
verify-email endpoint, no verify-email frontend route, no EmailVerification
model/token, and no enforcement at login or submission (verified by grep in
docs/v2-evidence/1.6/). Verification copy has been removed from the frontend
(SignUpPage helper text, landing "how it works" step) and email templates.

The ``email_verified`` column on ``profiles`` is a retained legacy column
(backward data compatibility — existing rows keep it). It is written ``True``
on registration going forward so no new row is left NULL/ambiguous, and it is
read by nothing. It is registered as a Legacy_Exception with owner and removal
date in ``docs/v2-evidence/1.6/legacy-exception-email_verified.md``.

See: R9.7, R15.6, findings STU-21/STU-24.
"""

import logging
from urllib.parse import quote, urlencode, urljoin

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Registered frontend route paths (must match apps/admissions/src/routes/)
# ---------------------------------------------------------------------------

# Auth routes
ROUTE_SIGNIN = "/auth/signin"
ROUTE_SIGNUP = "/auth/signup"
ROUTE_FORGOT_PASSWORD = "/auth/forgot-password"
ROUTE_RESET_PASSWORD = "/auth/reset-password"
# Staff invitation acceptance (task 4.2). The invited tenant admin/reviewer sets
# their own password by consuming a single-use token — the admin never sets or
# sees a password (R4.3). Must match the frontend route
# apps/admissions/src/routes/routeRegistry.ts → authAcceptInvitation.
ROUTE_ACCEPT_INVITATION = "/auth/accept-invitation"

# Student routes (canonical destinations for authenticated student links).
# The student application detail route is ``/student/application/:id`` — there
# is no bare ``/student/application`` or ``/student`` route, so email links that
# want "go to my application area" resolve to the dashboard, the canonical
# student workspace entry point.
ROUTE_STUDENT_DASHBOARD = "/student/dashboard"
ROUTE_STUDENT_PAYMENT = "/student/payment"
ROUTE_STUDENT_INTERVIEW = "/student/interview"

# Public routes. The canonical public tracker route is ``/track-application``
# (see apps/admissions/src/routes/routeRegistry.ts → publicTrackApplication);
# there is no ``/track`` route.
ROUTE_HOME = "/"
ROUTE_TRACK_APPLICATION = "/track-application"


def _get_platform_base_url() -> str:
    """Return the neutral Beanola platform base URL (env-driven)."""
    url = getattr(settings, "FRONTEND_URL", "") or "https://apply.beanola.com"
    return url.rstrip("/")


def platform_base_url() -> str:
    """Public: the neutral Beanola platform base URL (no trailing slash).

    Use this as the single source of truth for the neutral platform host in
    email bodies instead of hardcoding ``https://apply.beanola.com``.
    """
    return _get_platform_base_url()


def _get_tenant_base_url(institution=None) -> str:
    """Resolve the frontend base URL for a given institution context.

    If the institution has an active, primary domain configured, uses that
    domain (with https). Otherwise falls back to the platform base URL.

    This ensures emails sent to students at a tenant school contain links
    that resolve to the correct tenant context.
    """
    if institution is None:
        return _get_platform_base_url()

    # Try to resolve active primary domain for the institution
    try:
        from apps.catalog.models import InstitutionDomain

        domain = InstitutionDomain.objects.filter(
            institution=institution,
            is_active=True,
            is_primary=True,
            status="active",
        ).first()

        if domain and domain.hostname:
            return f"https://{domain.hostname}"
    except Exception:
        # If InstitutionDomain model doesn't exist yet or query fails,
        # fall back to platform URL. Never break email delivery.
        logger.debug(
            "Could not resolve tenant domain for institution=%s, using platform URL",
            getattr(institution, "id", None),
        )

    # Check institution website as secondary fallback
    website = getattr(institution, "website", None)
    if website and isinstance(website, str) and website.strip():
        url = website.strip()
        if url.startswith("http"):
            return url.rstrip("/")

    return _get_platform_base_url()


def _build_url(base_url: str, path: str, **params) -> str:
    """Construct a full URL from base, path, and optional query params."""
    full_url = f"{base_url}{path}"
    if params:
        # Filter out None values
        clean_params = {k: v for k, v in params.items() if v is not None}
        if clean_params:
            full_url = f"{full_url}?{urlencode(clean_params)}"
    return full_url


# ---------------------------------------------------------------------------
# Public API — use these in views/services that send emails
# ---------------------------------------------------------------------------


def password_reset_url(token: str, institution=None) -> str:
    """Generate the password reset link for an email.

    Args:
        token: The raw (unhashed) password reset token.
        institution: Optional institution for tenant-aware URL resolution.

    Returns:
        Full URL to the frontend reset-password page with token param.
    """
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_RESET_PASSWORD, token=token)


def staff_invitation_url(token: str, institution=None) -> str:
    """Generate the staff-invitation acceptance link for an email (task 4.2, R4.3).

    Args:
        token: The raw (unhashed) single-use invitation token. Only ever placed
            in this emailed link — never returned to the browser, logged, or
            persisted in plaintext.
        institution: The tenant the staff member is being scoped to, for
            tenant-aware URL resolution (active verified domain → website →
            neutral Beanola platform).

    Returns:
        Full URL to the frontend accept-invitation page with the token param.
    """
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_ACCEPT_INVITATION, token=token)


def signin_url(institution=None) -> str:
    """Generate the sign-in link for an email."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_SIGNIN)


def signup_url(institution=None) -> str:
    """Generate the sign-up link for an email."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_SIGNUP)


def forgot_password_url(institution=None) -> str:
    """Generate the forgot-password link for an email."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_FORGOT_PASSWORD)


def student_dashboard_url(institution=None) -> str:
    """Generate the student dashboard link for an email (canonical workspace)."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_STUDENT_DASHBOARD)


def student_payment_url(institution=None) -> str:
    """Generate the student payment page link for an email."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_STUDENT_PAYMENT)


def student_interview_url(institution=None) -> str:
    """Generate the student interview page link for an email."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_STUDENT_INTERVIEW)


def tenant_base_url(institution=None) -> str:
    """Public: the resolved base URL for a tenant (or the neutral platform).

    Resolution order (trusted tenant/platform configuration, R9.7):
    active verified tenant domain → institution website → neutral Beanola
    platform URL. Passing ``institution=None`` (neutral/unresolved context)
    returns the neutral platform base. This is the single resolver every
    transactional email should use for its base URL.
    """
    return _get_tenant_base_url(institution)


def portal_url(institution=None) -> str:
    """Generate the main portal link (used as the generic CTA in emails).

    Alias of :func:`tenant_base_url` retained for existing callers.
    """
    return _get_tenant_base_url(institution)


def track_application_url(tracking_code: str, institution=None) -> str:
    """Generate the public application tracking link (``/track-application``)."""
    base = _get_tenant_base_url(institution)
    return _build_url(base, ROUTE_TRACK_APPLICATION, code=tracking_code)

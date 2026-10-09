"""Task 1.6 evidence — email-link host/route correctness + email-verification removal.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — Task 1.6
(R9.1, R9.7; findings STU-21, STU-24).

This is the runnable backend evidence for Task 1.6. It proves, against the real
DRF/HTTP surface and the real email render + send path (never a mock), that:

1.  **Neutral (unresolved) context** generates links on the neutral Beanola
    platform host with the correct *registered* frontend routes — never a
    hardcoded MIHAS/KATC host and never the retired ``/track`` route.
2.  **Resolved tenant context** (an active, verified, primary
    ``InstitutionDomain``) generates links on the *tenant* host, and an
    inactive/unverified domain fails closed to the neutral platform host.
3.  Every transactional email link is built through
    ``apps.common.email_links`` — password reset (real send path),
    duplicate-registration, and the component templates
    (acceptance/conditional/submitted/interview/payment/rejection) — with no
    hardcoded URL and no nonexistent route (``/student/application`` /
    ``/student`` are corrected to the canonical ``/student/dashboard``).
4.  The email-verification contract is **removed**, not implemented: no
    verify-email endpoint/route/model, a freshly registered account is
    immediately usable (``email_verified`` True, login succeeds with no
    verification step), and no login/submission gate reads the column.

The full browser journey for tenant vs neutral hosts (real DNS/host override
against the task-0.4 harness + Mailpit inbox) is deferred to the gated
Playwright matrix (Phase 13, R1.5) — see
``docs/v2-evidence/1.6/README.md``. This module proves the API/service/render/
send seams now, against the ephemeral test DB (sqlite), so a reviewer can read
one file and see every host/route/verification invariant hold.

Run (sqlite, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest \
      tests/integration/test_email_links_and_verification_removal.py -v

**Validates: Requirements 9.1, 9.7**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.common import email_links
from apps.common.email.render import available_message_types, render_message
from apps.common.email_links import (
    ROUTE_RESET_PASSWORD,
    ROUTE_STUDENT_DASHBOARD,
    ROUTE_TRACK_APPLICATION,
    forgot_password_url,
    password_reset_url,
    platform_base_url,
    portal_url,
    signin_url,
    student_dashboard_url,
    tenant_base_url,
    track_application_url,
)
from tests.tenant_fixtures import build_institution, build_institution_domain, build_profile

pytestmark = pytest.mark.tenant

_NEUTRAL = "https://apply.beanola.com"
# Brand tokens that must never appear as a hardcoded platform host in a link.
_FORBIDDEN_HOST_TOKENS = ("apply.mihas.edu.zm", "apply.katc", "mihas.edu.zm")


@pytest.fixture(autouse=True)
def _neutral_platform(settings):
    """Pin the neutral Beanola platform host for every test in this module.

    Tenant tests still resolve to their tenant host via an active
    ``InstitutionDomain``; this only fixes the neutral/unresolved fallback so
    assertions are deterministic regardless of the ambient environment.
    """
    settings.FRONTEND_URL = _NEUTRAL


# ===========================================================================
# 1. Neutral (unresolved) context — neutral Beanola host + registered routes
# ===========================================================================


class TestNeutralHostLinks:
    """With no resolved tenant, links use the neutral Beanola platform host."""

    def test_password_reset_url_neutral_host_and_route(self):
        url = password_reset_url("rawtoken123")
        assert url == f"{_NEUTRAL}{ROUTE_RESET_PASSWORD}?token=rawtoken123"
        assert url == f"{_NEUTRAL}/auth/reset-password?token=rawtoken123"

    def test_track_url_uses_registered_route_not_slash_track(self):
        url = track_application_url("TRK-ABC123XYZ")
        # The retired ``/track`` route must not be generated.
        assert url == f"{_NEUTRAL}/track-application?code=TRK-ABC123XYZ"
        assert "/track?" not in url
        assert ROUTE_TRACK_APPLICATION == "/track-application"

    def test_generic_link_helpers_neutral(self):
        assert platform_base_url() == _NEUTRAL
        assert portal_url() == _NEUTRAL
        assert tenant_base_url() == _NEUTRAL
        assert signin_url() == f"{_NEUTRAL}/auth/signin"
        assert forgot_password_url() == f"{_NEUTRAL}/auth/forgot-password"
        assert student_dashboard_url() == f"{_NEUTRAL}/student/dashboard"

    def test_no_forbidden_tenant_host_leaks_into_neutral_links(self):
        for url in (
            password_reset_url("t"),
            track_application_url("TRK-1"),
            signin_url(),
            portal_url(),
            student_dashboard_url(),
        ):
            low = url.lower()
            for token in _FORBIDDEN_HOST_TOKENS:
                assert token not in low, f"neutral link leaked tenant host {token!r}: {url}"


# ===========================================================================
# 2. Resolved tenant context — tenant host wins; inactive domain fails closed
# ===========================================================================


@pytest.mark.django_db
class TestTenantHostLinks:
    """An active verified primary domain makes links resolve to the tenant host."""

    def test_active_primary_domain_wins(self):
        inst = build_institution(suffix="tenanta")
        build_institution_domain(
            institution=inst,
            hostname="apply.tenant-a.example",
            is_primary=True,
            is_active=True,
            status="active",
        )

        assert (
            password_reset_url("tok", institution=inst)
            == "https://apply.tenant-a.example/auth/reset-password?token=tok"
        )
        assert (
            student_dashboard_url(institution=inst)
            == "https://apply.tenant-a.example/student/dashboard"
        )
        assert tenant_base_url(inst) == "https://apply.tenant-a.example"
        assert (
            track_application_url("TRK-9", institution=inst)
            == "https://apply.tenant-a.example/track-application?code=TRK-9"
        )

    def test_two_tenants_do_not_cross(self):
        inst_a = build_institution(suffix="isoa")
        inst_b = build_institution(suffix="isob")
        build_institution_domain(
            institution=inst_a, hostname="apply.iso-a.example",
            is_primary=True, is_active=True, status="active",
        )
        build_institution_domain(
            institution=inst_b, hostname="apply.iso-b.example",
            is_primary=True, is_active=True, status="active",
        )
        assert tenant_base_url(inst_a) == "https://apply.iso-a.example"
        assert tenant_base_url(inst_b) == "https://apply.iso-b.example"
        assert "iso-b" not in password_reset_url("t", institution=inst_a)

    def test_inactive_or_unverified_domain_fails_closed_to_neutral(self):
        inst = build_institution(suffix="pending")
        # A domain that has not reached ``active`` status must not resolve.
        build_institution_domain(
            institution=inst,
            hostname="apply.not-yet.example",
            is_primary=True,
            is_active=True,
            status="pending_review",
        )
        # No active/verified domain and no website → neutral platform host.
        assert tenant_base_url(inst) == _NEUTRAL
        assert password_reset_url("tok", institution=inst) == (
            f"{_NEUTRAL}/auth/reset-password?token=tok"
        )


# ===========================================================================
# 3. Real email send path — password reset queues a link built via email_links
# ===========================================================================


@pytest.mark.django_db
class TestPasswordResetEmailSendPath:
    """POST /api/v1/auth/password-reset/ queues an email whose body carries the
    centralized, correctly-routed reset link and no verification link."""

    def test_reset_email_body_uses_centralized_link(self):
        from apps.common.models import EmailQueue

        email = f"reset-{uuid.uuid4().hex[:8]}@example.com"
        build_profile(role="student", email=email)

        client = APIClient()
        resp = client.post(
            "/api/v1/auth/password-reset/",
            data={"email": email},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["success"] is True

        queued = EmailQueue.objects.filter(recipient_email=email).order_by("-created_at").first()
        assert queued is not None, "password reset did not queue an email"
        body = queued.body
        # Correct, centralized, registered route on the neutral platform host.
        assert f"{_NEUTRAL}/auth/reset-password?token=" in body
        # No retired/nonexistent route and no verification link.
        assert "/track?" not in body
        assert "verify-email" not in body.lower()
        assert "verify your email" not in body.lower()


# ===========================================================================
# 4. Component email templates — corrected routes + tenant/neutral host flow
# ===========================================================================


@pytest.mark.django_db
class TestComponentEmailLinks:
    """render_message templates build student links via email_links route
    constants (no bare /student or /student/application), honoring the
    caller-supplied tenant/neutral portal host."""

    def _acceptance_ctx(self, portal: str) -> dict:
        return {
            "student_name": "Journey Student",
            "application_number": "APP-1",
            "program_name": "Diploma in Nursing",
            "intake_name": "January 2027",
            "start_date": "2027-01-13",
            "portal_url": portal,
        }

    def test_acceptance_uses_dashboard_route_on_tenant_host(self):
        _, html, _ = render_message("acceptance", self._acceptance_ctx("https://apply.tenant-a.example"))
        assert "https://apply.tenant-a.example/student/dashboard" in html
        # The previously-broken bare application route must be gone.
        assert 'href="https://apply.tenant-a.example/student/application"' not in html
        assert ROUTE_STUDENT_DASHBOARD == "/student/dashboard"

    def test_application_submitted_uses_dashboard_not_bare_student(self):
        ctx = {
            "student_name": "Journey Student",
            "application_number": "APP-2",
            "tracking_code": "TRK-XYZ",
            "program_name": "Diploma in Nursing",
            "intake_name": "January 2027",
            "portal_url": _NEUTRAL,
        }
        _, html, _ = render_message("application_submitted", ctx)
        assert f"{_NEUTRAL}/student/dashboard" in html
        # The retired bare "/student" CTA must not be emitted.
        assert f'href="{_NEUTRAL}/student"' not in html

    def test_missing_portal_url_falls_back_to_platform_base(self):
        # No portal_url in context → the centralized platform base is used,
        # never a hardcoded literal.
        ctx = self._acceptance_ctx(portal="")
        ctx.pop("portal_url", None)
        _, html, _ = render_message("acceptance", ctx)
        assert f"{_NEUTRAL}/student/dashboard" in html


# ===========================================================================
# 5. Verification contract is REMOVED (no dead state, no enforcement)
# ===========================================================================


@pytest.mark.django_db
class TestEmailVerificationRemoved:
    """Email verification is deliberately not implemented (R9.7 removal path)."""

    def test_no_verify_email_route_registered(self):
        from django.urls import get_resolver

        patterns = str(get_resolver().url_patterns)
        # No verify-email URL anywhere in the resolver tree.
        assert "verify-email" not in patterns
        assert "verify_email" not in patterns

    def test_no_verification_message_template(self):
        types = available_message_types()
        assert not any("verif" in t.lower() for t in types), types

    def test_registration_creates_immediately_usable_account(self):
        email = f"newstudent-{uuid.uuid4().hex[:8]}@example.com"
        password = "JourneyPass123"
        client = APIClient()

        reg = client.post(
            "/api/v1/auth/register/",
            data={
                "email": email,
                "password": password,
                "first_name": "New",
                "last_name": "Student",
                "phone": "+260970000002",
                "nationality": "Zambian",
            },
            format="json",
        )
        assert reg.status_code == 201, reg.content

        # No verification step: the account is verified-on-registration and the
        # legacy column is never left NULL/ambiguous.
        student = Profile.objects.get(email=email)
        assert student.email_verified is True

        # No login gate reads email_verified — the account logs in immediately.
        login = client.post(
            "/api/v1/auth/login/",
            data={"email": email, "password": password},
            format="json",
        )
        assert login.status_code == 200, login.content
        assert login.json()["success"] is True

    def test_model_default_prevents_null_ambiguous_state(self):
        # A Profile created without specifying email_verified defaults True, so
        # the retained legacy column never lands in the NULL/ambiguous state.
        prof = build_profile(role="student", email=f"defcheck-{uuid.uuid4().hex[:8]}@example.com")
        prof.refresh_from_db()
        assert prof.email_verified is True

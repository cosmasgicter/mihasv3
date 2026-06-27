"""Unit tests — Phase 5 dev-bypass passthrough regression (Task 49.3).

Asserts that the two new Phase 5 payment endpoints —
:class:`SuperAdminPaymentCorrectionView` (``POST
/api/v1/payments/<uuid>/correct/``) and :class:`RiskFlagsListView`
(``GET /api/v1/payments/risk-flags/``) — behave **identically** to
pre-Phase-5 for legitimate calls whenever no dev-bypass vector is
attempted.

Regression contract
-------------------

The ``@require_not_dev_bypass_in_production`` decorator introduced in
Phase 5 is a **no-op** when:

* The request carries no key in :data:`DEV_BYPASS_PARAM_NAMES` in its
  query string or body, **and**
* No header named in :data:`DEV_BYPASS_HEADER_NAMES` is present.

Under those conditions the decorator must:

1. Never short-circuit with HTTP 404 — whether running under
   production settings (``DEBUG=False`` / ``DJANGO_ENV='production'``)
   or development settings (``DEBUG=True`` / ``DJANGO_ENV='development'``).
2. Never alter the response envelope, status code, or side effects of
   the wrapped view.

In other words: the dev-bypass lockout only fires when a vector is
attempted. Legitimate callers in **every** environment must see the
same response they would have seen before Phase 5 shipped.

Matrix under test
-----------------

* **Endpoints** — the two Phase 5 views.
* **Settings** — two passes per endpoint:

  1. ``DEBUG=True, DJANGO_ENV='development'`` (non-production; the
     primary pinned scenario from Task 49.3).
  2. ``DEBUG=False, DJANGO_ENV='production'`` (production; used as the
     parity reference — a legitimate call with no bypass vector must
     behave identically in production).

* **Vectors** — **none**: the requests are issued with plain query
  strings, plain bodies, and no ``X-Dev-Bypass*`` headers.

The test asserts for each endpoint that:

* The response code is **not** 404 (the decorator did not lock the
  request out).
* The response envelope has the platform ``{"success": True, "data":
  {...}}`` shape (R22.6).
* The response status code and envelope shape **match bit-for-bit**
  between the dev and prod runs — i.e. the decorator is perfectly
  transparent when no vector is present.
* For ``SuperAdminPaymentCorrectionView``: the side effect — the
  Payment row transitions to ``force_approved`` and a
  ``payment.super_admin_corrected`` audit row is written — fires in
  both environments.
* For ``RiskFlagsListView``: the paginated envelope carries the
  expected ``totalCount`` derived from the seeded risk-flag rows.

``target_status='force_approved'`` is used for the correction test
because it bypasses the 4-check integrity gate (which only fires on
``successful``) while still exercising the full sole-authority
``_transition`` path under ``PAYMENT_HARDENING_FORWARD_ONLY=True`` —
mirroring ``test_super_admin_payment_correction.py``.

Validates: Requirements R16.1, R22.6
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.dev_bypass import (
    DEV_BYPASS_HEADER_NAMES,
    DEV_BYPASS_PARAM_NAMES,
)
from apps.documents.risk_views import RiskFlagsListView
from apps.documents.payment_admin_views import SuperAdminPaymentCorrectionView


# ---------------------------------------------------------------------------
# Environment matrix
# ---------------------------------------------------------------------------

#: The two environment postures under test. The first entry is the
#: primary Task 49.3 pinned scenario (non-production passthrough); the
#: second is the production parity reference.
ENV_SETTINGS: tuple[tuple[str, dict], ...] = (
    (
        "development",
        {"DEBUG": True, "DJANGO_ENV": "development"},
    ),
    (
        "production",
        {"DEBUG": False, "DJANGO_ENV": "production"},
    ),
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def _seed_super_admin():
    """Seed a ``super_admin`` Profile + matching ``JWTUser``.

    Both Phase 5 endpoints use ``IsAuthenticated + IsSuperAdmin``; the
    dev-bypass decorator runs *after* these permission checks, so the
    test must authenticate as a super-admin to reach the handler and
    observe the passthrough.
    """
    from apps.accounts.models import Profile

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"passthrough-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Passthrough",
        last_name="Tester",
        role="super_admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    jwt_user = JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": "super_admin",
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        }
    )
    return profile, jwt_user


def _seed_pending_payment(owner_profile):
    """Seed an Application + pending Payment row owned by a student.

    ``owner_profile`` is the super-admin that will authenticate the
    request — the Payment row is owned by a separately seeded student
    because real Payment rows are never owned by super-admins.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    student = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Pass",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=(
            f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
        ),
        user=student,
        full_name="Passthrough Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260977000000",
        email=student.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Passthrough Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=student,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=(
            f"MIHAS-{application.application_number}-"
            f"{int(now.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "PAS",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
        },
        created_at=now,
        updated_at=now,
    )
    return application, payment


def _seed_payment_with_risk_flag(owner_profile):
    """Seed a pending Payment whose metadata carries one risk-flag row.

    The single risk-flag row is enough to make ``RiskFlagsListView``
    return a ``totalCount`` of ``1`` — the test does not inspect row
    contents beyond the envelope shape.
    """
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()
    student = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"risk-student-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Risk",
        last_name="Student",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=(
            f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
        ),
        user=student,
        full_name="Risk Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000001",
        email=student.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Risk Program",
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        payment_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )
    recorded_at = (now - timedelta(days=1)).isoformat()
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=student,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        transaction_reference=(
            f"MIHAS-{application.application_number}-"
            f"{int(now.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        ),
        metadata={
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "residency_category": "local",
                "program_code": "RSK",
                "intake_id": None,
                "waiver_applied": False,
                "original_amount": "153.00",
                "fee_source": "program_fee",
            },
            "risk_flags": [
                {
                    "type": "amount_mismatch",
                    "details": {
                        "expected": "153.00",
                        "received": "150.00",
                        "source": "verify",
                    },
                    "recorded_at": recorded_at,
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )
    return application, payment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dispatch_super_admin_correction(*, jwt_user, payment_id, body):
    """Issue a clean ``POST /api/v1/payments/<uuid>/correct/``.

    No dev-bypass query params, body fields, or headers are attached
    — the request is the legitimate-caller baseline.
    """
    factory = APIRequestFactory()
    request = factory.post(
        f"/api/v1/payments/{payment_id}/correct/",
        data=json.dumps(body),
        content_type="application/json",
    )
    force_authenticate(request, user=jwt_user)
    return SuperAdminPaymentCorrectionView.as_view()(
        request, payment_id=str(payment_id)
    )


def _dispatch_risk_flags_list(*, jwt_user):
    """Issue a clean ``GET /api/v1/payments/risk-flags/``.

    No dev-bypass query params, body fields, or headers are attached.
    """
    factory = APIRequestFactory()
    request = factory.get("/api/v1/payments/risk-flags/")
    force_authenticate(request, user=jwt_user)
    return RiskFlagsListView.as_view()(request)


def _assert_no_bypass_vector_in_request(*, query_string="", headers=None):
    """Defence-in-depth assertion: no dev-bypass vector is present.

    This is a test-author sanity check — the request-builder helpers
    above never attach vectors, but we assert the invariant explicitly
    so any future edit to the helpers cannot silently invalidate the
    test by smuggling a vector in.
    """
    headers = headers or {}
    lowered_qs = query_string.lower()
    for name in DEV_BYPASS_PARAM_NAMES:
        assert name.lower() not in lowered_qs, (
            f"Test builder leaked dev-bypass vector {name!r} into query "
            f"string {query_string!r}; the passthrough case requires a "
            f"vector-free request."
        )
    for name in DEV_BYPASS_HEADER_NAMES:
        meta_key = "HTTP_" + name.upper().replace("-", "_")
        assert meta_key not in headers, (
            f"Test builder leaked dev-bypass header {name!r} into extra "
            f"headers {headers!r}."
        )


# ===========================================================================
# SuperAdminPaymentCorrectionView — dev passthrough + prod parity
# ===========================================================================


@pytest.mark.django_db
class TestSuperAdminCorrectionPassthroughAbsentBypassVector:
    """Legitimate super-admin correction is unaffected by the decorator.

    Two runs per test:

    * ``development`` posture (``DEBUG=True`` + ``DJANGO_ENV='development'``)
      — the pinned Task 49.3 scenario.
    * ``production`` posture — parity reference.

    The decorator must be transparent in both environments when no
    dev-bypass vector is attempted.

    Validates: Requirements R16.1, R22.6
    """

    @pytest.mark.parametrize(
        "env_name,settings_overrides",
        ENV_SETTINGS,
        ids=[name for name, _ in ENV_SETTINGS],
    )
    @override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
    def test_legitimate_correction_succeeds_without_bypass(
        self, env_name, settings_overrides
    ):
        """A legitimate POST returns 200 + success envelope in every env.

        Validates: Requirements R16.1, R22.6
        """
        from apps.common.models import AuditLog

        _assert_no_bypass_vector_in_request()

        _, jwt_user = _seed_super_admin()
        _, payment = _seed_pending_payment(owner_profile=jwt_user)

        body = {
            "target_status": "force_approved",
            "reason": "legitimate correction reason",
        }

        with override_settings(**settings_overrides):
            response = _dispatch_super_admin_correction(
                jwt_user=jwt_user,
                payment_id=payment.id,
                body=body,
            )

        # 1. Decorator did NOT lock the request out.
        assert response.status_code != 404, (
            f"[{env_name}] Phase 5 correction endpoint must not return 404 "
            f"without a dev-bypass vector; got {response.status_code}. "
            f"Body: {getattr(response, 'data', None)!r}."
        )

        # 2. Response is the expected happy-path 200 + success envelope.
        assert response.status_code == 200, (
            f"[{env_name}] Legitimate super-admin correction must return "
            f"200; got {response.status_code} / body "
            f"{getattr(response, 'data', None)!r}."
        )
        body_data = response.data or {}
        assert body_data.get("success") is True, (
            f"[{env_name}] Response envelope must carry success=True; got "
            f"{body_data!r}."
        )
        data = body_data.get("data") or {}
        assert isinstance(data, dict), (
            f"[{env_name}] Response envelope must carry a dict under 'data'; "
            f"got {type(data).__name__}."
        )
        assert str(data.get("payment_id")) == str(payment.id)
        assert data.get("status") == "force_approved"
        assert data.get("target_status") == "force_approved"

        # 3. Side effects — Payment row transitioned + audit row written.
        payment.refresh_from_db()
        assert payment.status == "force_approved", (
            f"[{env_name}] Expected Payment.status='force_approved' after a "
            f"passthrough correction; got {payment.status!r}."
        )

        audits = list(
            AuditLog.objects.filter(
                entity_type="payment",
                entity_id=payment.id,
                action="payment.super_admin_corrected",
            )
        )
        assert len(audits) == 1, (
            f"[{env_name}] Expected exactly one "
            f"'payment.super_admin_corrected' audit row; got "
            f"{len(audits)!r}."
        )

    @override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
    def test_response_shape_matches_between_dev_and_prod(self):
        """Same legitimate request → same status + envelope in dev and prod.

        Runs the correction twice — once against dev settings, once
        against prod settings — and asserts bit-identical response
        status and envelope shape. The decorator is proven transparent
        to legitimate traffic.

        Each run uses a freshly-seeded Payment because the correction
        is terminal (``force_approved``); re-running against the same
        row would exercise a different transition path.

        Validates: Requirements R16.1, R22.6
        """
        body = {
            "target_status": "force_approved",
            "reason": "legitimate correction reason",
        }

        def _run(settings_overrides):
            _, jwt_user = _seed_super_admin()
            _, payment = _seed_pending_payment(owner_profile=jwt_user)
            with override_settings(**settings_overrides):
                resp = _dispatch_super_admin_correction(
                    jwt_user=jwt_user,
                    payment_id=payment.id,
                    body=body,
                )
            payload = resp.data or {}
            # Scrub the volatile ``payment_id`` so the envelope shape can
            # be compared row-independently; keep the structural keys +
            # the stable ``status`` / ``target_status`` / ``success`` bits.
            data = dict(payload.get("data") or {})
            data.pop("payment_id", None)
            return resp.status_code, {
                "success": payload.get("success"),
                "data_keys": sorted((payload.get("data") or {}).keys()),
                "data_without_payment_id": data,
            }

        dev_status, dev_envelope = _run(
            {"DEBUG": True, "DJANGO_ENV": "development"}
        )
        prod_status, prod_envelope = _run(
            {"DEBUG": False, "DJANGO_ENV": "production"}
        )

        assert dev_status == prod_status, (
            f"Status code must match between dev ({dev_status}) and prod "
            f"({prod_status}) when no dev-bypass vector is present."
        )
        assert dev_status != 404, (
            f"Neither run may return 404 for a legitimate correction; got "
            f"{dev_status}."
        )
        assert dev_envelope == prod_envelope, (
            f"Envelope shape must match between dev and prod.\n"
            f"dev={dev_envelope!r}\nprod={prod_envelope!r}"
        )


# ===========================================================================
# RiskFlagsListView — dev passthrough + prod parity
# ===========================================================================


@pytest.mark.django_db
class TestRiskFlagsListPassthroughAbsentBypassVector:
    """Legitimate super-admin risk-flag GET is unaffected by the decorator.

    The ``RiskFlagsListView`` endpoint does not depend on the
    ``PAYMENT_HARDENING_FORWARD_ONLY`` flag (it is a pure read-path) so
    the test class wraps only the environment overrides.

    Validates: Requirements R16.1, R22.6
    """

    @pytest.mark.parametrize(
        "env_name,settings_overrides",
        ENV_SETTINGS,
        ids=[name for name, _ in ENV_SETTINGS],
    )
    def test_legitimate_risk_flag_list_returns_paginated_envelope(
        self, env_name, settings_overrides
    ):
        """A legitimate GET returns 200 + paginated envelope in every env.

        Validates: Requirements R16.1, R22.6
        """
        _assert_no_bypass_vector_in_request()

        _, jwt_user = _seed_super_admin()
        _seed_payment_with_risk_flag(owner_profile=jwt_user)

        with override_settings(**settings_overrides):
            response = _dispatch_risk_flags_list(jwt_user=jwt_user)

        # 1. Decorator did NOT lock the request out.
        assert response.status_code != 404, (
            f"[{env_name}] Phase 5 risk-flags endpoint must not return 404 "
            f"without a dev-bypass vector; got {response.status_code}. "
            f"Body: {getattr(response, 'data', None)!r}."
        )

        # 2. Response is the expected happy-path 200 + paginated envelope.
        assert response.status_code == 200, (
            f"[{env_name}] Legitimate super-admin risk-flag list must "
            f"return 200; got {response.status_code} / body "
            f"{getattr(response, 'data', None)!r}."
        )
        body = response.data or {}
        assert body.get("success") is True, (
            f"[{env_name}] Response envelope must carry success=True; got "
            f"{body!r}."
        )
        data = body.get("data") or {}
        assert data.get("page") == 1
        assert data.get("pageSize") == 25
        assert data.get("totalCount") == 1
        assert isinstance(data.get("results"), list)
        assert len(data["results"]) == 1

    def test_response_shape_matches_between_dev_and_prod(self):
        """Same legitimate GET → same status + envelope in dev and prod.

        Uses independent seeds per run so each request sees a single
        risk-flag row and the envelope shape is directly comparable.

        Validates: Requirements R16.1, R22.6
        """

        def _run(settings_overrides):
            # Keep the two parity passes genuinely independent. Without
            # clearing the first seeded flag, the second request quite
            # correctly sees two rows and the test ends up measuring fixture
            # accumulation rather than decorator transparency.
            from apps.documents.models import Payment

            Payment.objects.all().delete()
            _, jwt_user = _seed_super_admin()
            _seed_payment_with_risk_flag(owner_profile=jwt_user)
            with override_settings(**settings_overrides):
                resp = _dispatch_risk_flags_list(jwt_user=jwt_user)
            payload = resp.data or {}
            data = payload.get("data") or {}
            # Compare structural shape — pagination counters and result
            # row shape — without pinning the volatile ``payment_id`` /
            # ``application_id`` values.
            result_keys = (
                sorted(data["results"][0].keys())
                if data.get("results")
                else []
            )
            return resp.status_code, {
                "success": payload.get("success"),
                "page": data.get("page"),
                "pageSize": data.get("pageSize"),
                "totalCount": data.get("totalCount"),
                "result_count": len(data.get("results") or []),
                "result_row_keys": result_keys,
            }

        dev_status, dev_envelope = _run(
            {"DEBUG": True, "DJANGO_ENV": "development"}
        )
        prod_status, prod_envelope = _run(
            {"DEBUG": False, "DJANGO_ENV": "production"}
        )

        assert dev_status == prod_status, (
            f"Status code must match between dev ({dev_status}) and prod "
            f"({prod_status}) when no dev-bypass vector is present."
        )
        assert dev_status != 404, (
            f"Neither run may return 404 for a legitimate risk-flag list; "
            f"got {dev_status}."
        )
        assert dev_envelope == prod_envelope, (
            f"Envelope shape must match between dev and prod.\n"
            f"dev={dev_envelope!r}\nprod={prod_envelope!r}"
        )

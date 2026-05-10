"""Unit tests — Payment-Sensitive-Fields lock on application PATCH/DELETE.

Task 17.1 (payment-hardening) — the enforcement gate that ensures the
application editing API refuses to mutate Payment_Sensitive_Fields while
any active (``pending``/``deferred``) or terminal-non-expired
(``successful``/``force_approved``) Payment exists for that application,
and that draft deletion is blocked while any non-expired Payment exists.

Payment_Sensitive_Fields per the spec glossary:

* ``program``
* ``intake``
* ``institution``
* ``nationality``
* ``country``
* ``full_name``
* ``nrc_number``
* ``passport_number``

Module-level skip
-----------------
The API-layer 409 + ``PAYMENT_SENSITIVE_FIELDS_LOCKED`` / 409 +
``DRAFT_DELETE_BLOCKED_BY_PAYMENT`` gate is **not yet wired** into the
views under ``backend/apps/applications/``. The design's Phase 2 rollout
schedules it for a follow-up task — this file pre-seeds the enforcement
test cases so the gate ships with passing coverage the moment it lands.

Every test class is therefore pytest-skipped at module load via the
``pytestmark`` declaration below. When the lock is implemented, remove
the ``pytestmark = pytest.mark.skip(...)`` line to activate the suite.

Validates: Requirements R5.1, R5.2, R5.3, R5.4
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Module-level skip guard (remove when the API-layer lock ships)
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.skip(
    reason=(
        "API-layer lock to be implemented as part of Phase 2 rollout — "
        "Task 17.1 is the enforcement gate for when it ships."
    )
)


# ---------------------------------------------------------------------------
# Payment_Sensitive_Fields — canonical list from the payment-hardening spec
# ---------------------------------------------------------------------------

PAYMENT_SENSITIVE_FIELDS: tuple[str, ...] = (
    "program",
    "intake",
    "institution",
    "nationality",
    "country",
    "full_name",
    "nrc_number",
    "passport_number",
)

# Statuses that MUST block sensitive-field edits.
BLOCKING_STATUSES: tuple[str, ...] = (
    "pending",
    "deferred",
    "successful",
    "force_approved",
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _seed_profile():
    """Create a student Profile for ownership assertions."""
    from apps.accounts.models import Profile

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"lock-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Lock",
        last_name="Owner",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _seed_application(profile, *, app_status: str = "draft"):
    """Create an Application owned by ``profile``.

    The sensitive-fields lock applies to both draft and submitted
    applications — the default is ``draft`` so DELETE-path tests can
    reuse the same fixture.
    """
    from apps.applications.models import Application

    now = timezone.now()
    return Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=profile,
        full_name="Lock Test Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=profile.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="Original Program",
        intake="January 2025",
        institution="MIHAS",
        nrc_number="123456/78/9",
        passport_number="AB1234567",
        status=app_status,
        payment_status="pending_review",
        version=1,
        created_at=now,
        updated_at=now,
    )


def _seed_payment(application, profile, *, pay_status: str):
    """Create a Payment row in the requested status."""
    from apps.documents.models import Payment

    now = timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=profile,
        amount=Decimal("153.00"),
        currency="ZMW",
        status=pay_status,
        transaction_reference=(
            f"MIHAS-{application.application_number}-{uuid.uuid4().hex[:12]}"
        ),
        metadata={},
        created_at=now,
        updated_at=now,
    )


def _patch_value_for(field: str) -> str:
    """Return a valid non-colliding value for a sensitive field."""
    return {
        "program": "Updated Program",
        "intake": "July 2025",
        "institution": "KATC",
        "nationality": "Other",
        "country": "Kenya",
        "full_name": "Updated Name",
        "nrc_number": "999888/77/6",
        "passport_number": "ZZ9999999",
    }[field]


def _extract_stable_code(body: dict) -> str | None:
    """Return the stable code regardless of envelope shape.

    The hardened path uses ``{"error": {"code": "..."}}``; the legacy
    path uses a flat ``{"code": "..."}``. Both are accepted here so the
    test is robust to whichever envelope the view emits at the moment
    the lock lands.
    """
    err = body.get("error")
    if isinstance(err, dict) and err.get("code"):
        return err["code"]
    return body.get("code")


# ===========================================================================
# TestSensitiveFieldsPatchLock — R5.1, R5.4
# ===========================================================================


@pytest.mark.django_db
class TestSensitiveFieldsPatchLock:
    """PATCH /api/v1/applications/{id}/ with any Payment_Sensitive_Field.

    Asserts the 409 + ``PAYMENT_SENSITIVE_FIELDS_LOCKED`` gate fires for
    every combination of (sensitive field, blocking Payment status), and
    that PATCH still succeeds when all payments are ``expired`` or when
    no Payment row exists.

    Validates: Requirements R5.1, R5.4
    """

    @pytest.mark.parametrize("field_name", PAYMENT_SENSITIVE_FIELDS)
    @pytest.mark.parametrize("payment_status", BLOCKING_STATUSES)
    def test_patch_sensitive_field_is_blocked_while_payment_active_or_terminal(
        self, field_name, payment_status,
    ):
        """Every (field, blocking status) pair returns 409 + the stable code."""
        profile = _seed_profile()
        application = _seed_application(profile, app_status="submitted")
        _seed_payment(application, profile, pay_status=payment_status)

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.patch(
            url, data={field_name: _patch_value_for(field_name)}, format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, (
            f"PATCH {field_name!r} with payment={payment_status!r} should be "
            f"409; got {response.status_code}. Body: {response.data!r}."
        )
        body = response.data if isinstance(response.data, dict) else {}
        assert body.get("success") is False
        code = _extract_stable_code(body)
        assert code == "PAYMENT_SENSITIVE_FIELDS_LOCKED", (
            f"Expected stable code PAYMENT_SENSITIVE_FIELDS_LOCKED; got {code!r}."
        )

        # Lock must not silently mutate the row.
        application.refresh_from_db()
        original_value = {
            "program": "Original Program",
            "intake": "January 2025",
            "institution": "MIHAS",
            "nationality": "Zambian",
            "country": "Zambia",
            "full_name": "Lock Test Student",
            "nrc_number": "123456/78/9",
            "passport_number": "AB1234567",
        }[field_name]
        assert getattr(application, field_name) == original_value

    def test_patch_allowed_when_only_expired_payments_exist(self):
        """An application whose Payments are all ``expired`` can be patched."""
        profile = _seed_profile()
        application = _seed_application(profile, app_status="draft")
        _seed_payment(application, profile, pay_status="expired")

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.patch(
            url, data={"program": "Updated Program"}, format="json",
        )

        assert response.status_code == status.HTTP_200_OK, (
            f"PATCH with only-expired payments should succeed; "
            f"got {response.status_code}. Body: {response.data!r}."
        )
        application.refresh_from_db()
        assert application.program == "Updated Program"

    def test_patch_allowed_when_no_payment_exists(self):
        """No Payment record → sensitive fields remain editable."""
        profile = _seed_profile()
        application = _seed_application(profile, app_status="draft")

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.patch(
            url, data={"nationality": "Other"}, format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        application.refresh_from_db()
        assert application.nationality == "Other"


# ===========================================================================
# TestDraftDeleteBlockedByPayment — R5.2, R5.3
# ===========================================================================


@pytest.mark.django_db
class TestDraftDeleteBlockedByPayment:
    """DELETE /api/v1/applications/{id}/ on a draft application.

    Asserts the 409 + ``DRAFT_DELETE_BLOCKED_BY_PAYMENT`` gate fires
    whenever ANY non-expired Payment row exists, and that deletion still
    succeeds when no Payment or only ``expired`` Payments exist.

    Validates: Requirements R5.2, R5.3
    """

    def test_delete_draft_blocked_when_pending_payment_exists(self):
        profile = _seed_profile()
        application = _seed_application(profile, app_status="draft")
        _seed_payment(application, profile, pay_status="pending")

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.delete(url)

        assert response.status_code == status.HTTP_409_CONFLICT, (
            f"DELETE with pending payment should be 409; got "
            f"{response.status_code}. Body: {getattr(response, 'data', None)!r}."
        )
        body = response.data if isinstance(response.data, dict) else {}
        assert body.get("success") is False
        code = _extract_stable_code(body)
        assert code == "DRAFT_DELETE_BLOCKED_BY_PAYMENT", (
            f"Expected stable code DRAFT_DELETE_BLOCKED_BY_PAYMENT; "
            f"got {code!r}."
        )

        # Lock must not silently delete.
        from apps.applications.models import Application

        assert Application.objects.filter(id=application.id).exists()

    def test_delete_draft_allowed_when_only_expired_payments_exist(self):
        """Expired Payments do not block draft deletion (R5.2)."""
        profile = _seed_profile()
        application = _seed_application(profile, app_status="draft")
        _seed_payment(application, profile, pay_status="expired")

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.delete(url)

        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
        ), (
            f"DELETE with only-expired payments should succeed; "
            f"got {response.status_code}."
        )
        from apps.applications.models import Application

        assert not Application.objects.filter(id=application.id).exists()

    def test_delete_draft_allowed_when_no_payment_exists(self):
        profile = _seed_profile()
        application = _seed_application(profile, app_status="draft")

        client = APIClient()
        client.force_authenticate(user=profile)

        url = reverse(
            "applications:application-detail",
            kwargs={"application_id": application.id},
        )
        response = client.delete(url)

        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
        )
        from apps.applications.models import Application

        assert not Application.objects.filter(id=application.id).exists()

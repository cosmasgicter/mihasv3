"""Unit tests — Task 43.4.

In **non-production** (``DEBUG=True``, ``DJANGO_ENV='development'``), any
dev-bypass attempt on a payment view must emit exactly one
``PaymentAuditService.record_payment_event(action='payment.dev_bypass_used',
...)`` call. Routing is not affected — the decorator lets the view run
after recording the audit event.

The audit metadata must contain ``path`` and ``method`` for forensics,
but must never echo the raw bypass value (key-presence only, per the
R17.4 redaction rule).

Validates: Requirements R16.2
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Views under test — same set as Task 43.3
# ---------------------------------------------------------------------------


def _payment_id_placeholder() -> str:
    return str(uuid.UUID("00000000-0000-0000-0000-000000000002"))


PAYMENT_VIEWS: tuple[tuple[str, str, str, bool, bool], ...] = (
    # (id, http_method, path, accepts_body, requires_auth)
    ("payments_initiate", "post", "/api/v1/payments/initiate/", True, True),
    ("payments_mobile_money", "post", "/api/v1/payments/mobile-money/", True, True),
    (
        "payments_verify",
        "post",
        f"/api/v1/payments/{_payment_id_placeholder()}/verify/",
        True,
        True,
    ),
    (
        "payments_webhook_lenco",
        "post",
        "/api/v1/payments/webhook/lenco/",
        True,
        False,
    ),
    ("payments_resolve_fee", "get", "/api/v1/payments/resolve-fee/", False, True),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_profile():
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"devbypassaudit-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Audit",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    from apps.accounts.authentication import JWTUser
    return JWTUser({
        "user_id": str(profile.id),
        "email": profile.email,
        "role": profile.role,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
    })


def _raw_bypass_values() -> set[str]:
    """Return the set of raw vector-value strings that must NOT appear
    anywhere in audit metadata. We use a deliberately distinctive
    sentinel so any accidental leak will show up in string search.
    """
    return {"SENTINEL-DEV-BYPASS-VALUE-XYZ", "1"}


def _send_with_sentinel(
    client: APIClient,
    method: str,
    path: str,
    *,
    accepts_body: bool,
    vector_kind: str,
) -> None:
    """Send a request to ``path`` with a sentinel dev-bypass vector.

    ``vector_kind`` picks which vector to use. We rotate through the four
    known vectors to get coverage across header / query / body forms.
    """
    sentinel = "SENTINEL-DEV-BYPASS-VALUE-XYZ"

    url = path
    body: dict = {}
    extra: dict = {}

    if vector_kind == "query":
        url = f"{path}?dev-bypass={sentinel}"
    elif vector_kind == "header":
        extra = {"HTTP_X_DEV_BYPASS_AUTH": sentinel}
    elif vector_kind == "body":
        if not accepts_body:
            pytest.skip("body-vector only applies to POST views")
        body = {"DEV_BYPASS_AUTH": sentinel}
    else:
        raise AssertionError(f"unknown vector_kind {vector_kind!r}")

    if accepts_body:
        # Ensure the body has a well-formed application_id so the 
        # request is syntactically valid.
        body.setdefault("application_id", str(uuid.uuid4()))

    if method == "post":
        client.post(
            url,
            data=json.dumps(body) if body else "",
            content_type="application/json",
            **extra,
        )
    else:
        client.get(url, **extra)


# ===========================================================================
# Tests
# ===========================================================================


@pytest.mark.django_db
class TestPaymentViewsEmitDevBypassAuditInNonProduction:
    """One test per view × one representative vector per view.

    We patch ``PaymentAuditService.record_payment_event`` so we assert on
    call shape without actually writing audit rows, and without the
    PaymentAuditService needing a live ``audit_logs`` table.

    Validates: Requirements R16.2
    """

    @pytest.mark.parametrize(
        "view_id,method,path,accepts_body,requires_auth",
        PAYMENT_VIEWS,
        ids=[row[0] for row in PAYMENT_VIEWS],
    )
    @pytest.mark.parametrize(
        "vector_kind",
        ["query", "header", "body"],
    )
    @override_settings(DEBUG=True, DJANGO_ENV="development")
    def test_non_production_emits_dev_bypass_audit_event(
        self,
        view_id,
        method,
        path,
        accepts_body,
        requires_auth,
        vector_kind,
    ):
        if vector_kind == "body" and not accepts_body:
            pytest.skip("body-vector only applies to POST views")

        client = APIClient()
        cache.clear()
        if requires_auth:
            profile = _seed_profile()
            client.force_authenticate(user=profile)

        with patch(
            "apps.documents.payment_audit_service."
            "PaymentAuditService.record_payment_event"
        ) as mock_record:
            _send_with_sentinel(
                client,
                method,
                path,
                accepts_body=accepts_body,
                vector_kind=vector_kind,
            )

        # The decorator must have fired ``record_payment_event`` at least
        # once with the expected action. We use ``>=1`` rather than ``==1``
        # because a single request may legitimately emit other audit rows
        # (e.g. payment.initiated) but only one of them is the
        # dev-bypass marker.
        bypass_calls = [
            call
            for call in mock_record.call_args_list
            if (call.kwargs.get("action") == "payment.dev_bypass_used")
        ]
        assert len(bypass_calls) == 1, (
            f"View {view_id!r} via vector {vector_kind!r} should emit "
            f"exactly one ``payment.dev_bypass_used`` audit event in "
            f"non-production; got {len(bypass_calls)}. "
            f"All calls: {mock_record.call_args_list!r}."
        )

        call = bypass_calls[0]
        kwargs = call.kwargs

        # Action
        assert kwargs["action"] == "payment.dev_bypass_used"

        # Metadata shape — must include path and method.
        metadata = kwargs.get("metadata") or {}
        assert isinstance(metadata, dict)
        assert metadata.get("path") == path, (
            f"metadata.path expected {path!r}, got {metadata.get('path')!r}"
        )
        assert metadata.get("method") == method.upper(), (
            f"metadata.method expected {method.upper()!r}, "
            f"got {metadata.get('method')!r}"
        )

        # Raw bypass sentinel must never appear anywhere in metadata.
        serialised = json.dumps(metadata, default=str)
        for raw in _raw_bypass_values():
            if raw == "1":
                # "1" is too short to reliably forbid — skip the
                # broad-match assertion for this value.
                continue
            assert raw not in serialised, (
                f"Raw bypass value {raw!r} leaked into audit metadata "
                f"for {view_id!r}/{vector_kind!r}: {serialised!r}"
            )

        # The raw query-string / header key name should also not appear
        # in the metadata. The decorator records only (path, method).
        for forbidden in ("dev-bypass", "DEV_BYPASS_AUTH", "X-Dev-Bypass-Auth"):
            assert forbidden not in serialised, (
                f"Vector key {forbidden!r} leaked into audit metadata "
                f"for {view_id!r}/{vector_kind!r}: {serialised!r}"
            )

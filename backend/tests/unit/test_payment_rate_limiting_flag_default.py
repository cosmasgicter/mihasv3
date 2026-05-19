"""Unit test — Task 44.6: rate-limit flag default preserves legacy behaviour.

Validates: Requirements R22.6.

When ``PAYMENT_HARDENING_RATE_LIMITS`` is ``False`` (the shipped
default), ``PaymentUserScopedRateThrottle.get_cache_key`` returns
``None`` so DRF short-circuits the bucket. Views that list the new
throttle class in ``throttle_classes`` must therefore behave exactly
like the pre-hardening configuration — no spurious 429s on bursts that
would otherwise exceed the ``6/min`` hardened budget.

This test fires 50 POSTs/minute against ``PaymentInitiateView`` as the
same authenticated user and asserts none of them return HTTP 429. The
request bodies are intentionally invalid (random ``application_id``) —
we only care about the throttle behaviour, not the view's business
logic. Any non-429 status (400, 404, 500, etc.) is acceptable.
"""

from __future__ import annotations

import json
import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient
from apps.accounts.authentication import JWTUser


PAYMENT_INITIATE_PATH = "/api/v1/payments/initiate/"


def _seed_profile(role: str = "student"):
    """Create a minimal Profile row for ``force_authenticate`` calls."""
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"ratelimit-flag-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Flag",
        last_name="Default",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _jwt_user(profile):
    return JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": profile.role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        }
    )


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=False)
def test_flag_default_allows_50_requests_without_429():
    """Validates: Requirements R22.6.

    With the rate-limit flag disabled, 50 rapid POSTs to
    ``/api/v1/payments/initiate/`` as the same authenticated user must
    all bypass the throttle bucket (no 429s). This locks the
    pre-hardening behaviour as the default until the flag is flipped.
    """
    cache.clear()

    client = APIClient()
    profile = _seed_profile()
    client.force_authenticate(user=_jwt_user(profile))

    for i in range(50):
        body = {"application_id": str(uuid.uuid4())}
        response = client.post(
            PAYMENT_INITIATE_PATH,
            data=json.dumps(body),
            content_type="application/json",
        )
        assert response.status_code != 429, (
            f"request {i + 1}/50 returned 429 with "
            f"PAYMENT_HARDENING_RATE_LIMITS=False — the hardened throttle "
            f"must be a no-op when the flag is disabled (R22.6)"
        )


@pytest.mark.django_db
@override_settings(
    PAYMENT_HARDENING_RATE_LIMITS=False,
    PAYMENT_HARDENING_FORCE_APPROVED=False,
)
def test_all_phase5_flags_disabled_preserves_legacy_behaviour():
    """Validates: Requirements R19.1, R22.6.

    Cross-phase regression (Task 49.1). With every Phase 5 backend
    feature flag disabled — ``PAYMENT_HARDENING_RATE_LIMITS=False`` and
    ``PAYMENT_HARDENING_FORCE_APPROVED=False`` — the payment surface
    must behave exactly like the pre-hardening baseline. Specifically:

    * No request returns HTTP 429, even when the burst would exceed the
      hardened per-minute budget (6/min for initiate + mobile-money,
      30/min for verify + resolve-fee).
    * No response envelope reports ``code == "RATE_LIMITED"``.

    The test fires 10 rapid requests at each of the four authenticated
    payment endpoints listed in R19.1. Each request uses a freshly
    generated UUID so idempotency keys never collide and no two
    ``application_id`` values hash to the same cached row. We only care
    about throttle behaviour and envelope stability — any non-429
    status (400, 404, 500, etc.) is acceptable because the request
    bodies intentionally reference non-existent applications.
    """
    cache.clear()

    client = APIClient()
    profile = _seed_profile()
    client.force_authenticate(user=_jwt_user(profile))

    # (label, http_method, path_template, builds_body) — path_template
    # accepts an optional ``{uuid}`` placeholder for per-call uniqueness
    # on the verify endpoint.
    endpoints: tuple[tuple[str, str, str, bool], ...] = (
        ("initiate", "post", "/api/v1/payments/initiate/", True),
        ("mobile_money", "post", "/api/v1/payments/mobile-money/", True),
        ("verify", "post", "/api/v1/payments/{uuid}/verify/", True),
        ("resolve_fee", "get", "/api/v1/payments/resolve-fee/?program_code=NONE", False),
    )

    for label, method, path_template, builds_body in endpoints:
        for i in range(10):
            path = path_template.format(uuid=str(uuid.uuid4()))
            if method == "post":
                body = {
                    "application_id": str(uuid.uuid4()),
                    "phone": "+260970000000",
                    "operator": "airtel",
                }
                response = client.post(
                    path,
                    data=json.dumps(body),
                    content_type="application/json",
                )
            else:
                response = client.get(path)

            assert response.status_code != 429, (
                f"endpoint={label!r} request {i + 1}/10 returned 429 with "
                f"both Phase 5 flags disabled — the hardened throttle must "
                f"be a no-op when PAYMENT_HARDENING_RATE_LIMITS=False (R19.1)"
            )

            # Envelope drift guard: even if a handler wraps the response
            # in the standard failure envelope for another reason, the
            # stable code must never be ``RATE_LIMITED`` when the flag
            # is off.
            data = response.json() if hasattr(response, "json") else response.data
            if isinstance(data, dict):
                assert data.get("code") != "RATE_LIMITED", (
                    f"endpoint={label!r} request {i + 1}/10 returned "
                    f"code=RATE_LIMITED with PAYMENT_HARDENING_RATE_LIMITS=False — "
                    f"stable-code drift (R22.6)"
                )

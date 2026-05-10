"""Unit tests — Task 44.4: per-scope rate-limit enforcement.

Validates Requirements R19.1 and R19.2.

For each of the four payment throttle scopes we:

1. Issue ``budget`` requests as the same authenticated user — all must
   succeed (non-429).
2. Issue the ``budget + 1``-th request — must return HTTP 429 with the
   stable envelope::

       {
         "success": false,
         "error": "<stable-catalogue message>",
         "code": "RATE_LIMITED",
         "details": {"retry_after": int, "scope": "payment_<...>"}
       }

3. A second authenticated user is unaffected (user-isolation).
4. For ``payment_resolve_fee`` — an unauthenticated anonymous request
   from a different ``REMOTE_ADDR`` has an independent IP-keyed budget.

The cache is cleared between sub-tests so throttles do not leak.
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_profile(role: str = "student"):
    """Create a minimal Profile row for ``force_authenticate`` calls."""
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"ratelimit-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Rate",
        last_name="Tester",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


# Scope → (HTTP method, path, budget/min, auth required)
SCOPES: tuple[tuple[str, str, str, int, bool], ...] = (
    ("payment_initiate", "post", "/api/v1/payments/initiate/", 6, True),
    ("payment_mobile_money", "post", "/api/v1/payments/mobile-money/", 6, True),
    (
        "payment_verify",
        "post",
        f"/api/v1/payments/{uuid.UUID('00000000-0000-0000-0000-000000000099')}/verify/",
        30,
        True,
    ),
    ("payment_resolve_fee", "get", "/api/v1/payments/resolve-fee/?program_code=NONE", 30, True),
)


def _send(client: APIClient, method: str, path: str, *, remote_addr: str | None = None):
    extra: dict = {}
    if remote_addr is not None:
        extra["REMOTE_ADDR"] = remote_addr

    if method == "post":
        body = {"application_id": str(uuid.uuid4()), "phone": "+260970000000", "operator": "airtel"}
        return client.post(
            path,
            data=json.dumps(body),
            content_type="application/json",
            **extra,
        )
    return client.get(path, **extra)


# ===========================================================================
# Tests
# ===========================================================================


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=True)
@pytest.mark.parametrize(
    "scope,method,path,budget,requires_auth",
    SCOPES,
    ids=[row[0] for row in SCOPES],
)
def test_per_scope_429_at_budget_plus_one(
    scope, method, path, budget, requires_auth,
):
    """Validates: Requirements R19.1."""
    cache.clear()

    client = APIClient()
    profile = _seed_profile()
    if requires_auth:
        client.force_authenticate(user=profile)

    # Fire exactly ``budget`` requests — none should be 429.
    for i in range(budget):
        response = _send(client, method, path)
        assert response.status_code != 429, (
            f"scope={scope!r} request {i + 1}/{budget} returned 429 too early"
        )

    # The next request must be 429 with the stable envelope.
    response = _send(client, method, path)
    assert response.status_code == 429, (
        f"scope={scope!r} budget+1 request expected 429, got "
        f"{response.status_code}"
    )

    data = response.json() if hasattr(response, "json") else response.data
    assert data.get("success") is False
    assert data.get("code") == "RATE_LIMITED"
    details = data.get("details") or {}
    assert details.get("scope") == scope
    assert isinstance(details.get("retry_after"), int)
    assert details.get("retry_after") >= 0


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=True)
def test_second_user_is_not_throttled_by_first_users_budget():
    """Validates: Requirements R19.2 — keys are per user.pk."""
    cache.clear()

    user_a = _seed_profile()
    user_b = _seed_profile()

    client_a = APIClient()
    client_a.force_authenticate(user=user_a)

    client_b = APIClient()
    client_b.force_authenticate(user=user_b)

    scope_budget = 6  # payment_initiate
    path = "/api/v1/payments/initiate/"

    # Exhaust user A's budget.
    for _ in range(scope_budget + 1):
        _send(client_a, "post", path)

    # User B's first request for the same scope must NOT be 429.
    response = _send(client_b, "post", path)
    assert response.status_code != 429, (
        "user B was rate-limited by user A's budget — throttle keying is wrong"
    )


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=True)
def test_anonymous_ip_isolation_on_resolve_fee():
    """Validates: Requirements R19.2 — anonymous requests are keyed by IP.

    ``resolve-fee`` is authenticated in production, but the
    ``get_cache_key`` fallback to ``get_ident`` is exercised by any
    anonymous request hitting the throttle — DRF's permissions return
    401 **after** the throttle runs. We therefore exhaust budget from
    one IP and assert a *different* ``REMOTE_ADDR`` gets a fresh
    budget on the same route.
    """
    cache.clear()

    client = APIClient()
    path = "/api/v1/payments/resolve-fee/?program_code=NONE"
    budget = 30

    # Exhaust IP_A's budget.
    for _ in range(budget + 1):
        _send(client, "get", path, remote_addr="10.0.0.1")

    # IP_B must have an independent budget.
    response = _send(client, "get", path, remote_addr="10.0.0.2")
    assert response.status_code != 429, (
        "anonymous IP_B was rate-limited by IP_A's budget — anon keying "
        "is not per-IP"
    )

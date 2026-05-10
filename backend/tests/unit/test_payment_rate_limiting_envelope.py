"""Unit tests — Task 44.7: 429 envelope + audit + counter emission.

Validates: Requirements R15.2, R19.3.

When a payment endpoint exceeds its per-user throttle budget under
``PAYMENT_HARDENING_RATE_LIMITS=True``, the
``envelope_exception_handler`` in ``backend/apps/common/exceptions.py``
must:

1. Return HTTP 429 with the FLAT envelope produced by
   ``envelope_exception_handler``::

       {
         "success": false,
         "error": "<stable catalogue message>",
         "code": "RATE_LIMITED",
         "details": {"retry_after": <int ≥ 0>, "scope": "payment_<...>"}
       }

   Note: the repo envelope is intentionally FLAT (``success``, ``error``,
   ``code``, ``details``) — ``error`` is a string, NOT a nested object.

2. Write exactly ONE ``payment.rate_limited`` audit row per throttled
   request via ``PaymentAuditService.record_payment_event``. The audit
   metadata ("label payload") must be PII-free — no ``user_id`` key, no
   phone / NRC / passport substrings.

3. Increment the ``payment.rate_limited`` counter exactly ONCE per
   throttled request, with tags restricted to ``{endpoint, user_role}``
   only.

The test exhausts ``payment_initiate`` (budget=6) by firing 7 POSTs to
``/api/v1/payments/initiate/`` as the same student-role authenticated
user; the 7th response is expected to be 429, and the counter + audit
side-effects are captured via ``unittest.mock.patch`` to keep the
assertions deterministic regardless of the underlying Sentry / Neon
reachability.
"""

from __future__ import annotations

import json
import os
import uuid
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient


PAYMENT_INITIATE_PATH = "/api/v1/payments/initiate/"

# ``payment_initiate`` sustained budget under PAYMENT_HARDENING_RATE_LIMITS.
# Sibling test ``test_payment_rate_limiting.py`` pins the same value.
PAYMENT_INITIATE_BUDGET = 6


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_profile(role: str = "student"):
    """Create a minimal Profile row suitable for ``force_authenticate``."""
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"ratelimit-env-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Envelope",
        last_name="Tester",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


_PII_FORBIDDEN_KEYS: frozenset[str] = frozenset(
    {
        "user_id",
        "phone",
        "msisdn",
        "mobile",
        "nrc",
        "passport",
        "pan",
        "cvv",
        "card_number",
        "email",
    }
)

_PII_FORBIDDEN_SUBSTRINGS: tuple[str, ...] = ("phone", "nrc", "passport")


def _contains_pii_key(payload) -> bool:
    """Recursively check ``payload`` for PII-marker keys."""
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(key, str) and key.lower() in _PII_FORBIDDEN_KEYS:
                return True
            if _contains_pii_key(value):
                return True
    elif isinstance(payload, (list, tuple)):
        for item in payload:
            if _contains_pii_key(item):
                return True
    return False


# ===========================================================================
# Test
# ===========================================================================


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=True)
def test_429_envelope_audit_and_counter_fire_once_on_throttled_request():
    """Validates: Requirements R15.2, R19.3.

    Exhaust the ``payment_initiate`` budget with a student-role user,
    then assert the throttled (budget+1) request produces the flat
    envelope, a single ``payment.rate_limited`` audit event, and a
    single counter increment with only ``endpoint`` + ``user_role``
    labels.
    """
    cache.clear()

    client = APIClient()
    profile = _seed_profile(role="student")
    client.force_authenticate(user=profile)

    metrics_calls: list[dict] = []
    audit_calls: list[dict] = []

    def _capture_metrics(counter, *, amount=1, tags=None):  # noqa: ARG001
        # Only count the rate-limit emission we care about; other payment
        # counters (e.g. ``payment.initiation.failure``) from the view's
        # own code path during the first 6 requests are ignored.
        if counter == "payment.rate_limited":
            metrics_calls.append({"counter": counter, "tags": tags})

    def _capture_audit(**kwargs):
        # Similarly ignore any non-rate-limit audit events the view may
        # emit (e.g. ``payment.initiated``) during the non-throttled
        # first 6 requests.
        if kwargs.get("action") == "payment.rate_limited":
            audit_calls.append(kwargs)

    body = {"application_id": str(uuid.uuid4())}

    with patch(
        "apps.documents.payment_metrics.increment",
        side_effect=_capture_metrics,
    ), patch(
        "apps.documents.payment_audit_service.PaymentAuditService.record_payment_event",
        side_effect=_capture_audit,
    ):
        responses = []
        for _ in range(PAYMENT_INITIATE_BUDGET + 1):
            responses.append(
                client.post(
                    PAYMENT_INITIATE_PATH,
                    data=json.dumps(body),
                    content_type="application/json",
                )
            )

    response = responses[-1]

    # -------------------------------------------------------------------
    # 1. HTTP 429 + flat envelope shape (R15.2)
    # -------------------------------------------------------------------
    assert response.status_code == 429, (
        f"budget+1 request expected 429, got {response.status_code}"
    )

    data = response.json() if hasattr(response, "json") else response.data

    assert data.get("success") is False, (
        f"envelope.success must be False, got {data.get('success')!r}"
    )
    assert data.get("code") == "RATE_LIMITED", (
        f"envelope.code must be 'RATE_LIMITED', got {data.get('code')!r}"
    )
    # ``error`` is a flat string in this repo's envelope — NOT a nested
    # object. Stable catalogue message from
    # ``PAYMENT_ERROR_CODES['RATE_LIMITED']``.
    error_msg = data.get("error")
    assert isinstance(error_msg, str) and error_msg.strip(), (
        f"envelope.error must be a non-empty string, got {error_msg!r}"
    )

    details = data.get("details") or {}
    assert isinstance(details, dict), (
        f"envelope.details must be a dict, got {type(details).__name__}"
    )
    assert details.get("scope") == "payment_initiate", (
        f"details.scope must be 'payment_initiate', got {details.get('scope')!r}"
    )
    retry_after = details.get("retry_after")
    assert isinstance(retry_after, int) and retry_after >= 0, (
        f"details.retry_after must be a non-negative int, got {retry_after!r}"
    )

    # -------------------------------------------------------------------
    # 2. Counter increment — exactly once, labels limited to
    #    {endpoint, user_role} (R19.3)
    # -------------------------------------------------------------------
    assert len(metrics_calls) == 1, (
        f"expected exactly one payment.rate_limited counter emission, "
        f"got {len(metrics_calls)}: {metrics_calls!r}"
    )
    emitted_tags = metrics_calls[0].get("tags") or {}
    assert set(emitted_tags.keys()) == {"endpoint", "user_role"}, (
        f"counter tags must be exactly {{'endpoint', 'user_role'}}, got "
        f"{set(emitted_tags.keys())!r}"
    )
    assert emitted_tags["endpoint"] == "initiate", (
        f"endpoint tag must be 'initiate' (scope suffix), got "
        f"{emitted_tags['endpoint']!r}"
    )
    assert emitted_tags["user_role"] == "student", (
        f"user_role tag must be 'student', got {emitted_tags['user_role']!r}"
    )

    # -------------------------------------------------------------------
    # 3. Audit row — exactly once (R19.3)
    # -------------------------------------------------------------------
    assert len(audit_calls) == 1, (
        f"expected exactly one payment.rate_limited audit event, got "
        f"{len(audit_calls)}: {audit_calls!r}"
    )
    audit = audit_calls[0]
    assert audit.get("action") == "payment.rate_limited"

    audit_metadata = audit.get("metadata") or {}
    assert isinstance(audit_metadata, dict), (
        f"audit metadata must be a dict, got {type(audit_metadata).__name__}"
    )
    assert audit_metadata.get("scope") == "payment_initiate"
    assert audit_metadata.get("user_role") == "student"

    # -------------------------------------------------------------------
    # 4. No PII in the audit label payload
    # -------------------------------------------------------------------
    assert not _contains_pii_key(audit_metadata), (
        f"audit metadata must not carry PII-marker keys "
        f"(user_id, phone, msisdn, nrc, passport, ...); got "
        f"{audit_metadata!r}"
    )

    serialized_metadata = json.dumps(audit_metadata, default=str).lower()
    for marker in _PII_FORBIDDEN_SUBSTRINGS:
        assert marker not in serialized_metadata, (
            f"audit metadata leaks the {marker!r} substring; got "
            f"{audit_metadata!r}"
        )

"""Unit tests — Task 44.5: webhook is exempt from DRF throttle.

Validates: Requirements R19.4.

The Lenco webhook ingress is gated by HMAC signature validation, not by
DRF throttle class. Even under ``PAYMENT_HARDENING_RATE_LIMITS=True`` a
valid-signature burst of webhook POSTs must NOT produce any 429
responses, and the ``payment.rate_limited`` counter must not be
incremented for webhook traffic.
"""

from __future__ import annotations

import json
import os
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient


WEBHOOK_PATH = "/api/v1/payments/webhook/lenco/"


@pytest.mark.django_db
@override_settings(PAYMENT_HARDENING_RATE_LIMITS=True, LENCO_WEBHOOK_ALLOWED_IPS=[])
def test_webhook_accepts_100_posts_without_429():
    """Validates: Requirements R19.4."""
    cache.clear()
    client = APIClient()

    payload = {
        "event": "collection.successful",
        "data": {"reference": "TEST-REF-XYZ"},
    }

    rate_limit_calls: list = []

    def _count_increment(counter, *, amount=1, tags=None):  # noqa: ARG001
        if counter == "payment.rate_limited":
            rate_limit_calls.append({"counter": counter, "tags": tags})

    # Mock the WebhookProcessor so the view's business logic is bypassed
    # but the DRF pipeline (including any throttle) runs.
    with patch(
        "apps.documents.webhook_processor.WebhookProcessor.validate_signature",
        return_value=True,
    ), patch(
        "apps.documents.webhook_processor.WebhookProcessor.process",
        return_value=None,
    ), patch(
        "apps.documents.payment_metrics.increment",
        side_effect=_count_increment,
    ):
        for i in range(100):
            response = client.post(
                WEBHOOK_PATH,
                data=json.dumps(payload),
                content_type="application/json",
                HTTP_X_LENCO_SIGNATURE="test-signature",
            )
            assert response.status_code != 429, (
                f"webhook request {i + 1} was rate-limited — webhooks must "
                f"be exempt from DRF throttle (R19.4)"
            )

    assert rate_limit_calls == [], (
        "payment.rate_limited counter should not fire for webhook traffic; "
        f"got {len(rate_limit_calls)} emissions: {rate_limit_calls!r}"
    )

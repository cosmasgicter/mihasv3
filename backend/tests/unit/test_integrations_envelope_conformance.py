"""Envelope conformance regression tests for integrations app scaffold views.

Full-platform-remediation-2026-07, Phase 4, Task 4.5 (R5.5).

``ZohoConnectView.post()`` and ``EmailDeliveryWebhookView.post()`` previously
returned raw dicts (``{"id": ..., ...}`` / ``build_action_payload(...)``)
instead of explicitly wrapping the payload in the standard
``{"success": true, "data": ...}`` envelope used by every sibling view in
``apps/integrations/``. The global ``EnvelopeRenderer``
(``apps.common.renderers.EnvelopeRenderer``, wired via
``REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]``) auto-wraps any un-enveloped
success dict at render time, so the wire response was never actually broken —
but the view code was inconsistent with the rest of the codebase's explicit
convention. These tests pin the envelope contract at the HTTP boundary for
both views so a future change to either the view code or the renderer cannot
silently drop the envelope.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser


def _client_for(role="admin"):
    """An ``APIClient`` authenticated as a synthetic JWTUser (no DB lookup)."""
    client = APIClient()
    user = JWTUser({
        "user_id": str(uuid.uuid4()),
        "email": "operator@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "Operator",
    })
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestZohoConnectViewEnvelope:
    """POST /api/v1/email/accounts/zoho/connect/ returns the standard envelope."""

    def test_response_is_wrapped_in_success_data_envelope(self):
        client = _client_for()
        response = client.post("/api/v1/email/accounts/zoho/connect/")

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert "data" in body
        data = body["data"]
        assert data["provider"] == "zoho"
        assert data["status"] == "connected"
        # The payload must live under "data", not at the envelope root.
        assert "provider" not in body


@pytest.mark.django_db
class TestEmailDeliveryWebhookViewEnvelope:
    """POST /api/v1/email/webhooks/delivery/ returns the standard envelope.

    The webhook is unauthenticated (AllowAny) by design; no secret is
    configured in test settings, so the request is accepted without one.
    """

    def test_response_is_wrapped_in_success_data_envelope(self):
        client = APIClient()
        response = client.post("/api/v1/email/webhooks/delivery/")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "data" in body
        data = body["data"]
        assert data["status"] == "accepted"
        assert "reference_id" in data
        # The payload must live under "data", not at the envelope root.
        assert "status" not in body

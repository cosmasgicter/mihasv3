"""Regression test: idempotency-key header is in CORS allow-list.

Bug #1 (2026-05-19): The frontend sent an `X-Idempotency-Key` header that was
not in CORS_ALLOW_HEADERS, causing preflight failures on submission. The fix
was twofold: frontend switched to `idempotency-key` (lowercase, no X- prefix)
and the backend already had it in the allowlist. This test ensures the
allowlist entry is never accidentally removed.
"""

import pytest
from django.test import RequestFactory, override_settings


@pytest.mark.django_db
class TestCorsIdempotencyKeyPreflight:
    """Verify OPTIONS preflight accepts idempotency-key in Access-Control-Request-Headers."""

    @override_settings(
        CORS_ALLOWED_ORIGINS=["https://apply.beanola.com"],
        CORS_ALLOW_ALL_ORIGINS=False,
    )
    def test_preflight_allows_idempotency_key_header(self, client):
        """An OPTIONS preflight requesting idempotency-key must be allowed."""
        response = client.options(
            "/api/v1/applications/00000000-0000-0000-0000-000000000000/submit/",
            HTTP_ORIGIN="https://apply.beanola.com",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="idempotency-key",
        )
        # django-cors-headers returns 200 for valid preflight
        assert response.status_code in (200, 204), (
            f"Expected 200/204 for preflight, got {response.status_code}"
        )
        allow_headers = response.get("Access-Control-Allow-Headers", "")
        assert "idempotency-key" in allow_headers.lower(), (
            f"idempotency-key not in Access-Control-Allow-Headers: {allow_headers}"
        )

    @override_settings(
        CORS_ALLOWED_ORIGINS=["https://apply.beanola.com"],
        CORS_ALLOW_ALL_ORIGINS=False,
    )
    def test_preflight_allows_combined_headers(self, client):
        """Preflight requesting multiple custom headers including idempotency-key."""
        response = client.options(
            "/api/v1/applications/00000000-0000-0000-0000-000000000000/submit/",
            HTTP_ORIGIN="https://apply.beanola.com",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-csrf-token, idempotency-key, content-type",
        )
        assert response.status_code in (200, 204)
        allow_headers = response.get("Access-Control-Allow-Headers", "").lower()
        assert "idempotency-key" in allow_headers
        assert "x-csrf-token" in allow_headers

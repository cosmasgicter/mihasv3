"""Unit tests — Phase 5 dev-bypass lockout on every payment view.

Task 43.3. Under production-equivalent settings
(``DEBUG=False`` + ``DJANGO_ENV='production'``), every payment view must
return **HTTP 404 with an empty body** when any of the four known
dev-bypass vectors is attempted:

1. ``?dev-bypass=1`` — query param
2. ``?dev=1`` — query param
3. ``X-Dev-Bypass-Auth: 1`` — header
4. ``{"DEV_BYPASS_AUTH": "1", "application_id": "..."}`` — body field
   (only applied to POST endpoints — skipped for GET).

Views under test (R16.3):

* ``/api/v1/payments/initiate/``
* ``/api/v1/payments/mobile-money/``
* ``/api/v1/payments/{id}/verify/``
* ``/api/v1/payments/webhook/lenco/``  (unauthenticated, no
  ``force_authenticate``)
* ``/api/v1/payments/resolve-fee/``

The 404 must be indistinguishable from a bare Django "route not found" —
no envelope, no ``success`` key, no ``error`` key. The decorator at
``backend/apps/common/dev_bypass.py`` uses ``HttpResponse(status=404)``
for exactly this reason.

Validates: Requirements R16.1, R16.3
"""

from __future__ import annotations

import json
import uuid

import pytest
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Bypass vectors
# ---------------------------------------------------------------------------

#: (vector_id, {"query": {...}} | {"headers": {...}} | {"body": {...}})
BYPASS_VECTORS: tuple[tuple[str, dict], ...] = (
    ("query_dev_bypass", {"query": {"dev-bypass": "1"}}),
    ("query_dev", {"query": {"dev": "1"}}),
    ("header_x_dev_bypass_auth", {"headers": {"HTTP_X_DEV_BYPASS_AUTH": "1"}}),
    ("body_DEV_BYPASS_AUTH", {"body": {"DEV_BYPASS_AUTH": "1"}}),
)


# ---------------------------------------------------------------------------
# Views under test — (id, http_method, path, accepts_body, requires_auth)
# ---------------------------------------------------------------------------


def _payment_id_placeholder() -> str:
    return str(uuid.UUID("00000000-0000-0000-0000-000000000001"))


PAYMENT_VIEWS: tuple[tuple[str, str, str, bool, bool], ...] = (
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
    """Create a minimal student Profile for ``force_authenticate`` calls."""
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"devbypass-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Bypass",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _send(
    client: APIClient,
    method: str,
    path: str,
    *,
    body: dict | None,
    headers: dict | None,
    query: dict | None,
):
    """Build and send the request with the vector applied."""
    url = path
    if query:
        qs = "&".join(f"{k}={v}" for k, v in query.items())
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{qs}"

    extra: dict = dict(headers or {})

    if method == "post":
        payload = body if body is not None else {}
        return client.post(
            url,
            data=json.dumps(payload) if payload else "",
            content_type="application/json",
            **extra,
        )
    if method == "get":
        return client.get(url, **extra)
    raise AssertionError(f"Unsupported method {method!r}")


# ===========================================================================
# Test class
# ===========================================================================


@pytest.mark.django_db
@override_settings(DEBUG=False, DJANGO_ENV="production")
class TestPaymentViewsReturn404OnDevBypassInProduction(TestCase):
    """5 views × 4 vectors = up to 20 parametrised cases.

    The body-field vector is skipped on GET endpoints (no body to populate).

    Validates: Requirements R16.1, R16.3
    """

    @pytest.mark.parametrize(
        "view_id,method,path,accepts_body,requires_auth",
        PAYMENT_VIEWS,
        ids=[row[0] for row in PAYMENT_VIEWS],
    )
    @pytest.mark.parametrize(
        "vector_id,vector_payload",
        BYPASS_VECTORS,
        ids=[row[0] for row in BYPASS_VECTORS],
    )
    def test_production_returns_404_for_dev_bypass_vector(
        self,
        view_id,
        method,
        path,
        accepts_body,
        requires_auth,
        vector_id,
        vector_payload,
    ):
        # Body-field vector on a GET endpoint is meaningless — skip.
        if "body" in vector_payload and not accepts_body:
            pytest.skip(
                "Body-field dev-bypass vector only applies to POST endpoints"
            )

        client = APIClient()
        if requires_auth:
            profile = _seed_profile()
            client.force_authenticate(user=profile)

        query = vector_payload.get("query")
        headers = vector_payload.get("headers")
        body = None
        if accepts_body:
            # Always include a well-formed body for POST endpoints so the
            # request shape is valid — the dev-bypass vector, not a
            # missing field, must be what triggers the 404.
            body = {"application_id": str(uuid.uuid4())}
            if "body" in vector_payload:
                body.update(vector_payload["body"])

        response = _send(
            client,
            method,
            path,
            body=body,
            headers=headers,
            query=query,
        )

        assert response.status_code == 404, (
            f"View {view_id!r} via vector {vector_id!r} should return 404 "
            f"in production; got {response.status_code}. "
            f"Body: {getattr(response, 'content', b'')!r}."
        )

        # 404 body must be empty (bare ``HttpResponse(status=404)``).
        content = getattr(response, "content", b"") or b""
        assert content == b"", (
            f"View {view_id!r} via vector {vector_id!r} produced a "
            f"non-empty 404 body: {content!r}. The decorator must return "
            f"a bare HttpResponse with no body so the 404 is "
            f"indistinguishable from a missing route."
        )
        # Defensive: must not leak an envelope or a stable code.
        assert b"success" not in content
        assert b"code" not in content

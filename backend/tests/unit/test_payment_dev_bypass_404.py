"""Unit tests — dev-bypass lockout under production settings (Task 17.3).

Asserts that every dev-bypass vector on every payment view returns
HTTP 404 when Django is running in production-equivalent mode
(``DEBUG=False`` and ``DJANGO_ENV='production'``).

Scope for Phase 2
-----------------
The spec pins the full ``@require_not_dev_bypass_in_production``
decorator application to **Task 43** (Phase 5). Today only
``PaymentDevBypassView`` itself refuses to run in production (it
returns 404 when ``DEBUG`` is false or ``PAYMENT_DEV_BYPASS`` is
disabled). The other payment views (``initiate``, ``mobile-money``,
``verify``, ``webhook/lenco``, ``resolve-fee``) do not yet inspect
dev-bypass flags.

Behaviour matrix per the spec:

* **Vectors** — four ways a caller can attempt to toggle dev-bypass:
  ``?dev-bypass=1``, ``?dev=1``, ``X-Dev-Bypass-Auth: 1`` header, and
  ``{"DEV_BYPASS_AUTH": "1"}`` body field.
* **Views** — the five payment views listed in R16.3:
  ``/api/v1/payments/initiate/``, ``/mobile-money/``,
  ``/{id}/verify/``, ``/webhook/lenco/``, ``/resolve-fee/``.

For Phase 2 the test:

* Asserts current behaviour for ``PaymentDevBypassView`` — under
  production settings any call returns 404.
* Skips the cross-view × cross-vector matrix with a pointer to the
  Task 43 implementation that will activate the decorator and make
  these tests pass.

Validates: Requirements R16.1, R16.2, R16.3
"""

from __future__ import annotations

import json
import uuid

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Bypass vectors — the four documented input channels
# ---------------------------------------------------------------------------

BYPASS_VECTORS: tuple[tuple[str, dict], ...] = (
    ("query_dev_bypass", {"query": {"dev-bypass": "1"}}),
    ("query_dev", {"query": {"dev": "1"}}),
    ("header_x_dev_bypass_auth", {"headers": {"HTTP_X_DEV_BYPASS_AUTH": "1"}}),
    ("body_DEV_BYPASS_AUTH", {"body": {"DEV_BYPASS_AUTH": "1"}}),
)


# ---------------------------------------------------------------------------
# Views under test — list of (name, http_method, path_factory, body_extra)
# ---------------------------------------------------------------------------


def _payment_id_placeholder() -> str:
    """Return a stable UUID for path parameters."""
    return str(uuid.UUID("00000000-0000-0000-0000-000000000001"))


PAYMENT_VIEWS: tuple[tuple[str, str, str, bool], ...] = (
    # (name, method, path, accepts_body)
    ("payments_initiate", "post", "/api/v1/payments/initiate/", True),
    ("payments_mobile_money", "post", "/api/v1/payments/mobile-money/", True),
    (
        "payments_verify",
        "post",
        f"/api/v1/payments/{_payment_id_placeholder()}/verify/",
        True,
    ),
    ("payments_webhook_lenco", "post", "/api/v1/payments/webhook/lenco/", True),
    ("payments_resolve_fee", "get", "/api/v1/payments/resolve-fee/", False),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_profile():
    """Create a student Profile used to authenticate non-webhook views."""
    from apps.accounts.models import Profile
    from django.utils import timezone

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"devbypass-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Bypass",
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


def _apply_vector(request_kwargs: dict, vector_payload: dict):
    """Merge a vector payload into a request-kwargs dict."""
    if "query" in vector_payload:
        qs = "&".join(
            f"{k}={v}" for k, v in vector_payload["query"].items()
        )
        request_kwargs["_query_string"] = qs
    if "headers" in vector_payload:
        request_kwargs.setdefault("extra_headers", {}).update(
            vector_payload["headers"]
        )
    if "body" in vector_payload:
        request_kwargs.setdefault("body", {}).update(vector_payload["body"])


def _send(
    client: APIClient,
    method: str,
    path: str,
    *,
    body: dict | None = None,
    extra_headers: dict | None = None,
    query_string: str | None = None,
    application_id: str | None = None,
):
    """Issue the request with the correct method/body/headers/query.

    ``body`` is supplied only for methods that accept a body; for GET
    the body dict is ignored. ``extra_headers`` is merged into the
    ``META`` dict via ``APIClient.generic``-style kwargs.
    """
    url = path
    if query_string:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{query_string}"

    request_kwargs: dict = {}
    if extra_headers:
        request_kwargs.update(extra_headers)

    payload: dict = dict(body or {})
    if application_id and method == "post":
        payload.setdefault("application_id", application_id)

    if method == "post":
        return client.post(
            url,
            data=json.dumps(payload) if payload else "",
            content_type="application/json",
            **request_kwargs,
        )
    if method == "get":
        return client.get(url, **request_kwargs)
    raise AssertionError(f"Unsupported method {method!r}")


# ===========================================================================
# Phase 2 baseline — PaymentDevBypassView itself refuses in production
# ===========================================================================


@pytest.mark.django_db
class TestPaymentDevBypassViewRefusesInProduction:
    """``PaymentDevBypassView`` is the only view with lockout today.

    Validates: Requirements R16.1 (baseline)
    """

    @override_settings(DEBUG=False, DJANGO_ENV="production", PAYMENT_DEV_BYPASS=False)
    def test_post_returns_404_in_production_without_flag(self):
        profile = _seed_profile()
        client = APIClient()
        client.force_authenticate(user=profile)

        response = client.post(
            "/api/v1/payments/dev-bypass/",
            data={"application_id": str(uuid.uuid4())},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND, (
            f"PaymentDevBypassView must return 404 in production; "
            f"got {response.status_code}."
        )


# ===========================================================================
# Phase 5 — @require_not_dev_bypass_in_production across every payment view
# ===========================================================================


@pytest.mark.django_db
class TestPaymentViewsRejectDevBypassInProduction:
    """Cross-view × cross-vector dev-bypass lockout matrix.

    Skipped until Task 43 applies ``@require_not_dev_bypass_in_production``
    to every payment view. When the decorator lands, remove the
    ``pytest.skip`` below and this parametrised suite will activate.

    Validates: Requirements R16.1, R16.3
    """

    @pytest.mark.parametrize(
        "view_name,method,path,accepts_body",
        PAYMENT_VIEWS,
        ids=[v[0] for v in PAYMENT_VIEWS],
    )
    @pytest.mark.parametrize(
        "vector_name,vector_payload",
        BYPASS_VECTORS,
        ids=[v[0] for v in BYPASS_VECTORS],
    )
    @override_settings(DEBUG=False, DJANGO_ENV="production")
    def test_view_returns_404_on_dev_bypass_vector(
        self, view_name, method, path, accepts_body, vector_name, vector_payload,
    ):
        pytest.skip(
            "Task 43 adds @require_not_dev_bypass_in_production to every "
            "payment view; Phase 5."
        )

        # Reference implementation — activated once the decorator ships.
        #
        # profile = _seed_profile()
        # application_id = str(uuid.uuid4())
        #
        # client = APIClient()
        # if view_name != "payments_webhook_lenco":
        #     client.force_authenticate(user=profile)
        #
        # request_kwargs: dict = {}
        # if accepts_body:
        #     request_kwargs["body"] = {}
        # _apply_vector(request_kwargs, vector_payload)
        #
        # response = _send(
        #     client,
        #     method,
        #     path,
        #     body=request_kwargs.get("body"),
        #     extra_headers=request_kwargs.get("extra_headers"),
        #     query_string=request_kwargs.get("_query_string"),
        #     application_id=application_id if accepts_body else None,
        # )
        #
        # assert response.status_code == status.HTTP_404_NOT_FOUND, (
        #     f"View {view_name!r} via vector {vector_name!r} should return "
        #     f"404 in production; got {response.status_code}. "
        #     f"Body: {getattr(response, 'data', None)!r}."
        # )
        # # 404 body must be empty-ish; never leak any envelope keys that
        # # could confirm the route exists beyond what a generic 404 returns.
        # if hasattr(response, "content"):
        #     # Django's default 404 body is short; an empty byte-string or
        #     # a minimal "Not Found" page is acceptable. The invariant is
        #     # that no bypass side-effects are observable.
        #     assert b"success" not in response.content

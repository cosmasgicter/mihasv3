"""Unit test — `require_not_dev_bypass_in_production` is transparent in dev (Task 43.5).

Under ``DEBUG=True`` (non-production posture) and with **no** dev-bypass
vector attached to the request, a view decorated with
``@require_not_dev_bypass_in_production`` must behave identically to the
undecorated view. The decorator must not:

* Alter the HTTP status code.
* Touch the response envelope.
* Trigger any side effect (audit write, counter increment, etc.).

This is the strictest possible passthrough guarantee — it pins that the
decorator is pure observability plus a production lockout, and that
legitimate dev-environment traffic is unaffected even when the payload
looks nothing like a vector.

The test drives two trivial view callables — one decorated, one not —
against the same ``APIRequestFactory`` request, and asserts the outcomes
match exactly. A ``PaymentAuditService.record_payment_event`` spy
independently verifies no audit event was emitted because no vector was
present.

Validates: Requirements R16.1.
"""

from __future__ import annotations

import os
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.http import HttpResponse
from django.test import override_settings
from rest_framework.test import APIRequestFactory

from apps.common.dev_bypass import require_not_dev_bypass_in_production


# ---------------------------------------------------------------------------
# Fixtures — paired view callables (undecorated vs decorated)
# ---------------------------------------------------------------------------


def _undecorated_view(request, **kwargs):
    """Baseline view — returns a 204 with a sentinel header."""
    response = HttpResponse(status=204)
    response["X-Passthrough-Sentinel"] = "1"
    return response


@require_not_dev_bypass_in_production
def _decorated_view(request, **kwargs):
    """Same view, wrapped. Must be transparent under dev + no vector."""
    response = HttpResponse(status=204)
    response["X-Passthrough-Sentinel"] = "1"
    return response


def _build_request(method: str = "post", path: str = "/api/v1/payments/initiate/"):
    factory = APIRequestFactory()
    return getattr(factory, method)(path)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@override_settings(DEBUG=True, DJANGO_ENV="development")
def test_decorated_view_matches_undecorated_when_no_bypass_vector():
    """Validates: Requirements R16.1."""
    request = _build_request()

    # Independently confirm the request carries no dev-bypass vector
    # (defence in depth against a future refactor that changes the
    # request builder).
    assert not any(
        name in request.GET
        for name in ("dev-bypass", "dev_bypass", "DEV_BYPASS_AUTH", "dev")
    ), "Test-builder leaked a dev-bypass query param; the passthrough case requires a vector-free request."

    with patch(
        "apps.documents.payment_audit_service.PaymentAuditService.record_payment_event"
    ) as audit_spy:
        baseline = _undecorated_view(request)
        wrapped = _decorated_view(request)

    assert wrapped.status_code == baseline.status_code
    assert wrapped.status_code == 204
    assert wrapped["X-Passthrough-Sentinel"] == baseline["X-Passthrough-Sentinel"] == "1"
    assert wrapped.content == baseline.content

    # No audit event — the decorator only emits when a vector is
    # present. A passthrough request must leave the audit log alone.
    assert audit_spy.call_count == 0, (
        f"Expected no PaymentAuditService.record_payment_event calls on "
        f"passthrough request; got {audit_spy.call_args_list!r}"
    )


@override_settings(DEBUG=True, DJANGO_ENV="development")
def test_decorated_view_receives_same_kwargs_as_undecorated():
    """``@require_not_dev_bypass_in_production`` forwards kwargs unchanged.

    Validates: Requirements R16.1.
    """
    request = _build_request()

    @require_not_dev_bypass_in_production
    def _echo_view(request, **kwargs):
        response = HttpResponse(status=200)
        response["X-Echo-Kwargs"] = ",".join(sorted(kwargs.keys()))
        response["X-Echo-Method"] = request.method
        return response

    with patch(
        "apps.documents.payment_audit_service.PaymentAuditService.record_payment_event"
    ):
        response = _echo_view(request, payment_id="abc", extra_flag=True)

    assert response.status_code == 200
    assert response["X-Echo-Kwargs"] == "extra_flag,payment_id"
    assert response["X-Echo-Method"] == "POST"


@override_settings(DEBUG=True, DJANGO_ENV="development")
def test_decorated_class_based_view_method_is_passthrough():
    """The decorator recognises ``def post(self, request)`` signatures.

    The detector must still be transparent when the first positional
    arg is ``self`` and the second is the request.

    Validates: Requirements R16.1.
    """
    class _FakeView:
        @require_not_dev_bypass_in_production
        def post(self, request, **kwargs):
            response = HttpResponse(status=201)
            response["X-Instance-Seen"] = type(self).__name__
            return response

    request = _build_request("post")
    view = _FakeView()

    with patch(
        "apps.documents.payment_audit_service.PaymentAuditService.record_payment_event"
    ) as audit_spy:
        response = view.post(request)

    assert response.status_code == 201
    assert response["X-Instance-Seen"] == "_FakeView"
    assert audit_spy.call_count == 0

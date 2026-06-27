"""Regression test — no API route, filename, or envelope drift.

Locks in the five payment API endpoints against accidental drift during
the payment-hardening refactor:

* URL resolution: the canonical paths still resolve to the canonical
  view classes.
* Envelope shape: each endpoint, when hit with a minimal happy-path
  payload, returns a JSON body shaped like ``{"success": bool, "data": ...}``
  on success or ``{"success": False, "error": ..., "code": ...}`` on
  failure.

This is a *contract preservation* test. It does not enforce the happy
path itself (which often requires full DB seeding); it enforces that the
*shape* of the response never drifts, regardless of whether the request
hits 2xx or 4xx. The only strict status assertion is for the webhook,
where R8.2 guarantees a 200 response even for invalid signatures.

Validates: Requirements R22.6
"""

from __future__ import annotations

import json
import uuid

import pytest
from django.urls import resolve

from apps.accounts.authentication import JWTUser
from apps.documents.lenco_webhook_views import LencoWebhookView
from apps.documents.mobile_money_views import MobileMoneyInitiateView
from apps.documents.payment_query_views import FeeResolveView, PaymentVerifyView
from apps.documents.payment_widget_views import PaymentInitiateView
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate


# ---------------------------------------------------------------------------
# Test 1 — URL resolution: paths must still resolve to the expected views
# ---------------------------------------------------------------------------
#
# Note on naming: the design/spec text refers to ``FeeResolverView`` for the
# resolve-fee endpoint, but the actual class in ``apps/documents/views.py``
# is ``FeeResolveView`` and ``apps/documents/urls.py`` imports it under that
# name. This preservation test locks in the CURRENT class name to catch
# drift; if a future rename happens, the rename should be an intentional,
# coordinated change across views, urls, and this assertion.


@pytest.mark.parametrize(
    "path,expected_view_class",
    [
        ("/api/v1/payments/initiate/", PaymentInitiateView),
        ("/api/v1/payments/mobile-money/", MobileMoneyInitiateView),
        (
            f"/api/v1/payments/{uuid.uuid4()}/verify/",
            PaymentVerifyView,
        ),
        ("/api/v1/payments/webhook/lenco/", LencoWebhookView),
        ("/api/v1/payments/resolve-fee/", FeeResolveView),
    ],
    ids=[
        "payments-initiate",
        "payments-mobile-money",
        "payments-verify",
        "payments-webhook-lenco",
        "payments-resolve-fee",
    ],
)
def test_payment_urls_resolve_to_expected_view_classes(path, expected_view_class):
    """Each canonical payment URL still resolves to its canonical view class.

    Validates: Requirements R22.6
    """
    match = resolve(path)
    actual_view_class = getattr(match.func, "view_class", None)
    assert actual_view_class is expected_view_class, (
        f"{path} should resolve to {expected_view_class.__name__}, "
        f"got {actual_view_class.__name__ if actual_view_class else match.func!r}"
    )


# ---------------------------------------------------------------------------
# Test 2 — Envelope shape on minimal happy-path (or documented 4xx) hits
# ---------------------------------------------------------------------------
#
# Each authenticated endpoint is hit with a minimal payload that may or may
# not succeed end-to-end. Because full happy paths require seeded Programs,
# Applications, and Payments, we are lenient on status code (allowing the
# documented 2xx *and* 4xx codes) and strict on envelope shape:
#
#   * body is a dict (never a raw list or string)
#   * body contains a boolean ``success`` key
#   * if success is True, body has ``data``
#   * if success is False, body has ``error`` and ``code``
#
# The webhook is exempt from authentication and is asserted separately
# below per R8.2.


SEEDED_STUDENT_ID = uuid.uuid4()


def _seeded_student() -> JWTUser:
    """A minimal JWTUser that request.user.id/.role checks accept."""
    return JWTUser(
        {
            "user_id": str(SEEDED_STUDENT_ID),
            "email": "contract-preservation@example.test",
            "role": "student",
            "first_name": "Contract",
            "last_name": "Preservation",
        }
    )


def _assert_envelope_shape(body, *, path: str) -> None:
    """Assert the response body is a ``{"success", ...}`` envelope.

    On ``success=True``, ``data`` must be present. On ``success=False``,
    both ``error`` and ``code`` must be present. Nothing else is
    enforced about the payload shape — this is a contract preservation
    guard, not a full-schema test.
    """
    assert isinstance(body, dict), (
        f"{path}: response body must be a dict envelope, "
        f"got {type(body).__name__}: {body!r}"
    )
    assert "success" in body, (
        f"{path}: response body missing 'success' key; got keys={list(body.keys())}"
    )
    assert isinstance(body["success"], bool), (
        f"{path}: 'success' must be a bool, got {type(body['success']).__name__}"
    )

    if body["success"] is True:
        assert "data" in body, (
            f"{path}: success response missing 'data' key; got keys={list(body.keys())}"
        )
    else:
        assert "error" in body, (
            f"{path}: error response missing 'error' key; got keys={list(body.keys())}"
        )
        assert "code" in body, (
            f"{path}: error response missing 'code' key; got keys={list(body.keys())}"
        )


def _call_view(view_class, method: str, path: str, *, user, data=None):
    """Build a force-authenticated request and invoke the view directly.

    Avoids DB round-trips for middleware/URL resolution while still
    exercising the full view logic and envelope shaping.
    """
    factory = APIRequestFactory()
    handler = getattr(factory, method.lower())
    kwargs = {}
    if data is not None:
        kwargs["data"] = data
        kwargs["format"] = "json"
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# ---- /api/v1/payments/initiate/ ----


def test_payment_initiate_preserves_envelope_shape():
    """POST /api/v1/payments/initiate/ returns the standard envelope.

    Validates: Requirements R22.6
    """
    view = PaymentInitiateView.as_view()
    user = _seeded_student()

    # Unknown application_id → documented 404 ``Application not found``
    # with the standard error envelope, or 201 on the (unlikely) happy
    # path. Either way, the envelope shape is what we lock in.
    request = _call_view(
        PaymentInitiateView,
        "post",
        "/api/v1/payments/initiate/",
        user=user,
        data={"application_id": str(uuid.uuid4())},
    )
    response = view(request)

    assert response.status_code in (201, 400, 403, 404, 500), (
        f"unexpected initiate status {response.status_code}: {response.data!r}"
    )
    _assert_envelope_shape(response.data, path="/api/v1/payments/initiate/")


# ---- /api/v1/payments/mobile-money/ ----


def test_payment_mobile_money_preserves_envelope_shape():
    """POST /api/v1/payments/mobile-money/ returns the standard envelope.

    Validates: Requirements R22.6
    """
    view = MobileMoneyInitiateView.as_view()
    user = _seeded_student()

    request = _call_view(
        MobileMoneyInitiateView,
        "post",
        "/api/v1/payments/mobile-money/",
        user=user,
        data={
            "application_id": str(uuid.uuid4()),
            "phone": "0977123456",
            "operator": "airtel",
        },
    )
    response = view(request)

    # Documented status ranges: 201/202 success, 400 validation, 403
    # ownership, 404 application not found, 409 existing active payment,
    # 500 unexpected. Contract preservation allows the full set.
    assert response.status_code in (200, 201, 202, 400, 403, 404, 409, 500), (
        f"unexpected mobile-money status {response.status_code}: {response.data!r}"
    )
    _assert_envelope_shape(response.data, path="/api/v1/payments/mobile-money/")


# ---- /api/v1/payments/{id}/verify/ ----


def test_payment_verify_preserves_envelope_shape():
    """POST /api/v1/payments/{id}/verify/ returns the standard envelope.

    Validates: Requirements R22.6
    """
    view = PaymentVerifyView.as_view()
    user = _seeded_student()
    payment_id = uuid.uuid4()

    request = _call_view(
        PaymentVerifyView,
        "post",
        f"/api/v1/payments/{payment_id}/verify/",
        user=user,
    )
    with pytest.MonkeyPatch.context() as mp:
        from apps.documents.models import Payment

        mp.setattr(
            "apps.documents.payment_query_views.Payment.objects.get",
            lambda **kwargs: (_ for _ in ()).throw(Payment.DoesNotExist()),
        )
        response = view(request, payment_id=payment_id)

    # Verify can legitimately return 200 (terminal status cached), 200
    # with success=False (verification error envelope), 403 (ownership),
    # or 404 (payment not found).
    assert response.status_code in (200, 403, 404), (
        f"unexpected verify status {response.status_code}: {response.data!r}"
    )
    _assert_envelope_shape(
        response.data, path=f"/api/v1/payments/{payment_id}/verify/"
    )


# ---- /api/v1/payments/resolve-fee/ ----


def test_payment_resolve_fee_preserves_envelope_shape():
    """GET /api/v1/payments/resolve-fee/ returns the standard envelope.

    Validates: Requirements R22.6
    """
    view = FeeResolveView.as_view()
    user = _seeded_student()

    factory = APIRequestFactory()
    # A ``program_code`` is required (400 otherwise). Use a syntactically
    # valid but unlikely-to-exist code so we land on a deterministic
    # documented 404 (Program.DoesNotExist) or, if seeded, 200.
    request = factory.get(
        "/api/v1/payments/resolve-fee/",
        {"program_code": "CONTRACT_PRESERVATION_TEST"},
    )
    force_authenticate(request, user=user)
    with pytest.MonkeyPatch.context() as mp:
        from apps.catalog.models import Program

        mp.setattr(
            "apps.documents.fee_resolver.FeeResolver.resolve_fee",
            lambda *args, **kwargs: (_ for _ in ()).throw(Program.DoesNotExist()),
        )
        response = view(request)

    assert response.status_code in (200, 400, 404), (
        f"unexpected resolve-fee status {response.status_code}: {response.data!r}"
    )
    _assert_envelope_shape(response.data, path="/api/v1/payments/resolve-fee/")


# ---- /api/v1/payments/webhook/lenco/ ----
#
# The webhook is unauthenticated and is subject to R8.2: the endpoint
# SHALL return HTTP 200 even when signature validation fails. This is
# the one endpoint where we assert a strict status code, since the
# contract promise to Lenco is "never return non-200 to a webhook
# delivery attempt" — otherwise the provider retries aggressively and
# backpressures the ledger.


@pytest.mark.django_db
def test_payment_webhook_preserves_envelope_and_returns_200_on_invalid_signature():
    """POST /api/v1/payments/webhook/lenco/ with an invalid signature
    returns HTTP 200 per R8.2 and preserves the envelope shape.

    R8.2 is authoritative: the webhook endpoint SHALL return HTTP 200
    even when signature validation fails (to avoid provider retry
    storms). This assertion locks that contract in.

    Validates: Requirements R22.6, R8.2
    """
    client = APIClient()

    # A minimal, syntactically-valid Lenco-shaped webhook payload with a
    # deliberately invalid signature. The webhook is AllowAny, so no
    # auth is needed.
    payload = {
        "event": "collection.successful",
        "data": {
            "id": f"evt-{uuid.uuid4().hex[:12]}",
            "reference": "CONTRACT-PRESERVATION-TEST",
            "amount": "100.00",
        },
    }
    response = client.post(
        "/api/v1/payments/webhook/lenco/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_X_LENCO_SIGNATURE="invalid-signature-for-contract-preservation",
    )

    assert response.status_code == 200, (
        "Per R8.2, the webhook endpoint must return HTTP 200 even on "
        f"invalid signatures; got {response.status_code}: {response.content!r}"
    )

    body = response.json()
    assert isinstance(body, dict), (
        f"webhook response body must be a dict; got {type(body).__name__}: {body!r}"
    )

    # The webhook legitimately has two historical body shapes:
    #  * legacy success path: {"received": True}
    #  * envelope path: {"success": ..., ...}
    # Both preserve the contract; assert at least one is present so any
    # future refactor into an arbitrary third shape trips this guard.
    assert "success" in body or "received" in body, (
        "webhook response body must contain 'success' or 'received'; "
        f"got keys={list(body.keys())}"
    )

    # If the envelope form is used, enforce ``success`` is a bool. We do
    # NOT enforce the full ``error``/``code`` pair here because the
    # legacy invalid-signature response is ``{"success": False, "error":
    # ...}`` without a ``code`` field; tightening that shape belongs to
    # the Phase 2 refactor (R15.x stable error codes), not this
    # preservation guard.
    if "success" in body:
        assert isinstance(body["success"], bool), (
            "webhook 'success' must be bool; "
            f"got {type(body['success']).__name__}"
        )
        if body["success"] is False:
            assert "error" in body, (
                f"webhook error response missing 'error' key; keys={list(body.keys())}"
            )

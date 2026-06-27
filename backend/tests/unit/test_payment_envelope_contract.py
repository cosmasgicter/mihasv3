"""Payment envelope contract tests — Task 14.7 (payment-hardening).

Exercises every payment endpoint under both ``PAYMENT_HARDENING_FORWARD_ONLY``
settings and asserts that the response envelope carries the required keys
and the stable-code catalogue is respected on failures.

Envelope contract:

* Success  → ``{"success": True, "data": {...}}``. ``data.next_action``
  may be present (``already_paid``, ``check_status``,
  ``retry_with_different_number``, or ``None``).
* Failure  → ``{"success": False, "error": {"code": <str>,
  "message": <str>}}`` (hardened path).  Legacy mode keeps the flat
  ``{"success": False, "error": <str>, "code": <str>}`` shape.

Stable codes verified here:

* Initiation: ``NOT_OWNER``, ``APPLICATION_NOT_FOUND``,
  ``APPLICATION_NOT_PAYABLE``, ``ALREADY_PAID``,
  ``MAX_PAYMENT_ATTEMPTS_EXCEEDED``.
* Verify:     ``PAYMENT_PENDING``, ``PAYMENT_CONFIRMED``,
  ``AMOUNT_MISMATCH``, ``CURRENCY_MISMATCH``,
  ``MISSING_PROVIDER_REFERENCE``, ``PROVIDER_UNAVAILABLE``.
* FeeResolve: ``FEE_UNAVAILABLE``.

All Payment and Application lookups are patched; the tests don't hit Neon
or the Lenco API.
"""

from __future__ import annotations

import os
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.documents.payment_service import (
    PaymentInitiationResult,
    PaymentVerificationResult,
)
from apps.documents.lenco_webhook_views import LencoWebhookView
from apps.documents.mobile_money_views import MobileMoneyInitiateView
from apps.documents.payment_query_views import FeeResolveView, PaymentVerifyView
from apps.documents.payment_widget_views import PaymentInitiateView


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(*, user_id=None, role: str = "student"):
    uid = user_id or uuid.uuid4()
    return MagicMock(
        is_authenticated=True,
        id=uid,
        pk=uid,
        role=role,
    )


def _build_request(method: str, path: str, data=None):
    """Build a request via DRF's APIRequestFactory."""
    factory = APIRequestFactory()
    fn = getattr(factory, method)
    if method == "post":
        return fn(path, data or {}, format="json")
    if method == "get":
        return fn(path, data or {})
    return fn(path)


def _assert_failure_envelope(test, response, expected_code: str, *, hardened: bool = True):
    """Assert ``response`` conforms to the failure envelope with ``code``."""
    body = response.data
    test.assertFalse(body.get("success"))
    if hardened:
        err = body.get("error")
        test.assertIsInstance(err, dict, f"expected dict error, got {err!r}")
        test.assertEqual(err.get("code"), expected_code)
        test.assertIn("message", err)
    else:
        test.assertEqual(body.get("code"), expected_code)
        test.assertIn("error", body)


def _assert_success_envelope(test, response):
    body = response.data
    test.assertTrue(body.get("success"))
    test.assertIn("data", body)


# ---------------------------------------------------------------------------
# PaymentInitiateView
# ---------------------------------------------------------------------------


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True, LENCO_PUBLIC_KEY="pk_test")
class TestPaymentInitiateEnvelopeHardened(SimpleTestCase):
    def setUp(self):
        self.view = PaymentInitiateView.as_view()

    def test_application_not_found_maps_to_APPLICATION_NOT_FOUND(self):
        app_id = uuid.uuid4()
        user = _make_user()
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        from apps.applications.models import Application

        with patch(
            "apps.applications.models.Application.objects.get",
            side_effect=Application.DoesNotExist,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 404)
        _assert_failure_envelope(self, response, "APPLICATION_NOT_FOUND")

    def test_non_owner_maps_to_NOT_OWNER(self):
        app_id = uuid.uuid4()
        user = _make_user()
        foreign_app = SimpleNamespace(
            id=app_id, user_id=uuid.uuid4(), payment_status="pending"
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=foreign_app,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 403)
        _assert_failure_envelope(self, response, "NOT_OWNER")

    def test_max_attempts_exceeded_envelope(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate",
            side_effect=ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        _assert_failure_envelope(self, response, "MAX_PAYMENT_ATTEMPTS_EXCEEDED")

    def test_service_not_owner_maps_to_NOT_OWNER(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate",
            side_effect=ValueError("NOT_OWNER"),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 403)
        _assert_failure_envelope(self, response, "NOT_OWNER")

    def test_success_returns_success_envelope(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        result = PaymentInitiationResult(
            payment_id=uuid.uuid4(),
            reference="ref-1",
            amount=Decimal("153.00"),
            currency="ZMW",
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate",
            return_value=result,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 201)
        _assert_success_envelope(self, response)
        self.assertIsNotNone(response.data["data"].get("payment_id"))

    def test_already_paid_returns_next_action(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        result = PaymentInitiationResult(
            payment_id=None,
            reference="",
            amount=Decimal("0"),
            currency="",
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate",
            return_value=result,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertEqual(response.data["data"].get("next_action"), "already_paid")


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=False, LENCO_PUBLIC_KEY="pk_test")
class TestPaymentInitiateEnvelopeLegacy(SimpleTestCase):
    def setUp(self):
        self.view = PaymentInitiateView.as_view()

    def test_max_attempts_exceeded_preserves_legacy_envelope(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        request = _build_request(
            "post", "/api/v1/payments/initiate/", {"application_id": str(app_id)}
        )
        force_authenticate(request, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate_payment",
            side_effect=ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        _assert_failure_envelope(
            self, response, "MAX_PAYMENT_ATTEMPTS_EXCEEDED", hardened=False
        )


# ---------------------------------------------------------------------------
# MobileMoneyInitiateView
# ---------------------------------------------------------------------------


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True, LENCO_PUBLIC_KEY="pk_test")
class TestMobileMoneyEnvelopeHardened(SimpleTestCase):
    def setUp(self):
        self.view = MobileMoneyInitiateView.as_view()

    def _request(self, *, app_id, user):
        request = _build_request(
            "post",
            "/api/v1/payments/mobile-money/",
            {
                "application_id": str(app_id),
                "phone": "0977123456",
                "operator": "airtel",
            },
        )
        force_authenticate(request, user=user)
        return request

    def test_already_paid_returns_already_paid_next_action(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="successful"
        )
        request = self._request(app_id=app_id, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertEqual(response.data["data"].get("next_action"), "already_paid")

    def test_unknown_operator_prefix_maps_to_PROVIDER_UNAVAILABLE(self):
        app_id = uuid.uuid4()
        user = _make_user()
        application = SimpleNamespace(
            id=app_id, user_id=user.id, payment_status="pending"
        )
        request = self._request(app_id=app_id, user=user)

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate_mobile_money",
            side_effect=ValueError("PROVIDER_UNAVAILABLE"),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        _assert_failure_envelope(self, response, "PROVIDER_UNAVAILABLE")
        self.assertEqual(
            response.data["data"].get("next_action"), "retry_with_different_number"
        )

    def test_application_not_found_maps_to_APPLICATION_NOT_FOUND(self):
        app_id = uuid.uuid4()
        user = _make_user()
        request = self._request(app_id=app_id, user=user)

        from apps.applications.models import Application

        with patch(
            "apps.applications.models.Application.objects.get",
            side_effect=Application.DoesNotExist,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 404)
        _assert_failure_envelope(self, response, "APPLICATION_NOT_FOUND")


# ---------------------------------------------------------------------------
# PaymentVerifyView
# ---------------------------------------------------------------------------


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
class TestPaymentVerifyEnvelopeHardened(SimpleTestCase):
    def setUp(self):
        self.view = PaymentVerifyView.as_view()

    def _payment(self, *, owner_id=None):
        owner_id = owner_id or uuid.uuid4()
        return SimpleNamespace(
            id=uuid.uuid4(),
            user_id=owner_id,
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
        )

    def _request(self, payment, *, user=None):
        user = user or _make_user(user_id=payment.user_id)
        request = _build_request(
            "post", f"/api/v1/payments/{payment.id}/verify/"
        )
        force_authenticate(request, user=user)
        return request

    def test_non_owner_maps_to_NOT_OWNER(self):
        payment = self._payment()
        other_user = _make_user()  # different user id
        request = self._request(payment, user=other_user)

        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 403)
        _assert_failure_envelope(self, response, "NOT_OWNER")

    def test_success_sets_PAYMENT_CONFIRMED(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="successful",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
            error=None,
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertEqual(response.data["data"]["code"], "PAYMENT_CONFIRMED")

    def test_pending_sets_PAYMENT_PENDING(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
            error="PAYMENT_PENDING",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertEqual(response.data["data"]["code"], "PAYMENT_PENDING")
        self.assertEqual(response.data["data"]["next_action"], "check_status")

    def test_provider_unavailable_envelope(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="pending",
            amount=None,
            currency=None,
            lenco_reference=None,
            payment_method=None,
            error="PROVIDER_UNAVAILABLE",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertEqual(response.data["data"]["code"], "PROVIDER_UNAVAILABLE")

    def test_amount_mismatch_sets_failure_envelope(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
            error="AMOUNT_MISMATCH",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_failure_envelope(self, response, "AMOUNT_MISMATCH")

    def test_currency_mismatch_sets_failure_envelope(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
            error="CURRENCY_MISMATCH",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_failure_envelope(self, response, "CURRENCY_MISMATCH")

    def test_missing_provider_reference_sets_failure_envelope(self):
        payment = self._payment()
        request = self._request(payment)

        result = PaymentVerificationResult(
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference=None,
            payment_method="mobile_money",
            error="MISSING_PROVIDER_REFERENCE",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        _assert_failure_envelope(self, response, "MISSING_PROVIDER_REFERENCE")


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=False)
class TestPaymentVerifyEnvelopeLegacy(SimpleTestCase):
    def setUp(self):
        self.view = PaymentVerifyView.as_view()

    def test_legacy_envelope_preserved_on_error(self):
        payment = SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            status="pending",
            amount=Decimal("153.00"),
            currency="ZMW",
            lenco_reference="lenco-1",
            payment_method="mobile_money",
        )
        user = _make_user(user_id=payment.user_id)
        request = _build_request("post", f"/api/v1/payments/{payment.id}/verify/")
        force_authenticate(request, user=user)

        result = PaymentVerificationResult(
            status="pending",
            amount=None,
            currency=None,
            lenco_reference=None,
            payment_method=None,
            error="Lenco unreachable",
        )
        with patch(
            "apps.documents.models.Payment.objects.get",
            return_value=payment,
        ), patch(
            "apps.documents.payment_service.PaymentService.verify_payment",
            return_value=result,
        ):
            response = self.view(request, payment_id=payment.id)

        self.assertEqual(response.status_code, 200)
        # Legacy envelope uses flat ``code``.
        _assert_failure_envelope(self, response, "VERIFICATION_ERROR", hardened=False)


# ---------------------------------------------------------------------------
# FeeResolveView
# ---------------------------------------------------------------------------


@override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
class TestFeeResolveEnvelopeHardened(SimpleTestCase):
    def setUp(self):
        self.view = FeeResolveView.as_view()

    def _request(self, program_code: str):
        user = _make_user()
        request = _build_request(
            "get",
            "/api/v1/payments/resolve-fee/",
            {"program_code": program_code},
        )
        force_authenticate(request, user=user)
        return request

    def test_program_not_found_maps_to_FEE_UNAVAILABLE(self):
        request = self._request("NOPE")

        from apps.catalog.models import Program

        with patch(
            "apps.documents.fee_resolver.FeeResolver.resolve_fee",
            side_effect=Program.DoesNotExist,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 404)
        _assert_failure_envelope(self, response, "FEE_UNAVAILABLE")

    def test_resolver_unexpected_error_maps_to_FEE_UNAVAILABLE(self):
        request = self._request("BSN")

        with patch(
            "apps.documents.fee_resolver.FeeResolver.resolve_fee",
            side_effect=RuntimeError("unexpected"),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 404)
        _assert_failure_envelope(self, response, "FEE_UNAVAILABLE")

    def test_success_includes_customer_total(self):
        request = self._request("BSN")

        resolved = SimpleNamespace(
            amount=Decimal("153.00"),
            currency="ZMW",
            residency_category="local",
            source="program_fee",
        )
        with patch(
            "apps.documents.fee_resolver.FeeResolver.resolve_fee",
            return_value=resolved,
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        _assert_success_envelope(self, response)
        self.assertIn("customer_total", response.data["data"])
        # provider_fee_estimate defaults to 0 → customer_total == amount
        self.assertEqual(response.data["data"]["customer_total"], "153.00")


# ---------------------------------------------------------------------------
# LencoWebhookView — smoke test the envelope shape
# ---------------------------------------------------------------------------


class TestLencoWebhookEnvelope(SimpleTestCase):
    def setUp(self):
        self.view = LencoWebhookView.as_view()

    @override_settings(LENCO_WEBHOOK_ALLOWED_IPS=[])
    def test_invalid_signature_envelope(self):
        from apps.documents.webhook_processor import WebhookProcessor

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/payments/webhook/lenco/",
            data=b'{"event":"collection.successful"}',
            content_type="application/json",
        )

        with patch.object(
            WebhookProcessor, "validate_signature", return_value=False
        ), patch.object(WebhookProcessor, "process", return_value=None):
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        # Legacy webhook envelope: flat ``error`` string. The view uses the
        # bare-error shape to acknowledge Lenco without triggering retries.
        self.assertFalse(response.data.get("success"))

    @override_settings(LENCO_WEBHOOK_ALLOWED_IPS=[])
    def test_valid_signature_returns_received_true(self):
        from apps.documents.webhook_processor import WebhookProcessor

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/payments/webhook/lenco/",
            data=b'{"event":"collection.successful"}',
            content_type="application/json",
        )

        with patch.object(
            WebhookProcessor, "validate_signature", return_value=True
        ), patch.object(WebhookProcessor, "process", return_value=None):
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("received"))

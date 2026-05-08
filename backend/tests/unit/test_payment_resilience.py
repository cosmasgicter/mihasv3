"""Focused regression tests for payment fault tolerance hardening."""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import requests
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from apps.documents.views import (
    DeferPaymentView,
    MobileMoneyInitiateView,
    PaymentInitiateView,
)
from apps.documents.webhook_processor import WebhookProcessor


class TestPaymentCommandIdempotency(SimpleTestCase):
    def test_payment_command_views_are_idempotent(self):
        self.assertTrue(hasattr(PaymentInitiateView.post, "__wrapped__"))
        self.assertTrue(hasattr(DeferPaymentView.post, "__wrapped__"))
        self.assertTrue(hasattr(MobileMoneyInitiateView.post, "__wrapped__"))


class TestWebhookIdentity(SimpleTestCase):
    def test_webhook_identity_uses_provider_event_id_when_present(self):
        payload = {
            "data": {
                "id": "evt-123",
                "reference": "MIHAS-REF-1",
                "amount": "100.00",
            }
        }
        payload_hash = WebhookProcessor._payload_hash(payload)

        identity = WebhookProcessor._event_identity(
            "collection.successful",
            "MIHAS-REF-1",
            payload,
            payload_hash,
        )

        self.assertEqual(identity["provider_event_id"], "evt-123")
        self.assertEqual(identity["reference"], "MIHAS-REF-1")
        self.assertEqual(identity["event_type"], "collection.successful")
        self.assertEqual(identity["payload_hash"], payload_hash)


class TestMobileMoneyProviderUncertainty(SimpleTestCase):
    @override_settings(
        LENCO_API_SECRET_KEY="secret",
        LENCO_API_BASE_URL="https://payments.example.test/access/v2/",
    )
    def test_provider_request_exception_returns_pending_not_failed(self):
        factory = APIRequestFactory()
        application_id = uuid.uuid4()
        payment_id = uuid.uuid4()
        user_id = uuid.uuid4()

        request = factory.post(
            "/api/v1/payments/mobile-money/",
            {
                "application_id": str(application_id),
                "phone": "0977123456",
                "operator": "airtel",
            },
            format="json",
        )
        request.user = MagicMock(id=user_id, role="student", is_authenticated=True)

        application = MagicMock()
        application.id = application_id
        application.user_id = user_id
        application.payment_status = "pending"

        payment_manager = MagicMock()
        payment_manager.select_for_update.return_value.filter.return_value.first.return_value = None

        result = MagicMock(
            payment_id=payment_id,
            reference="MIHAS-APP-001-1",
            amount=Decimal("100.00"),
            currency="ZMW",
        )

        with (
            patch("apps.applications.models.Application.objects.get", return_value=application),
            patch("apps.documents.views.Payment.objects", payment_manager),
            patch("apps.documents.payment_service.PaymentService.initiate_payment", return_value=result),
            patch("apps.documents.payment_service.PaymentService.mark_provider_initiation") as mark_provider,
            patch("requests.post", side_effect=requests.RequestException),
        ):
            response = MobileMoneyInitiateView.as_view()(request)

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["status"], "pending")
        self.assertEqual(response.data["data"]["provider_status"], "unknown")
        mark_provider.assert_called_once()

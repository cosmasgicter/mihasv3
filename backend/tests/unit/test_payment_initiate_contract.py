"""Payment initiation response contract tests."""

import os
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.documents.payment_service import PaymentInitiationResult
from apps.documents.payment_widget_views import PaymentInitiateView


class TestPaymentInitiateContract(SimpleTestCase):
    @override_settings(LENCO_PUBLIC_KEY="pk_test")
    def test_already_paid_payment_id_is_null_not_string_none(self):
        application_id = uuid.uuid4()
        user_id = uuid.uuid4()
        application = SimpleNamespace(id=application_id, user_id=user_id)
        request = APIRequestFactory().post(
            "/api/v1/payments/initiate/",
            {"application_id": str(application_id)},
            format="json",
        )
        user = MagicMock(
            is_authenticated=True,
            id=user_id,
            pk=user_id,
            role="student",
        )

        result = PaymentInitiationResult(
            payment_id=None,
            reference="",
            amount=Decimal("0"),
            currency="",
        )

        with patch(
            "apps.applications.models.Application.objects.get",
            return_value=application,
        ), patch(
            "apps.documents.payment_service.PaymentService.initiate",
            return_value=result,
        ):
            force_authenticate(request, user=user)
            response = PaymentInitiateView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["data"]["payment_id"])

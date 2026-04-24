"""Regression coverage for legacy payment-row approval gating."""

import uuid
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import ApplicationReviewView


def _make_user(user_id=None, role="admin"):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "admin@mihas.edu.zm",
        "role": role,
        "first_name": "Admin",
        "last_name": "User",
    })


def _make_application(app_id=None, user_id=None, status="submitted", payment_status="pending"):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(user_id or uuid.uuid4())
    app.status = status
    app.payment_status = payment_status
    app.full_name = "Jane Banda"
    app.program = "Computer Science"
    app.intake = None
    app.email = "jane@example.com"
    return app


class TestApplicationReviewPaymentGate:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationReviewView.as_view()
        self.admin = _make_user()

    @patch("apps.applications.admin_views.ApplicationStatusHistory.objects")
    @patch("apps.applications.admin_views.Payment.objects")
    @patch("apps.applications.admin_views.CommunicationService.send")
    @patch("apps.applications.admin_views.transition_application_status")
    @patch("apps.applications.admin_views.Application.objects")
    def test_approval_accepts_legacy_paid_payment_row(
        self,
        mock_app_qs,
        mock_transition,
        mock_comm_send,
        mock_payment_qs,
        mock_history_qs,
    ):
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment_qs.filter.return_value.exists.return_value = True
        mock_history_qs.filter.return_value.order_by.return_value.first.return_value = None

        request = self.factory.post(
            f"/api/v1/applications/{app.id}/review/",
            data={"new_status": "approved"},
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_transition.assert_called_once()
        mock_comm_send.assert_called_once()
        _, filter_kwargs = mock_payment_qs.filter.call_args
        assert filter_kwargs["application_id"] == app.id
        assert set(filter_kwargs["status__in"]) >= {"successful", "force_approved", "verified", "paid", "deferred"}

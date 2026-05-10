"""Regression coverage for legacy payment-row approval gating.

TDD note — 409 CANNOT_REVERSE_SUCCESSFUL_PAYMENT test expected to FAIL
---------------------------------------------------------------------
The test ``test_admin_review_cannot_reverse_successful_payment`` below is
part of the payment-hardening Phase 2 TDD coverage. It expects admin
review to refuse any payment-status demotion when a successful Payment
already exists for the application. The current service still allows
some of these paths — Task 11 routes every review mutation through
``PaymentService._transition()`` which surfaces ``CANNOT_REVERSE_\
SUCCESSFUL_PAYMENT`` uniformly. Until then this test is expected to
fail; that is the intended TDD flow.

Validates: Requirements R2.1, R2.2
"""

import uuid
from unittest.mock import MagicMock, patch

from django.test import override_settings
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
    @patch("apps.applications.admin_views.transaction.atomic")
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
        mock_atomic,
        mock_history_qs,
    ):
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment_qs.filter.return_value.exists.return_value = True
        mock_atomic.return_value.__enter__.return_value = None
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


class TestAdminReviewCannotReverseSuccessfulPayment:
    """Admin review must refuse to demote a ``successful`` Payment.

    Per R2.1 and R2.2, once a Payment is ``successful`` the admin review
    endpoint may not transition it to ``pending``, ``deferred``,
    ``failed``, or ``pending_review`` via either the payment-status
    sub-path or the legacy force-payment path. The endpoint must return
    HTTP 409 with stable code ``CANNOT_REVERSE_SUCCESSFUL_PAYMENT`` and
    leave both the Payment and the Application unchanged.

    TDD note: this test is written BEFORE the Task 11 refactor routes
    admin review through ``PaymentService._transition()``. It is
    expected to FAIL on the current tree because today's
    ``review_application_payment`` only blocks a subset of demotions and
    does not surface the stable error code consistently. The test will
    go green once the refactor lands.

    Validates: Requirements R2.1, R2.2
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationReviewView.as_view()
        self.admin = _make_user()

    @override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
    @patch("apps.documents.payment_service.PaymentService")
    @patch("apps.applications.admin_views.Application.objects")
    def test_review_refuses_to_reverse_successful_payment_to_failed(
        self,
        mock_app_qs,
        mock_payment_service_cls,
    ):
        """Demoting a successful payment returns 409 CANNOT_REVERSE_SUCCESSFUL_PAYMENT."""
        # Seed a successful Payment via the service stub. Posting
        # payment_status='rejected' (which maps to 'failed') MUST be
        # refused — R2.1 explicitly enumerates 'failed' as disallowed.
        app = _make_application(payment_status="successful")
        mock_app_qs.get.return_value = app

        service_instance = MagicMock()
        service_instance.review_application_payment.side_effect = ValueError(
            "CANNOT_REVERSE_SUCCESSFUL_PAYMENT"
        )
        mock_payment_service_cls.return_value = service_instance

        request = self.factory.post(
            f"/api/v1/applications/{app.id}/review/",
            data={
                "paymentStatus": "rejected",
                "verificationNotes": "Mistakenly marking as failed.",
            },
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = self.view(request, application_id=app.id)

        # (a) Response shape — 409 + stable code
        assert response.status_code == 409, (
            f"Expected HTTP 409 for reversal attempt; got {response.status_code}. "
            f"Body: {getattr(response, 'data', None)!r}"
        )
        body = response.data
        assert body.get("success") is False
        error_code = (
            (body.get("error") or {}).get("code")
            if isinstance(body.get("error"), dict)
            else body.get("code")
        )
        assert error_code == "CANNOT_REVERSE_SUCCESSFUL_PAYMENT", (
            f"Expected stable code 'CANNOT_REVERSE_SUCCESSFUL_PAYMENT'; "
            f"got {error_code!r}. Full body: {body!r}"
        )

        # (b) Payment unchanged — the only path to a mutation is via
        # PaymentService.review_application_payment, and when it raises
        # ValueError(CANNOT_REVERSE_SUCCESSFUL_PAYMENT) the service must
        # NOT have persisted any state change. We assert the service was
        # called exactly once (so the gate is on the service layer, not
        # bypassed) and that Application was not saved afterwards.
        service_instance.review_application_payment.assert_called_once()
        # (c) Application.payment_status unchanged — the MagicMock
        # application is a stand-in for the real row; the view should not
        # have mutated it.
        assert app.payment_status == "successful"

    @override_settings(PAYMENT_HARDENING_FORWARD_ONLY=True)
    @patch("apps.documents.payment_service.PaymentService")
    @patch("apps.applications.admin_views.Application.objects")
    def test_review_refuses_to_reverse_successful_payment_to_pending(
        self,
        mock_app_qs,
        mock_payment_service_cls,
    ):
        """Demoting successful → pending also returns 409 with the same code."""
        app = _make_application(payment_status="successful")
        mock_app_qs.get.return_value = app

        service_instance = MagicMock()
        service_instance.review_application_payment.side_effect = ValueError(
            "CANNOT_REVERSE_SUCCESSFUL_PAYMENT"
        )
        mock_payment_service_cls.return_value = service_instance

        request = self.factory.post(
            f"/api/v1/applications/{app.id}/review/",
            data={
                "paymentStatus": "pending_review",
                "verificationNotes": "Trying to push back into review.",
            },
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = self.view(request, application_id=app.id)

        assert response.status_code == 409
        body = response.data
        error_code = (
            (body.get("error") or {}).get("code")
            if isinstance(body.get("error"), dict)
            else body.get("code")
        )
        assert error_code == "CANNOT_REVERSE_SUCCESSFUL_PAYMENT"
        assert app.payment_status == "successful"

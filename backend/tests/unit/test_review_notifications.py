"""Unit tests for review notification + email dispatch.

When an admin approves or rejects an application, the system should:
1. Dispatch via CommunicationService.send() with the appropriate template key
2. CommunicationService creates Notification + EmailQueue records internally

Implements task 3.3 (go-live-polish), updated for task 10.3 (template migration).
Requirements: 2.3, 9.8
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import ApplicationReviewView


# ---------------------------------------------------------------------------
# Patch targets
# ---------------------------------------------------------------------------

_APP = "apps.applications.views.Application.objects"
_TRANSITION = "apps.applications.views.transition_application_status"
_INTAKE_ENFORCER = "apps.applications.intake_enforcer.IntakeEnforcer"
_COMM_SEND = "apps.common.communication_service.CommunicationService.send"
_PAYMENT = "apps.documents.models.Payment.objects"
_HISTORY = "apps.applications.views.ApplicationStatusHistory.objects"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, role="admin"):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "***REMOVED***",
        "role": role,
        "first_name": "Admin",
        "last_name": "User",
    })


def _make_application(app_id=None, user_id=None, status="submitted"):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(user_id or uuid.uuid4())
    app.status = status
    app.full_name = "Jane Banda"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.email = "jane@example.com"
    app.payment_status = "paid"
    return app


def _auth_request(factory, path, user, data):
    request = factory.post(path, data=data, format="json")
    force_authenticate(request, user=user)
    return request


# ---------------------------------------------------------------------------
# Approval creates Notification + queues email
# ---------------------------------------------------------------------------


class TestApprovalCreatesNotificationAndEmail:
    """POST /api/v1/applications/{id}/review/ with new_status=approved"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationReviewView.as_view()
        self.admin = _make_user()
        # Mock transaction.atomic so select_for_update doesn't need a real DB
        self._tx_patcher = patch("apps.applications.admin_views.transaction")
        mock_tx = self._tx_patcher.start()
        mock_tx.atomic.return_value.__enter__ = MagicMock()
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

    def teardown_method(self):
        self._tx_patcher.stop()

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_creates_notification(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send,
        mock_payment, mock_history,
    ):
        """Approving an application calls CommunicationService.send with application_approved."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once()
        call_args = mock_comm_send.call_args
        assert call_args[0][0] == "application_approved"
        assert call_args[0][1] == app

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_creates_email_queue_record(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send,
        mock_payment, mock_history,
    ):
        """Approving an application dispatches via CommunicationService."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once()
        call_args = mock_comm_send.call_args
        assert call_args[0][0] == "application_approved"
        assert call_args[0][1] == app
        assert call_args[0][2]["admin_feedback"] == ""

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_calls_send_email_task_delay(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send,
        mock_payment, mock_history,
    ):
        """Approving an application calls CommunicationService.send (which dispatches email)."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once()


# ---------------------------------------------------------------------------
# Rejection creates Notification + queues email
# ---------------------------------------------------------------------------


class TestRejectionCreatesNotificationAndEmail:
    """POST /api/v1/applications/{id}/review/ with new_status=rejected"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationReviewView.as_view()
        self.admin = _make_user()
        self._tx_patcher = patch("apps.applications.admin_views.transaction")
        mock_tx = self._tx_patcher.start()
        mock_tx.atomic.return_value.__enter__ = MagicMock()
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

    def teardown_method(self):
        self._tx_patcher.stop()

    @patch(_HISTORY)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_creates_notification(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send, mock_history,
    ):
        """Rejecting an application calls CommunicationService.send with application_rejected."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once()
        call_args = mock_comm_send.call_args
        assert call_args[0][0] == "application_rejected"
        assert call_args[0][1] == app

    @patch(_HISTORY)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_creates_email_queue_record(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send, mock_history,
    ):
        """Rejecting an application dispatches via CommunicationService."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected", "notes": "Incomplete documents"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once_with(
            "application_rejected", app, {"admin_feedback": "Incomplete documents"}
        )

    @patch(_HISTORY)
    @patch(_COMM_SEND)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_calls_send_email_task_delay(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_comm_send, mock_history,
    ):
        """Rejecting an application calls CommunicationService.send (which dispatches email)."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_app_qs.select_for_update.return_value.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_comm_send.assert_called_once()

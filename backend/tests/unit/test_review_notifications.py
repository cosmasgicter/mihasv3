"""Unit tests for review notification + email dispatch.

When an admin approves or rejects an application, the system should:
1. Create a Notification record for the student
2. Create an EmailQueue record with status='pending'
3. Call send_email_task.delay() with the email record ID

Implements task 3.3 (go-live-polish).
Requirements: 2.3
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
_NOTIFICATION_CREATE = "apps.common.models.Notification.objects.create"
_EMAIL_CREATE = "apps.common.models.EmailQueue.objects.create"
_SEND_EMAIL = "apps.common.tasks.send_email_task.delay"
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

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_creates_notification(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_payment, mock_history,
    ):
        """Approving an application creates a Notification for the student."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_notif_create.assert_called_once()
        call_kwargs = mock_notif_create.call_args[1]
        assert call_kwargs["user_id"] == app.user_id
        assert "approved" in call_kwargs["title"].lower() or "🎉" in call_kwargs["title"]
        assert call_kwargs["type"] == "success"
        assert call_kwargs["priority"] == "high"

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_creates_email_queue_record(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_payment, mock_history,
    ):
        """Approving an application creates an EmailQueue record with status='pending'."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_email_create.assert_called_once()
        call_kwargs = mock_email_create.call_args[1]
        assert call_kwargs["recipient_email"] == "jane@example.com"
        assert call_kwargs["status"] == "pending"
        assert "approved" in call_kwargs["subject"].lower()

    @patch(_HISTORY)
    @patch(_PAYMENT)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_approval_calls_send_email_task_delay(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_payment, mock_history,
    ):
        """Approving an application calls send_email_task.delay() with the email record ID."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_payment.filter.return_value.exists.return_value = True
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "approved"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_send_email.assert_called_once_with(str(email_record.id))


# ---------------------------------------------------------------------------
# Rejection creates Notification + queues email
# ---------------------------------------------------------------------------


class TestRejectionCreatesNotificationAndEmail:
    """POST /api/v1/applications/{id}/review/ with new_status=rejected"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationReviewView.as_view()
        self.admin = _make_user()

    @patch(_HISTORY)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_creates_notification(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_history,
    ):
        """Rejecting an application creates a Notification for the student."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_notif_create.assert_called_once()
        call_kwargs = mock_notif_create.call_args[1]
        assert call_kwargs["user_id"] == app.user_id
        assert call_kwargs["type"] == "info"
        assert call_kwargs["priority"] == "high"

    @patch(_HISTORY)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_creates_email_queue_record(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_history,
    ):
        """Rejecting an application creates an EmailQueue record."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_email_create.assert_called_once()
        call_kwargs = mock_email_create.call_args[1]
        assert call_kwargs["recipient_email"] == "jane@example.com"
        assert call_kwargs["status"] == "pending"
        assert "update" in call_kwargs["subject"].lower()

    @patch(_HISTORY)
    @patch(_SEND_EMAIL)
    @patch(_EMAIL_CREATE)
    @patch(_NOTIFICATION_CREATE)
    @patch(_INTAKE_ENFORCER)
    @patch(_TRANSITION)
    @patch(_APP)
    def test_rejection_calls_send_email_task_delay(
        self, mock_app_qs, mock_transition,
        mock_enforcer, mock_notif_create, mock_email_create,
        mock_send_email, mock_history,
    ):
        """Rejecting an application calls send_email_task.delay() with the email record ID."""
        app = _make_application()
        mock_app_qs.get.return_value = app
        mock_transition.return_value = "submitted"
        mock_history.filter.return_value.order_by.return_value.first.return_value = None

        email_record = MagicMock()
        email_record.id = uuid.uuid4()
        mock_email_create.return_value = email_record

        request = _auth_request(
            self.factory,
            f"/api/v1/applications/{app.id}/review/",
            self.admin,
            {"new_status": "rejected"},
        )
        response = self.view(request, application_id=app.id)

        assert response.status_code == 200
        mock_send_email.assert_called_once_with(str(email_record.id))

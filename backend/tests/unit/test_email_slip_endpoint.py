import uuid
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import EmailSlipView


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser(
        {
            "user_id": str(uid),
            "email": "student@example.com",
            "role": role,
            "first_name": "Test",
            "last_name": "User",
        }
    )


class TestEmailSlipEndpoint:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = EmailSlipView.as_view()

    @patch("apps.common.outbox.queue_email")
    @patch("apps.applications.student_views.Application.objects.get")
    def test_email_slip_uses_public_tracking_code_when_tracking_code_attr_missing(
        self,
        mock_get_application,
        mock_queue_email,
    ):
        owner_id = uuid.uuid4()
        application_id = uuid.uuid4()
        queued_id = uuid.uuid4()

        mock_get_application.return_value = SimpleNamespace(
            id=application_id,
            user_id=str(owner_id),
            application_number="APP-000123",
            full_name="Test Applicant",
            program="Computer Science",
            public_tracking_code="TRK-000123",
            status="submitted",
            submitted_at=None,
            created_at=None,
        )
        mock_queue_email.return_value = SimpleNamespace(id=queued_id)

        request = self.factory.post(
            f"/api/v1/applications/{application_id}/email-slip/",
            data={"email": "alexisstar8@gmail.com"},
            format="json",
        )
        force_authenticate(request, user=_make_user(user_id=owner_id))

        response = self.view(request, application_id=application_id)

        assert response.status_code == 200
        assert response.data == {"success": True, "data": {"queued_id": str(queued_id)}}
        mock_queue_email.assert_called_once()
        assert "TRK-000123" in mock_queue_email.call_args.kwargs["body"]

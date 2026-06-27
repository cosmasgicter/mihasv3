import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.student_document_views import EmailSlipView
from tests.tenant_fixtures import build_tenant_world, build_two_tenant_worlds


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


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=_make_user(user_id=profile.id, role=profile.role)
    )
    return client


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

    @pytest.mark.django_db
    @patch("apps.common.outbox.queue_email")
    def test_out_of_scope_staff_is_masked_and_no_email_is_queued(self, mock_queue_email):
        world_a, world_b = build_two_tenant_worlds(
            staff_role="admin",
            application_status="submitted",
        )

        response = _client_for(world_a.staff).post(
            f"/api/v1/applications/{world_b.application.id}/email-slip/",
            {"email": "recipient@example.com"},
            format="json",
        )

        assert response.status_code == 404
        assert response.json() == {
            "success": False,
            "error": "Application not found",
            "code": "NOT_FOUND",
        }
        mock_queue_email.assert_not_called()

    @pytest.mark.django_db
    @patch("apps.common.outbox.queue_email")
    def test_in_scope_staff_can_queue_email_slip(self, mock_queue_email):
        world = build_tenant_world(application_status="submitted")
        queued_id = uuid.uuid4()
        mock_queue_email.return_value = SimpleNamespace(id=queued_id)

        response = _client_for(world.staff).post(
            f"/api/v1/applications/{world.application.id}/email-slip/",
            {"email": "recipient@example.com"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json() == {"success": True, "data": {"queued_id": str(queued_id)}}
        mock_queue_email.assert_called_once()

"""Property tests for interview status validation."""

import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from hypothesis import given, settings, strategies as st
from rest_framework.test import APIRequestFactory

from apps.applications.interview_views import (
    ALLOWED_INTERVIEW_STATUSES,
    ApplicationInterviewView,
)


@given(status_value=st.text(min_size=1, max_size=40))
@settings(max_examples=20, deadline=None)
def test_generated_invalid_interview_statuses_are_rejected(status_value):
    """Only the explicit interview state-machine statuses are accepted."""
    status_value = status_value.strip()
    if not status_value or status_value in ALLOWED_INTERVIEW_STATUSES:
        return

    request = APIRequestFactory().patch(
        "/api/v1/applications/00000000-0000-0000-0000-000000000000/interviews/",
        {"status": status_value},
        format="json",
    )
    request.user = MagicMock(
        is_authenticated=True,
        id="admin-1",
        pk="admin-1",
        role="admin",
    )
    request.data = {"status": status_value}

    interview = MagicMock()
    queryset = MagicMock()
    queryset.filter.return_value.order_by.return_value.first.return_value = interview

    serializer = MagicMock()
    serializer.is_valid.return_value = True
    serializer.validated_data = {"status": status_value}

    application = MagicMock()

    with patch(
        "apps.applications.interview_views.Application.objects.get",
        return_value=application,
    ), patch(
        "apps.applications.interview_views._staff_can_access_application",
        return_value=True,
    ), patch(
        "apps.applications.interview_views.ApplicationInterview.objects.select_related",
        return_value=queryset,
    ), patch(
        "apps.applications.interview_views.ApplicationInterviewWriteSerializer",
        return_value=serializer,
    ):
        response = ApplicationInterviewView()._update_latest_interview(
            request,
            "00000000-0000-0000-0000-000000000000",
        )

    assert response.status_code == 400
    assert response.data["code"] == "INVALID_STATUS"
    interview.save.assert_not_called()

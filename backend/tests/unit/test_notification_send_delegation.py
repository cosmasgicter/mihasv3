"""Notification send endpoint delegation tests."""

import os
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.common.notification_views import NotificationListView


class TestNotificationListPost(SimpleTestCase):
    def test_post_uses_shared_create_notification_not_view_instantiation(self):
        user_id = uuid.uuid4()
        request = APIRequestFactory().post(
            "/api/v1/notifications/",
            {
                "user_id": str(user_id),
                "title": "Title",
                "message": "Message",
                "type": "info",
            },
            format="json",
        )
        admin_user = MagicMock(is_authenticated=True, role="admin")

        notification = SimpleNamespace(id=uuid.uuid4())
        profile_filter = MagicMock()
        profile_filter.exists.return_value = True

        with patch(
            "apps.accounts.models.Profile.objects.filter",
            return_value=profile_filter,
        ), patch(
            "apps.common.notification_views.create_notification",
            return_value=notification,
        ) as create_notification, patch(
            "apps.common.notification_views.NotificationSendView.post"
        ) as send_view_post:
            force_authenticate(request, user=admin_user)
            response = NotificationListView.as_view()(request)

        self.assertEqual(response.status_code, 201)
        create_notification.assert_called_once()
        send_view_post.assert_not_called()

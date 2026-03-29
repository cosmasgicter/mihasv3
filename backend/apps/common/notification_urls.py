"""Notification URL patterns.

Implements tasks 20.1, 20.3.
Mounted at /api/v1/notifications/ in config/urls.py.
"""

from django.urls import path

from apps.common.notification_views import (
    NotificationPreferenceView,
    NotificationSendView,
)

urlpatterns = [
    path("preferences/", NotificationPreferenceView.as_view(), name="notification-preferences"),
    path("", NotificationSendView.as_view(), name="notification-send"),
]

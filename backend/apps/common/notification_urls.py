"""Notification URL patterns.

Implements tasks 20.1, 20.3, 11.1 (admissions-frontend-overhaul).
Mounted at /api/v1/notifications/ in config/urls.py.

Routes:
  GET    /api/v1/notifications/              → list user notifications
  POST   /api/v1/notifications/              → admin send notification
  GET    /api/v1/notifications/preferences/  → get notification preferences
  PUT    /api/v1/notifications/preferences/  → update notification preferences
  PUT    /api/v1/notifications/read-all/     → mark all notifications as read
  PUT    /api/v1/notifications/<id>/read/    → mark single notification as read
  DELETE /api/v1/notifications/<id>/         → delete a notification
"""

from django.urls import path

from apps.common.notification_views import (
    NotificationDeleteView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationPreferenceView,
)

urlpatterns = [
    path("preferences/", NotificationPreferenceView.as_view(), name="notification-preferences"),
    path("read-all/", NotificationMarkAllReadView.as_view(), name="notification-mark-all-read"),
    path("<uuid:pk>/read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("<uuid:pk>/", NotificationDeleteView.as_view(), name="notification-delete"),
    path("", NotificationListView.as_view(), name="notification-list"),
]

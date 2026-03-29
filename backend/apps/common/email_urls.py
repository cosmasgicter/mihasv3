"""Email URL patterns.

Implements task 20.3.
Mounted at /api/v1/email/ in config/urls.py.
"""

from django.urls import path

from apps.common.notification_views import EmailSendView

urlpatterns = [
    path("send/", EmailSendView.as_view(), name="email-send"),
]

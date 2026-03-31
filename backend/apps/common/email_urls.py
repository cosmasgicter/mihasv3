"""Email URL patterns.

Implements task 20.3.
Mounted at /api/v1/email/ in config/urls.py.
"""

from django.urls import path

from apps.common.notification_views import EmailSendView
from apps.integrations.email_views import (
    EmailDeliveryWebhookView,
    EmailMessageListView,
    EmailThreadListView,
    ZohoConnectView,
)

urlpatterns = [
    path("accounts/zoho/connect/", ZohoConnectView.as_view(), name="email-zoho-connect"),
    path("messages/", EmailMessageListView.as_view(), name="email-message-list"),
    path("threads/", EmailThreadListView.as_view(), name="email-thread-list"),
    path("send/", EmailSendView.as_view(), name="email-send"),
    path("webhooks/delivery/", EmailDeliveryWebhookView.as_view(), name="email-delivery-webhook"),
]

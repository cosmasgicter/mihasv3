"""Email URL patterns.

Implements task 20.3.
Mounted at /api/v1/email/ in config/urls.py.
"""

from django.urls import path
from django.utils.functional import lazy as _lazy  # noqa: F401

from apps.common.notification_views import EmailSendView


def _get_urlpatterns():
    """Build URL patterns with lazy imports to avoid common ↔ integrations cycle."""
    from apps.integrations.email_views import (
        EmailDeliveryWebhookView,
        EmailMessageListView,
        EmailThreadListView,
        ZohoConnectView,
    )

    return [
        path("accounts/zoho/connect/", ZohoConnectView.as_view(), name="email-zoho-connect"),
        path("messages/", EmailMessageListView.as_view(), name="email-message-list"),
        path("threads/", EmailThreadListView.as_view(), name="email-thread-list"),
        path("send/", EmailSendView.as_view(), name="email-send"),
        path("webhooks/delivery/", EmailDeliveryWebhookView.as_view(), name="email-delivery-webhook"),
    ]


urlpatterns = _get_urlpatterns()

"""Email URL patterns.

Implements task 20.3.
Mounted at /api/v1/email/ in config/urls.py.
"""

from django.conf import settings
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

    # ``send/`` is the admissions admin email action and is always mounted.
    patterns = [
        path("send/", EmailSendView.as_view(), name="email-send"),
    ]
    # The seed and scaffold views belong to jobs-ops: they answer 404 unless the
    # jobs-ops flag is on (platform-simplification task 12.1, requirement 3.3). The
    # flag is read when this module loads, as ``config/urls.py`` does.
    #
    # ``webhooks/delivery/`` is one of them (decision D1.b, option (i), decided
    # 2026-11-21): its handler returns a jobs-ops seed payload and writes nothing,
    # no provider is registered to call it, and admissions reads email delivery
    # state from ``EmailQueue.status`` (``apps/common/communication_history.py``),
    # not from a webhook. ``scripts/route-consumers.json`` records the answer.
    if settings.ENABLE_JOBS_OPS_ROUTES:
        patterns = [
            path("accounts/zoho/connect/", ZohoConnectView.as_view(), name="email-zoho-connect"),
            path("messages/", EmailMessageListView.as_view(), name="email-message-list"),
            path("threads/", EmailThreadListView.as_view(), name="email-thread-list"),
            path("webhooks/delivery/", EmailDeliveryWebhookView.as_view(), name="email-delivery-webhook"),
            *patterns,
        ]
    return patterns
urlpatterns = _get_urlpatterns()

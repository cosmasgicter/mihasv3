"""Tests for RFC 9745/8594 deprecation headers on notification aliases.

`/api/v1/notifications/mark-all-read/` and `/api/v1/notifications/mark-read/`
are deprecated aliases for the canonical `/api/v1/notifications/read-all/`.
Responses from the aliases must carry `Deprecation: true` and `Sunset` headers;
responses from the canonical path must NOT.
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.notification_views import (
    NotificationMarkAllReadAliasView,
    NotificationMarkAllReadView,
)


def _make_user():
    return JWTUser(
        {
            "user_id": str(uuid.uuid4()),
            "email": "alice@example.com",
            "role": "student",
            "first_name": "Alice",
            "last_name": "Tester",
        }
    )


@pytest.fixture
def mock_mark_all_read():
    """Patch the DB-touching update() on Notification queryset so we don't need a real DB."""
    with patch("apps.common.notification_views.Notification") as mock_cls:
        qs = mock_cls.objects.filter.return_value
        qs.update.return_value = 3
        yield mock_cls


def test_canonical_read_all_has_no_deprecation_headers(mock_mark_all_read):
    """The canonical /read-all/ endpoint MUST NOT emit Deprecation/Sunset."""
    factory = APIRequestFactory()
    request = factory.put("/api/v1/notifications/read-all/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadView.as_view()
    response = view(request)
    assert response.status_code == 200
    assert "Deprecation" not in response.headers
    assert "Sunset" not in response.headers


def test_mark_all_read_alias_has_deprecation_headers(mock_mark_all_read):
    factory = APIRequestFactory()
    request = factory.put("/api/v1/notifications/mark-all-read/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadAliasView.as_view()
    response = view(request)
    assert response.status_code == 200
    assert response.headers.get("Deprecation") == "true"
    assert "Sunset" in response.headers
    # Sunset value looks like an HTTP-date
    assert "GMT" in response.headers["Sunset"]
    # Link header points at successor
    assert 'rel="successor-version"' in response.headers.get("Link", "")
    assert "/api/v1/notifications/read-all/" in response.headers.get("Link", "")


def test_mark_read_alias_has_deprecation_headers(mock_mark_all_read):
    """Also applies to the second alias path."""
    factory = APIRequestFactory()
    request = factory.put("/api/v1/notifications/mark-read/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadAliasView.as_view()
    response = view(request)
    assert response.status_code == 200
    assert response.headers.get("Deprecation") == "true"
    assert "Sunset" in response.headers


def test_alias_post_method_also_carries_headers(mock_mark_all_read):
    factory = APIRequestFactory()
    request = factory.post("/api/v1/notifications/mark-all-read/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadAliasView.as_view()
    response = view(request)
    assert response.status_code == 200
    assert response.headers.get("Deprecation") == "true"


def test_alias_preserves_response_body(mock_mark_all_read):
    """Deprecation headers don't change the response envelope shape."""
    factory = APIRequestFactory()
    request = factory.put("/api/v1/notifications/mark-all-read/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadAliasView.as_view()
    response = view(request)
    body = response.data
    assert body["success"] is True
    assert "data" in body
    assert "message" in body["data"]


def test_alias_inherits_from_canonical():
    """The alias view reuses canonical logic by subclassing."""
    assert issubclass(NotificationMarkAllReadAliasView, NotificationMarkAllReadView)


def test_sunset_setting_override(mock_mark_all_read, settings):
    """NOTIFICATION_ALIAS_SUNSET setting can override the default sunset date."""
    settings.NOTIFICATION_ALIAS_SUNSET = "Sat, 01 Jan 2027 00:00:00 GMT"
    factory = APIRequestFactory()
    request = factory.put("/api/v1/notifications/mark-all-read/")
    force_authenticate(request, user=_make_user())
    view = NotificationMarkAllReadAliasView.as_view()
    response = view(request)
    assert response.headers["Sunset"] == "Sat, 01 Jan 2027 00:00:00 GMT"


def test_urls_wire_aliases_to_alias_view():
    """The URL routing layer must direct /mark-all-read/ and /mark-read/ to
    the alias subclass, NOT to the canonical view."""
    from apps.common import notification_urls

    # Find the URL patterns by name
    by_name = {p.name: p for p in notification_urls.urlpatterns}
    canonical = by_name["notification-mark-all-read"]
    alias1 = by_name["notification-mark-all-read-alias"]
    alias2 = by_name["notification-mark-read-batch"]

    # Extract the view class from each pattern
    def _view_class(pattern):
        cb = pattern.callback
        return getattr(cb, "view_class", None) or getattr(cb, "cls", None)

    assert _view_class(canonical) is NotificationMarkAllReadView
    assert _view_class(alias1) is NotificationMarkAllReadAliasView
    assert _view_class(alias2) is NotificationMarkAllReadAliasView

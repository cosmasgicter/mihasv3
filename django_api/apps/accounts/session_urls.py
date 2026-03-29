"""Session URL routing.

Implements task 12.1.
Requirements: 9.1, 9.2, 9.3
"""

from django.urls import path

from apps.accounts.session_views import (
    SessionListView,
    SessionRevokeAllView,
    SessionRevokeView,
)

app_name = "sessions"

urlpatterns = [
    path("", SessionListView.as_view(), name="session-list"),
    path("<uuid:session_id>/revoke/", SessionRevokeView.as_view(), name="session-revoke"),
    path("revoke-all/", SessionRevokeAllView.as_view(), name="session-revoke-all"),
]

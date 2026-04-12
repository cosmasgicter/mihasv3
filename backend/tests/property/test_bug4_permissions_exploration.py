"""Bug 4 exploration test: Scaffold views using AllowAny instead of IsAuthenticated.

**Validates: Requirements 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12**

This test MUST FAIL on unfixed code — failure confirms the bug exists.
The bug condition (from design isBugCondition_Bug4):
  view.permission_classes == [AllowAny] AND view.authentication_classes == []

Expected behavior after fix:
  view.permission_classes contains IsAuthenticated
  view.authentication_classes is NOT []
"""

import pytest
from rest_framework.permissions import IsAuthenticated

from apps.analytics.views import DailyDigestReportView, OutreachAnalyticsView, SourceAnalyticsView
from apps.documents.job_views import DocumentVersionListView, ResumeListView
from apps.integrations.email_views import EmailMessageListView, EmailThreadListView


AFFECTED_VIEWS = [
    ("SourceAnalyticsView", SourceAnalyticsView),
    ("OutreachAnalyticsView", OutreachAnalyticsView),
    ("DailyDigestReportView", DailyDigestReportView),
    ("EmailMessageListView", EmailMessageListView),
    ("EmailThreadListView", EmailThreadListView),
    ("ResumeListView", ResumeListView),
    ("DocumentVersionListView", DocumentVersionListView),
]


@pytest.mark.parametrize("view_name,view_class", AFFECTED_VIEWS)
def test_view_requires_is_authenticated(view_name, view_class):
    """Each affected view must have IsAuthenticated in permission_classes."""
    permission_classes = view_class.permission_classes
    has_is_authenticated = any(
        perm is IsAuthenticated or (isinstance(perm, type) and issubclass(perm, IsAuthenticated))
        for perm in permission_classes
    )
    assert has_is_authenticated, (
        f"{view_name}.permission_classes == {permission_classes} — "
        f"expected to contain IsAuthenticated, but it does not"
    )


@pytest.mark.parametrize("view_name,view_class", AFFECTED_VIEWS)
def test_view_does_not_disable_authentication(view_name, view_class):
    """Each affected view must NOT have authentication_classes set to [] (empty list disables auth)."""
    auth_classes = getattr(view_class, "authentication_classes", None)
    assert auth_classes is None or auth_classes != [], (
        f"{view_name}.authentication_classes == [] — "
        f"empty list disables all authentication backends"
    )

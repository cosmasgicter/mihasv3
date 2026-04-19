"""
Bug 4 (P1) — Preservation Tests for Already-Authenticated Views

These tests verify baseline behavior that MUST be preserved after the fix:
1. Views that already have IsAuthenticated must keep it
2. EmailDeliveryWebhookView must remain unauthenticated (webhook endpoint)

These tests MUST PASS on unfixed code — this confirms baseline behavior to preserve.

**Validates: Requirements 3.4, 3.5**
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.permissions import IsAuthenticated

from apps.analytics.views import FunnelAnalyticsView
from apps.documents.job_views import (
    CoverLetterGenerateView,
    QuestionBankAnswerView,
    ResumeVariantCreateView,
)
from apps.integrations.email_views import EmailDeliveryWebhookView, ZohoConnectView


# Views that already require IsAuthenticated on unfixed code
ALREADY_AUTHENTICATED_VIEWS = [
    ("FunnelAnalyticsView", FunnelAnalyticsView),
    ("ResumeVariantCreateView", ResumeVariantCreateView),
    ("CoverLetterGenerateView", CoverLetterGenerateView),
    ("QuestionBankAnswerView", QuestionBankAnswerView),
    ("ZohoConnectView", ZohoConnectView),
]

# Strategy to pick any already-authenticated view
authenticated_view_strategy = st.sampled_from(ALREADY_AUTHENTICATED_VIEWS)


class TestBug4AlreadyAuthenticatedViewsPreservation:
    """
    Preservation: views that already require IsAuthenticated must continue
    to have IsAuthenticated in their permission_classes after the fix.

    **Validates: Requirements 3.4, 3.5**
    """

    @given(view_pair=authenticated_view_strategy)
    @settings(max_examples=5, deadline=None)
    def test_already_authenticated_view_has_is_authenticated(self, view_pair):
        """
        For any view that already requires IsAuthenticated, permission_classes
        must contain IsAuthenticated.

        **Validates: Requirements 3.4, 3.5**
        """
        view_name, view_class = view_pair
        permission_classes = view_class.permission_classes
        has_is_authenticated = any(
            perm is IsAuthenticated
            or (isinstance(perm, type) and issubclass(perm, IsAuthenticated))
            for perm in permission_classes
        )
        assert has_is_authenticated, (
            f"{view_name}.permission_classes == {permission_classes} — "
            f"expected to contain IsAuthenticated (preservation requirement)"
        )

    @given(view_pair=authenticated_view_strategy)
    @settings(max_examples=5, deadline=None)
    def test_already_authenticated_view_does_not_disable_auth_backends(self, view_pair):
        """
        For any view that already requires IsAuthenticated, authentication_classes
        must NOT be set to [] (empty list disables all auth backends).

        **Validates: Requirements 3.4, 3.5**
        """
        view_name, view_class = view_pair
        auth_classes = getattr(view_class, "authentication_classes", None)
        assert auth_classes is None or auth_classes != [], (
            f"{view_name}.authentication_classes == [] — "
            f"empty list disables all authentication backends (preservation violation)"
        )


class TestBug4WebhookPreservation:
    """
    Preservation: EmailDeliveryWebhookView must remain unauthenticated.
    It is a webhook endpoint and must NOT have IsAuthenticated added.

    **Validates: Requirements 3.5**
    """

    def test_webhook_view_does_not_require_is_authenticated(self):
        """
        EmailDeliveryWebhookView.permission_classes must NOT contain
        IsAuthenticated — it is a webhook endpoint that must stay open.

        **Validates: Requirements 3.5**
        """
        permission_classes = EmailDeliveryWebhookView.permission_classes
        has_is_authenticated = any(
            perm is IsAuthenticated
            or (isinstance(perm, type) and issubclass(perm, IsAuthenticated))
            for perm in permission_classes
        )
        assert not has_is_authenticated, (
            f"EmailDeliveryWebhookView.permission_classes == {permission_classes} — "
            f"webhook endpoint must NOT require IsAuthenticated"
        )

    def test_webhook_view_has_empty_or_no_permission_classes(self):
        """
        EmailDeliveryWebhookView.permission_classes should be [] (empty),
        confirming it is intentionally unauthenticated.

        **Validates: Requirements 3.5**
        """
        permission_classes = EmailDeliveryWebhookView.permission_classes
        assert permission_classes == [], (
            f"EmailDeliveryWebhookView.permission_classes == {permission_classes} — "
            f"expected [] for webhook endpoint"
        )

"""Property tests for the applications views module split.

Feature: production-readiness-hardening, Property 12: View Re-exports Preserve All Class Names

**Validates: Requirements 7.2, 7.4**
"""

import importlib
import inspect

from django.test import SimpleTestCase
from hypothesis import given, settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Canonical list of all view classes that must be importable from
# apps.applications.views after the split.  This list is derived from
# the URL configuration in apps/applications/urls.py.
# ---------------------------------------------------------------------------

EXPECTED_VIEW_CLASSES = [
    "AcceptanceLetterView",
    "ApplicationAmendmentReviewView",
    "ApplicationAmendmentView",
    "ApplicationAssignView",
    "ApplicationAutoAssignView",
    "ApplicationBulkStatusView",
    "ApplicationConditionsView",
    "ApplicationConditionVerifyView",
    "ApplicationConfirmEnrollmentView",
    "ApplicationDetailView",
    "ApplicationDetailsView",
    "ApplicationDocumentsView",
    "ApplicationDraftView",
    "ApplicationExportView",
    "ApplicationFeeWaiverView",
    "ApplicationGradesView",
    "ApplicationInterviewListView",
    "ApplicationInterviewView",
    "ApplicationListCreateView",
    "ApplicationReviewView",
    "ApplicationSubmitView",
    "ApplicationSummaryView",
    "ApplicationTrackView",
    "ApplicationVerifyDocumentView",
    "ApplicationWaitlistPositionView",
    "ApplicationWithdrawView",
    "EmailSlipView",
    "FinanceReceiptView",
]

# Shared helpers that must also be importable from views.py
EXPECTED_HELPERS = [
    "_with_payment_summary",
    "_generate_application_number",
    "_generate_tracking_code",
    "_enqueue_document_task",
    "build_audit_network_fields",
]


class TestViewReexportsPreserveAllClassNames(SimpleTestCase):
    """Property 12: View Re-exports Preserve All Class Names

    *For any* view class that existed in the original applications/views.py
    module, that class SHALL be importable from apps.applications.views
    after the split, preserving the same class name and interface.

    **Validates: Requirements 7.2, 7.4**
    """

    @given(idx=st.integers(min_value=0, max_value=len(EXPECTED_VIEW_CLASSES) - 1))
    @settings(max_examples=20)
    def test_view_class_importable_from_views_module(self, idx):
        """Every expected view class is importable from apps.applications.views."""
        class_name = EXPECTED_VIEW_CLASSES[idx]
        views_module = importlib.import_module("apps.applications.views")
        attr = getattr(views_module, class_name, None)
        self.assertIsNotNone(
            attr,
            f"{class_name} is not importable from apps.applications.views",
        )
        self.assertTrue(
            inspect.isclass(attr),
            f"{class_name} is not a class in apps.applications.views",
        )

    def test_all_expected_view_classes_present(self):
        """Deterministic check: every expected view class exists in views module."""
        views_module = importlib.import_module("apps.applications.views")
        missing = []
        for name in EXPECTED_VIEW_CLASSES:
            if not hasattr(views_module, name):
                missing.append(name)
        self.assertEqual(
            missing,
            [],
            f"Missing view classes in apps.applications.views: {missing}",
        )

    def test_all_expected_helpers_present(self):
        """Deterministic check: shared helpers are importable from views module."""
        views_module = importlib.import_module("apps.applications.views")
        missing = []
        for name in EXPECTED_HELPERS:
            if not hasattr(views_module, name):
                missing.append(name)
        self.assertEqual(
            missing,
            [],
            f"Missing helpers in apps.applications.views: {missing}",
        )

    def test_views_module_under_100_lines(self):
        """Requirement 7.5: views.py must be under 100 lines (re-exports only)."""
        import os
        views_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "apps", "applications", "views.py",
        )
        with open(views_path) as f:
            line_count = sum(1 for _ in f)
        self.assertLess(
            line_count,
            100,
            f"views.py has {line_count} lines, expected < 100",
        )

    @given(idx=st.integers(min_value=0, max_value=len(EXPECTED_VIEW_CLASSES) - 1))
    @settings(max_examples=20)
    def test_view_classes_are_api_views(self, idx):
        """Every view class should be a subclass of APIView."""
        from rest_framework.views import APIView

        class_name = EXPECTED_VIEW_CLASSES[idx]
        views_module = importlib.import_module("apps.applications.views")
        cls = getattr(views_module, class_name, None)
        if cls is not None:
            self.assertTrue(
                issubclass(cls, APIView),
                f"{class_name} is not a subclass of APIView",
            )

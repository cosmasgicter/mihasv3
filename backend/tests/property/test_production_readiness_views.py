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
# Canonical list of all view classes that must be importable from the split
# view modules (the ``apps.applications.views`` shim was removed by
# platform-simplification task 14.3).  This list is derived from the URL
# configuration in apps/applications/urls.py.
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
    # ``EmailSlipView`` removed by admissions-v2 task 10.6 (R13.5, API-04) with the
    # deprecated ``/email-slip/`` route. The canonical official-document email is
    # ``OfficialDocumentEmailView``.
    "FinanceReceiptView",
]

# The split modules URL routing imports from; a view class must be found in one.
SPLIT_VIEW_MODULES = [
    "apps.applications.student_views",
    "apps.applications.admin_views",
    "apps.applications.interview_views",
    "apps.applications.document_views",
    "apps.applications.public_views",
]
# Shared helpers and where they live now.
EXPECTED_HELPERS = {
    "_with_payment_summary": "apps.applications._view_helpers",
    "_generate_application_number": "apps.applications._view_helpers",
    "_generate_tracking_code": "apps.applications._view_helpers",
    "_enqueue_document_task": "apps.applications._view_helpers",
    "build_audit_network_fields": "apps.common.audit_network",
}
def _find_view_class(class_name):
    for module_name in SPLIT_VIEW_MODULES:
        attr = getattr(importlib.import_module(module_name), class_name, None)
        if attr is not None:
            return attr
    return None


class TestViewClassesStayImportableFromSplitModules(SimpleTestCase):
    """Property 12: every view class stays importable by name from the split modules

    *For any* view class in the URL configuration, that class SHALL be importable
    from one of the split view modules with the same class name.
    **Validates: Requirements 7.2, 7.4**
    """

    @given(idx=st.integers(min_value=0, max_value=len(EXPECTED_VIEW_CLASSES) - 1))
    @settings(max_examples=20)
    def test_view_class_importable_from_split_modules(self, idx):
        class_name = EXPECTED_VIEW_CLASSES[idx]
        attr = _find_view_class(class_name)
        self.assertIsNotNone(attr, f"{class_name} is not importable from the split view modules")
        self.assertTrue(inspect.isclass(attr), f"{class_name} is not a class")

    def test_all_expected_view_classes_present(self):
        missing = [n for n in EXPECTED_VIEW_CLASSES if _find_view_class(n) is None]
        self.assertEqual(missing, [], f"Missing view classes in the split modules: {missing}")

    def test_all_expected_helpers_present(self):
        missing = [
            name
            for name, module_name in EXPECTED_HELPERS.items()
            if not hasattr(importlib.import_module(module_name), name)
        ]
        self.assertEqual(missing, [], f"Missing helpers: {missing}")

    def test_the_applications_views_shim_is_gone(self):
        with self.assertRaises(ImportError):
            importlib.import_module("apps.applications.views")

    @given(idx=st.integers(min_value=0, max_value=len(EXPECTED_VIEW_CLASSES) - 1))
    @settings(max_examples=20)
    def test_view_classes_are_api_views(self, idx):
        from rest_framework.views import APIView

        class_name = EXPECTED_VIEW_CLASSES[idx]
        cls = _find_view_class(class_name)
        if cls is not None:
            self.assertTrue(issubclass(cls, APIView), f"{class_name} is not a subclass of APIView")

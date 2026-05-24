"""Admin-facing application views — re-export shim.

Decomposed during Stream 9 backend module decomposition.
All view classes AND their commonly-patched module-level imports are re-exported
here so existing tests that use ``patch("apps.applications.admin_views.X")``
continue to work without modification.

Split files:
  - admin_review_views.py      — ApplicationListCreateView, ApplicationReviewView
  - admin_assignment_views.py  — ApplicationAssignView, ApplicationAutoAssignView, ApplicationFeeWaiverView
  - admin_export_views.py      — ApplicationExportView
  - admin_bulk_views.py        — ApplicationBulkStatusView
  - admin_amendment_views.py   — ApplicationAmendmentReviewView, ApplicationConditionVerifyView, ApplicationAdminSummaryView
"""

# View classes
from apps.applications.admin_review_views import (  # noqa: F401
    ApplicationListCreateView,
    ApplicationReviewView,
)
from apps.applications.admin_assignment_views import (  # noqa: F401
    ApplicationAssignView,
    ApplicationAutoAssignView,
    ApplicationFeeWaiverView,
)
from apps.applications.admin_export_views import (  # noqa: F401
    ApplicationExportView,
    ApplicationFilter,
    _redact_email,
    _redact_name,
    _redact_phone,
    _with_payment_summary,
)
from apps.accounts.permissions import is_super_admin  # noqa: F401

# Backward-compat alias for tests that patch "apps.applications.admin_views._is_super_admin"
_is_super_admin = is_super_admin
from apps.applications.admin_bulk_views import ApplicationBulkStatusView  # noqa: F401
from apps.applications.admin_amendment_views import (  # noqa: F401
    ApplicationAdminSummaryView,
    ApplicationAmendmentReviewView,
    ApplicationConditionVerifyView,
)

# Test patch backward-compat: existing tests use
# ``@patch("apps.applications.admin_views.X")`` for these symbols.
# Re-exporting them here preserves test compatibility.
from django.db import transaction  # noqa: F401
from apps.applications.models import Application  # noqa: F401
from apps.applications.serializers import ApplicationSerializer  # noqa: F401
from apps.applications.services import transition_application_status  # noqa: F401
from apps.applications.waitlist_manager import WaitlistManager  # noqa: F401
from apps.documents.models import Payment  # noqa: F401
from apps.common.communication_service import CommunicationService  # noqa: F401

__all__ = [
    "ApplicationAdminSummaryView",
    "ApplicationAmendmentReviewView",
    "ApplicationAssignView",
    "ApplicationAutoAssignView",
    "ApplicationBulkStatusView",
    "ApplicationConditionVerifyView",
    "ApplicationExportView",
    "ApplicationFeeWaiverView",
    "ApplicationListCreateView",
    "ApplicationReviewView",
    # Test-patch back-compat
    "Application",
    "ApplicationFilter",
    "ApplicationSerializer",
    "Payment",
    "WaitlistManager",
    "transaction",
    "transition_application_status",
    "_is_super_admin",
    "_redact_email",
    "_redact_name",
    "_redact_phone",
    "_with_payment_summary",
]

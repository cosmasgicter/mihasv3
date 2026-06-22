"""Student-facing application views - re-export shim.

Decomposed during Stream 9 backend module decomposition.
All view classes are re-exported here so that existing imports continue to work.

Split files:
  - student_draft_views.py       - ApplicationDetailView, ApplicationDetailsView, ApplicationDraftView
  - student_submission_views.py  - ApplicationSubmitView, ApplicationPreviewSummaryView, ApplicationSummaryView, ApplicationGradesView
  - student_amendment_views.py   - ApplicationAmendmentView
  - student_withdrawal_views.py  - ApplicationWithdrawView, ApplicationWaitlistPositionView, ApplicationConditionsView, ApplicationConfirmEnrollmentView
  - student_document_views.py    - ApplicationDocumentsView, EmailSlipView
"""

from apps.applications.student_draft_views import (  # noqa: F401
    ApplicationDetailView,
    ApplicationDetailsView,
    ApplicationDraftView,
)
from apps.applications.student_submission_views import (  # noqa: F401
    ApplicationGradesView,
    ApplicationPreviewSummaryView,
    ApplicationSubmitView,
    ApplicationSummaryView,
    SubmitRateThrottle,
)
from apps.applications.student_amendment_views import ApplicationAmendmentView  # noqa: F401
from apps.applications.student_withdrawal_views import (  # noqa: F401
    ApplicationConditionsView,
    ApplicationConfirmEnrollmentView,
    ApplicationWaitlistPositionView,
    ApplicationWithdrawView,
)
from apps.applications.student_document_views import (  # noqa: F401
    ApplicationDocumentsView,
    EmailSlipView,
)

# Test patch backward-compat: existing tests use
# ``@patch("apps.applications.student_views.X")`` for these symbols.
from django.db import transaction  # noqa: F401
from apps.applications.models import Application  # noqa: F401
from apps.applications.serializers import ApplicationSerializer  # noqa: F401
from apps.applications.services import (  # noqa: F401
    submit_application,
    transition_application_status,
    SYSTEM_ACTOR_ID,
)
from apps.applications._view_helpers import _with_payment_summary  # noqa: F401
from apps.documents.models import Payment, ApplicationDocument, ApplicationGrade  # noqa: F401
from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES  # noqa: F401

__all__ = [
    "ApplicationAmendmentView",
    "ApplicationConditionsView",
    "ApplicationConfirmEnrollmentView",
    "ApplicationDetailView",
    "ApplicationDetailsView",
    "ApplicationDocumentsView",
    "ApplicationDraftView",
    "ApplicationGradesView",
    "ApplicationPreviewSummaryView",
    "ApplicationSubmitView",
    "ApplicationSummaryView",
    "ApplicationWaitlistPositionView",
    "ApplicationWithdrawView",
    "EmailSlipView",
    "SubmitRateThrottle",
]

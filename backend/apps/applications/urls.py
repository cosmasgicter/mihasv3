"""Application URL routing.

Implements task 13.4.
Requirements: 10.1
"""

from django.urls import path

from apps.applications.history_views import TimelineHistoryView
from apps.applications.admin_amendment_views import (
    ApplicationAmendmentReviewView,
    ApplicationConditionVerifyView,
)
from apps.applications.admin_assignment_views import (
    ApplicationAssignView,
    ApplicationAutoAssignView,
    ApplicationFeeWaiverView,
    AssignmentCandidatesView,
)
from apps.applications.admin_bulk_views import ApplicationBulkStatusView
from apps.applications.admin_export_views import ApplicationExportView
from apps.applications.admin_review_views import (
    ApplicationListCreateView,
    ApplicationReviewView,
)
from apps.applications.document_views import (
    AcceptanceLetterView,
    ApplicationSlipView,
    ApplicationVerifyDocumentView,
    ConditionalOfferView,
    FinanceReceiptView,
    PaymentReceiptView,
)
from apps.applications.interview_views import (
    ApplicationInterviewListView,
    ApplicationInterviewView,
)
from apps.applications.official_document_views import (
    OfficialDocumentDetailView,
    OfficialDocumentEmailView,
    OfficialDocumentListView,
)
from apps.applications.condition_views import (
    ApplicationConditionDetailView,
    ApplicationConditionEvidenceView,
    ApplicationConditionReviewView,
)
from apps.applications.public_views import ApplicationTrackView
from apps.applications.student_amendment_views import (
    ApplicationAmendmentDetailView,
    ApplicationAmendmentView,
)
from apps.applications.student_document_views import (
    ApplicationDocumentsView,
    ApplicationRequiredDocumentsView,
)
from apps.applications.student_draft_views import (
    ApplicationDetailView,
    ApplicationDetailsView,
    ApplicationDraftChangeSelectionView,
    ApplicationDraftDetailView,
    ApplicationDraftListView,
    ApplicationDraftRenameView,
)
from apps.applications.student_submission_views import (
    ApplicationGradesView,
    ApplicationSubmitView,
    ApplicationSummaryView,
)
from apps.applications.student_tracking_views import ApplicationTrackingLinkView
from apps.applications.student_withdrawal_views import (
    ApplicationConditionsView,
    ApplicationConfirmEnrollmentView,
    ApplicationWaitlistPositionView,
    ApplicationWithdrawView,
)

app_name = "applications"

urlpatterns = [
    path("", ApplicationListCreateView.as_view(), name="application-list-create"),
    path("export/", ApplicationExportView.as_view(), name="application-export"),
    path("track/", ApplicationTrackView.as_view(), name="application-track"),
    path("bulk-status/", ApplicationBulkStatusView.as_view(), name="application-bulk-status"),
    path("drafts/", ApplicationDraftListView.as_view(), name="application-draft-list"),
    path("interviews/", ApplicationInterviewListView.as_view(), name="application-interview-list"),
    path("history/", TimelineHistoryView.as_view(), name="application-history"),
    path("<uuid:application_id>/", ApplicationDetailView.as_view(), name="application-detail"),
    path("drafts/<uuid:application_id>/", ApplicationDraftDetailView.as_view(), name="application-draft-detail"),
    path("drafts/<uuid:application_id>/rename/", ApplicationDraftRenameView.as_view(), name="application-draft-rename"),
    path(
        "drafts/<uuid:application_id>/change-selection/",
        ApplicationDraftChangeSelectionView.as_view(),
        name="application-draft-change-selection",
    ),
    path("<uuid:application_id>/details/", ApplicationDetailsView.as_view(), name="application-details"),
    path("<uuid:application_id>/documents/", ApplicationDocumentsView.as_view(), name="application-documents"),
    # admissions-v2 task 7.2 (R11.6, STU-13): the versioned required-document
    # contract the student wizard renders its upload controls from.
    path(
        "<uuid:application_id>/required-documents/",
        ApplicationRequiredDocumentsView.as_view(),
        name="application-required-documents",
    ),
    path("<uuid:application_id>/grades/", ApplicationGradesView.as_view(), name="application-grades"),
    path("<uuid:application_id>/summary/", ApplicationSummaryView.as_view(), name="application-summary"),
    path("<uuid:application_id>/submit/", ApplicationSubmitView.as_view(), name="application-submit"),
    path("<uuid:application_id>/review/", ApplicationReviewView.as_view(), name="application-review"),
    path("<uuid:application_id>/interviews/", ApplicationInterviewView.as_view(), name="application-interviews"),
    path("<uuid:application_id>/verify-document/", ApplicationVerifyDocumentView.as_view(), name="application-verify-document"),
    path("<uuid:application_id>/application-slip/", ApplicationSlipView.as_view(), name="application-slip"),
    path("<uuid:application_id>/acceptance-letter/", AcceptanceLetterView.as_view(), name="application-acceptance-letter"),
    path("<uuid:application_id>/conditional-offer/", ConditionalOfferView.as_view(), name="application-conditional-offer"),
    path("<uuid:application_id>/finance-receipt/", FinanceReceiptView.as_view(), name="application-finance-receipt"),
    path("<uuid:application_id>/payment-receipt/", PaymentReceiptView.as_view(), name="application-payment-receipt"),
    path(
        "<uuid:application_id>/official-documents/",
        OfficialDocumentListView.as_view(),
        name="application-official-document-list",
    ),
    # admissions-v2 task 10.4 (R13.5, STU-18): the canonical official-document
    # email, for every document type. Declared BEFORE the detail route so the
    # ``<str:document_type>`` converter cannot swallow the ``email/`` segment.
    path(
        "<uuid:application_id>/official-documents/<str:document_type>/email/",
        OfficialDocumentEmailView.as_view(),
        name="application-official-document-email",
    ),
    path(
        "<uuid:application_id>/official-documents/<str:document_type>/",
        OfficialDocumentDetailView.as_view(),
        name="application-official-document-detail",
    ),
    # admissions-v2 task 10.6 (R13.5, R13.13, finding API-04): the deprecated
    # ``POST <id>/email-slip/`` route is **removed**. Task 10.4 made it a thin
    # proxy over the canonical official-document email above and measured zero
    # production call sites; R13.5 asks for the legacy caller to be removed after
    # that measured window, and this task re-measured it
    # (``docs/v2-evidence/10.6/raw/usage-measurement.txt``) and closed it.
    # The successor is
    # ``POST <id>/official-documents/application_slip/email/``.
    path("<uuid:application_id>/withdraw/", ApplicationWithdrawView.as_view(), name="application-withdraw"),
    # admissions-v2 task 10.5 (R13.12, STU-22): the owner issues their own public
    # tracking link. The secret is stored hashed, so this command is the only way
    # the plaintext ever exists — and issuing revokes the previous link.
    path(
        "<uuid:application_id>/tracking-link/",
        ApplicationTrackingLinkView.as_view(),
        name="application-tracking-link",
    ),
    path("<uuid:application_id>/waitlist-position/", ApplicationWaitlistPositionView.as_view(), name="application-waitlist-position"),
    path("<uuid:application_id>/conditions/", ApplicationConditionsView.as_view(), name="application-conditions"),
    path("<uuid:application_id>/conditions/<uuid:condition_id>/verify/", ApplicationConditionVerifyView.as_view(), name="application-condition-verify"),
    # admissions-v2 task 10.2 (R13.9, STU-16): the condition-specific evidence,
    # comment, replacement, review-with-reason and history workflow.
    path(
        "<uuid:application_id>/conditions/<uuid:condition_id>/",
        ApplicationConditionDetailView.as_view(),
        name="application-condition-detail",
    ),
    path(
        "<uuid:application_id>/conditions/<uuid:condition_id>/evidence/",
        ApplicationConditionEvidenceView.as_view(),
        name="application-condition-evidence",
    ),
    path(
        "<uuid:application_id>/conditions/<uuid:condition_id>/review/",
        ApplicationConditionReviewView.as_view(),
        name="application-condition-review",
    ),
    path("<uuid:application_id>/confirm-enrollment/", ApplicationConfirmEnrollmentView.as_view(), name="application-confirm-enrollment"),
    path("<uuid:application_id>/assign/", ApplicationAssignView.as_view(), name="application-assign"),
    path("<uuid:application_id>/assignment-candidates/", AssignmentCandidatesView.as_view(), name="application-assignment-candidates"),
    path("auto-assign/", ApplicationAutoAssignView.as_view(), name="application-auto-assign"),
    path("<uuid:application_id>/fee-waiver/", ApplicationFeeWaiverView.as_view(), name="application-fee-waiver"),
    path("<uuid:application_id>/amendments/", ApplicationAmendmentView.as_view(), name="application-amendments"),
    path("<uuid:application_id>/amendments/<uuid:amendment_id>/review/", ApplicationAmendmentReviewView.as_view(), name="application-amendment-review"),
    # admissions-v2 task 10.2 (R13.9-R13.10, STU-17): the owner-scoped amendment
    # detail. Registered *after* the review route so the more specific path wins.
    path(
        "<uuid:application_id>/amendments/<uuid:amendment_id>/",
        ApplicationAmendmentDetailView.as_view(),
        name="application-amendment-detail",
    ),
]

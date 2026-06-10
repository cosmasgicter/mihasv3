"""Application URL routing.

Implements task 13.4.
Requirements: 10.1
"""

from django.urls import path

from apps.applications.history_views import TimelineHistoryView
from apps.applications.views import (
    AcceptanceLetterView,
    ApplicationSlipView,
    ApplicationAmendmentReviewView,
    ApplicationAmendmentView,
    ApplicationAssignView,
    ApplicationAutoAssignView,
    ApplicationBulkStatusView,
    ApplicationConditionsView,
    ApplicationConditionVerifyView,
    ApplicationConfirmEnrollmentView,
    ConditionalOfferView,
    ApplicationDetailView,
    ApplicationDetailsView,
    ApplicationDocumentsView,
    ApplicationDraftView,
    ApplicationExportView,
    ApplicationFeeWaiverView,
    ApplicationGradesView,
    ApplicationInterviewListView,
    ApplicationInterviewView,
    ApplicationListCreateView,
    ApplicationReviewView,
    ApplicationSubmitView,
    ApplicationPreviewSummaryView,
    ApplicationAdminSummaryView,
    ApplicationSummaryView,
    ApplicationTrackView,
    ApplicationVerifyDocumentView,
    ApplicationWaitlistPositionView,
    ApplicationWithdrawView,
    EmailSlipView,
    FinanceReceiptView,
    PaymentReceiptView,
)

app_name = "applications"

urlpatterns = [
    path("", ApplicationListCreateView.as_view(), name="application-list-create"),
    path("export/", ApplicationExportView.as_view(), name="application-export"),
    path("track/", ApplicationTrackView.as_view(), name="application-track"),
    path("bulk-status/", ApplicationBulkStatusView.as_view(), name="application-bulk-status"),
    path("draft/", ApplicationDraftView.as_view(), name="application-draft"),
    path("interviews/", ApplicationInterviewListView.as_view(), name="application-interview-list"),
    path("history/", TimelineHistoryView.as_view(), name="application-history"),
    path("<uuid:application_id>/", ApplicationDetailView.as_view(), name="application-detail"),
    path("<uuid:application_id>/details/", ApplicationDetailsView.as_view(), name="application-details"),
    path("<uuid:application_id>/documents/", ApplicationDocumentsView.as_view(), name="application-documents"),
    path("<uuid:application_id>/grades/", ApplicationGradesView.as_view(), name="application-grades"),
    path("<uuid:application_id>/summary/", ApplicationSummaryView.as_view(), name="application-summary"),
    path("<uuid:application_id>/submit/", ApplicationSubmitView.as_view(), name="application-submit"),
    path("<uuid:application_id>/preview-summary/", ApplicationPreviewSummaryView.as_view(), name="application-preview-summary"),
    path("<uuid:application_id>/admin-summary/", ApplicationAdminSummaryView.as_view(), name="application-admin-summary"),
    path("<uuid:application_id>/review/", ApplicationReviewView.as_view(), name="application-review"),
    path("<uuid:application_id>/interviews/", ApplicationInterviewView.as_view(), name="application-interviews"),
    path("<uuid:application_id>/verify-document/", ApplicationVerifyDocumentView.as_view(), name="application-verify-document"),
    path("<uuid:application_id>/application-slip/", ApplicationSlipView.as_view(), name="application-slip"),
    path("<uuid:application_id>/acceptance-letter/", AcceptanceLetterView.as_view(), name="application-acceptance-letter"),
    path("<uuid:application_id>/conditional-offer/", ConditionalOfferView.as_view(), name="application-conditional-offer"),
    path("<uuid:application_id>/finance-receipt/", FinanceReceiptView.as_view(), name="application-finance-receipt"),
    path("<uuid:application_id>/payment-receipt/", PaymentReceiptView.as_view(), name="application-payment-receipt"),
    path("<uuid:application_id>/email-slip/", EmailSlipView.as_view(), name="application-email-slip"),
    path("<uuid:application_id>/withdraw/", ApplicationWithdrawView.as_view(), name="application-withdraw"),
    path("<uuid:application_id>/waitlist-position/", ApplicationWaitlistPositionView.as_view(), name="application-waitlist-position"),
    path("<uuid:application_id>/conditions/", ApplicationConditionsView.as_view(), name="application-conditions"),
    path("<uuid:application_id>/conditions/<uuid:condition_id>/verify/", ApplicationConditionVerifyView.as_view(), name="application-condition-verify"),
    path("<uuid:application_id>/confirm-enrollment/", ApplicationConfirmEnrollmentView.as_view(), name="application-confirm-enrollment"),
    path("<uuid:application_id>/assign/", ApplicationAssignView.as_view(), name="application-assign"),
    path("auto-assign/", ApplicationAutoAssignView.as_view(), name="application-auto-assign"),
    path("<uuid:application_id>/fee-waiver/", ApplicationFeeWaiverView.as_view(), name="application-fee-waiver"),
    path("<uuid:application_id>/amendments/", ApplicationAmendmentView.as_view(), name="application-amendments"),
    path("<uuid:application_id>/amendments/<uuid:amendment_id>/review/", ApplicationAmendmentReviewView.as_view(), name="application-amendment-review"),
]

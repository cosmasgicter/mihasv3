"""Document and payment URL routing.

Implements task 16.4, 5.8.
Requirements: 2.1, 4.1, 6.1, 10.1, 13.1
"""

from django.urls import path

from apps.documents.risk_views import RiskFlagsListView
from apps.documents.views import (
    DeferPaymentView,
    DocumentDeleteView,
    DocumentDownloadView,
    DocumentExtractView,
    DocumentInfoView,
    DocumentSignedUrlView,
    DocumentUploadView,
    FeeResolveView,
    LencoWebhookView,
    MobileMoneyInitiateView,
    PaymentDevBypassView,
    PaymentInitiateView,
    PaymentListView,
    PaymentReceiptView,
    PaymentVerifyView,
    ProgramFeeViewSet,
    SuperAdminPaymentCorrectionView,
)
from apps.documents.job_views import (
    CoverLetterGenerateView,
    DocumentVersionListView,
    QuestionBankAnswerView,
    ResumeListView,
    ResumeVariantCreateView,
)

app_name = "documents"

# Document endpoints: /api/v1/documents/...
document_urlpatterns = [
    path("upload/", DocumentUploadView.as_view(), name="document-upload"),
    path("resumes/", ResumeListView.as_view(), name="resume-list"),
    path("resumes/variants/", ResumeVariantCreateView.as_view(), name="resume-variant-create"),
    path("cover-letters/generate/", CoverLetterGenerateView.as_view(), name="cover-letter-generate"),
    path("question-bank/answer/", QuestionBankAnswerView.as_view(), name="question-bank-answer"),
    path(
        "<uuid:document_id>/extract/",
        DocumentExtractView.as_view(),
        name="document-extract",
    ),
    path(
        "<uuid:document_id>/signed-url/",
        DocumentSignedUrlView.as_view(),
        name="document-signed-url",
    ),
    path(
        "<uuid:document_id>/download/",
        DocumentDownloadView.as_view(),
        name="document-download",
    ),
    path(
        "<uuid:document_id>/info/",
        DocumentInfoView.as_view(),
        name="document-info",
    ),
    path(
        "<uuid:document_id>/delete/",
        DocumentDeleteView.as_view(),
        name="document-delete",
    ),
    path(
        "<uuid:document_id>/versions/",
        DocumentVersionListView.as_view(),
        name="document-version-list",
    ),
]

# Payment endpoints: /api/v1/payments/...
payment_urlpatterns = [
    path(
        "",
        PaymentListView.as_view(),
        name="payment-list",
    ),
    path(
        "initiate/",
        PaymentInitiateView.as_view(),
        name="payment-initiate",
    ),
    path(
        "defer/",
        DeferPaymentView.as_view(),
        name="payment-defer",
    ),
    path(
        "mobile-money/",
        MobileMoneyInitiateView.as_view(),
        name="payment-mobile-money",
    ),
    path(
        "dev-bypass/",
        PaymentDevBypassView.as_view(),
        name="payment-dev-bypass",
    ),
    path(
        "resolve-fee/",
        FeeResolveView.as_view(),
        name="fee-resolve",
    ),
    path(
        "webhook/lenco/",
        LencoWebhookView.as_view(),
        name="lenco-webhook",
    ),
    path(
        "risk-flags/",
        RiskFlagsListView.as_view(),
        name="payment-risk-flags",
    ),
    path(
        "<uuid:payment_id>/receipt/",
        PaymentReceiptView.as_view(),
        name="payment-receipt",
    ),
    path(
        "<uuid:payment_id>/verify/",
        PaymentVerifyView.as_view(),
        name="payment-verify",
    ),
    path(
        "<uuid:payment_id>/correct/",
        SuperAdminPaymentCorrectionView.as_view(),
        name="payment-super-admin-correct",
    ),
]

# ProgramFee endpoints: /api/v1/programs/<uuid:program_id>/fees/...
# These are registered in config/urls.py under a separate prefix.
program_fee_urlpatterns = [
    path(
        "",
        ProgramFeeViewSet.as_view({"get": "list", "post": "create"}),
        name="program-fee-list",
    ),
    path(
        "<uuid:pk>/",
        ProgramFeeViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}),
        name="program-fee-detail",
    ),
]

# Default urlpatterns includes both for backward compat; root urls.py
# includes document_urlpatterns and payment_urlpatterns separately.
urlpatterns = document_urlpatterns

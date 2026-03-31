"""Document and payment URL routing.

Implements task 16.4.
Requirements: 10.1
"""

from django.urls import path

from apps.documents.views import (
    DocumentExtractView,
    DocumentUploadView,
    PaymentReceiptView,
    PaymentVerifyView,
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
        "<uuid:document_id>/versions/",
        DocumentVersionListView.as_view(),
        name="document-version-list",
    ),
]

# Payment endpoints: /api/v1/payments/...
payment_urlpatterns = [
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
]

# Default urlpatterns includes both for backward compat; root urls.py
# includes document_urlpatterns and payment_urlpatterns separately.
urlpatterns = document_urlpatterns

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

app_name = "documents"

# Document endpoints: /api/v1/documents/...
document_urlpatterns = [
    path("upload/", DocumentUploadView.as_view(), name="document-upload"),
    path(
        "<uuid:document_id>/extract/",
        DocumentExtractView.as_view(),
        name="document-extract",
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

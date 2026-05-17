"""Document and payment views — re-export shim.

This module was decomposed during Stream 9 backend module decomposition.
All view classes are re-exported here so that existing URL configurations
and test imports continue to work unchanged.

Split files:
  - mobile_money_views.py      — MobileMoneyInitiateView
  - payment_widget_views.py    — PaymentInitiateView, DeferPaymentView, PaymentDevBypassView
  - payment_admin_views.py     — SuperAdminPaymentCorrectionView
  - payment_query_views.py     — PaymentVerifyView, PaymentListView, PaymentReceiptView, FeeResolveView, ProgramFeeViewSet
  - lenco_webhook_views.py     — LencoWebhookView
  - document_storage_views.py  — DocumentUploadView, DocumentDownloadView, DocumentSignedUrlView, DocumentDeleteView, DocumentInfoView, DocumentExtractView
"""

from apps.documents.mobile_money_views import MobileMoneyInitiateView  # noqa: F401
from apps.documents.payment_widget_views import (  # noqa: F401
    DeferPaymentView,
    PaymentDevBypassView,
    PaymentInitiateView,
)
from apps.documents.payment_admin_views import (  # noqa: F401
    SuperAdminPaymentCorrectionRequestSerializer,
    SuperAdminPaymentCorrectionView,
)
from apps.documents.payment_query_views import (  # noqa: F401
    FeeResolveView,
    PaymentListView,
    PaymentReceiptView,
    PaymentVerifyView,
    ProgramFeeViewSet,
)
from apps.documents.lenco_webhook_views import LencoWebhookView  # noqa: F401
from apps.documents.document_storage_views import (  # noqa: F401
    DocumentDeleteView,
    DocumentDownloadView,
    DocumentExtractView,
    DocumentInfoView,
    DocumentSignedUrlView,
    DocumentUploadView,
)

# Test patch backward-compat: existing tests use
# ``@patch("apps.documents.views.X")`` for these symbols.
from apps.documents.models import (  # noqa: F401
    ApplicationDocument,
    Payment,
    ProgramFee,
    WebhookEventLog,
)

__all__ = [
    "DeferPaymentView",
    "DocumentDeleteView",
    "DocumentDownloadView",
    "DocumentExtractView",
    "DocumentInfoView",
    "DocumentSignedUrlView",
    "DocumentUploadView",
    "FeeResolveView",
    "LencoWebhookView",
    "MobileMoneyInitiateView",
    "PaymentDevBypassView",
    "PaymentInitiateView",
    "PaymentListView",
    "PaymentReceiptView",
    "PaymentVerifyView",
    "ProgramFeeViewSet",
    "SuperAdminPaymentCorrectionRequestSerializer",
    "SuperAdminPaymentCorrectionView",
]

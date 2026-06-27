"""Document and payment views - re-export shim.

This module was decomposed during Stream 9 backend module decomposition.
All view classes are re-exported here so that existing URL configurations
and test imports continue to work unchanged.

Compatibility owner: Beanola platform engineering.
Removal condition: no production module imports this shim, and all tests that
patch ``apps.documents.views.*`` have moved to the canonical split modules
named below. Tracked by canonical-multi-tenant-alignment task 29.

Split files:
  - mobile_money_views.py      - MobileMoneyInitiateView
  - payment_widget_views.py    - PaymentInitiateView, DeferPaymentView, PaymentDevBypassView
  - payment_admin_views.py     - SuperAdminPaymentCorrectionView
  - payment_query_views.py     - PaymentVerifyView, PaymentListView, PaymentReceiptView, FeeResolveView, ProgramFeeViewSet
  - lenco_webhook_views.py     - LencoWebhookView
  - document_storage_views.py  - DocumentUploadView, DocumentDownloadView, DocumentSignedUrlView, DocumentDeleteView, DocumentInfoView, DocumentExtractView
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
    PaymentSettlementSummaryView,
    PaymentVerifyView,
    ProgramFeeViewSet,
    _ip_allowed,
)
from apps.documents.throttles import PaymentVerifyThrottle  # noqa: F401
from apps.documents.lenco_webhook_views import LencoWebhookView  # noqa: F401
from apps.documents.document_storage_views import (  # noqa: F401
    DocumentDeleteView,
    DocumentDownloadView,
    DocumentExtractView,
    DocumentInfoView,
    DocumentSignedUrlView,
    DocumentUploadView,
    _get_document_storage_key,
)

# Test patch backward-compat: existing tests use
# ``@patch("apps.documents.views.X")`` for these symbols.
from apps.documents.models import (  # noqa: F401
    ApplicationDocument,
    Payment,
    ProgramFee,
    WebhookEventLog,
)
from apps.common.pagination import StandardPagination  # noqa: F401

COMPATIBILITY_OWNER = "Beanola platform engineering"
REMOVAL_CONDITION = (
    "Remove after tests stop importing or patching apps.documents.views; "
    "runtime URL routing already imports canonical split modules directly."
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
    "PaymentSettlementSummaryView",
    "PaymentVerifyView",
    "PaymentVerifyThrottle",
    "ProgramFeeViewSet",
    "SuperAdminPaymentCorrectionRequestSerializer",
    "SuperAdminPaymentCorrectionView",
    "StandardPagination",
    "COMPATIBILITY_OWNER",
    "REMOVAL_CONDITION",
    "_get_document_storage_key",
    "_ip_allowed",
]

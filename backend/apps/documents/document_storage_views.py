"""Document and payment views.

Implements tasks 16.2, 16.3, 5.1, 5.2, 5.3, 5.4, 5.5.
Requirements: 2.1, 2.2, 2.3, 3.1–3.5, 4.1, 4.2, 4.7, 6.1–6.3, 10.1, 13.1–13.6
"""

import hashlib
import ipaddress
import json
import logging
import uuid
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin
from apps.catalog.services import AccessScopeService
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, Payment, ProgramFee
from apps.documents.serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    PaymentSerializer,
    PaymentVerifySerializer,
    ProgramFeeSerializer,
    MobileMoneyInitiateRequestSerializer,
    MobileMoneyInitiateResponseSerializer,
    DeferPaymentRequestSerializer,
    DeferPaymentResponseSerializer,
)
from apps.documents.throttles import MobileMoneyThrottle, PaymentInitiateThrottle, PaymentVerifyThrottle
from apps.documents.validators import validate_file_magic_bytes
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    PaymentReceiptSerializer,
    TaskQueuedSerializer,
    envelope_serializer,
)
from apps.common.metrics import emit_metric
from apps.common.idempotency import idempotent
from apps.common.dev_bypass import require_not_dev_bypass_in_production
from apps.common.throttling import AIUserScopedRateThrottle, PaymentUserScopedRateThrottle
from apps.documents import payment_metrics

from django.http import HttpResponseRedirect

logger = logging.getLogger(__name__)


from apps.common.request_utils import get_client_ip as _client_ip


def _ip_allowed(ip_address: str, allowed_ranges: list[str]) -> bool:
    if not allowed_ranges:
        return True
    try:
        candidate = ipaddress.ip_address(ip_address)
    except ValueError:
        return False
    for allowed in allowed_ranges:
        try:
            if candidate in ipaddress.ip_network(allowed, strict=False):
                return True
        except ValueError:
            if ip_address == allowed:
                return True
    return False


def _parse_ai_analysis(verification_notes: str | None) -> dict | None:
    """Extract AI analysis JSON from verification_notes field."""
    if not verification_notes:
        return None
    try:
        data = json.loads(verification_notes)
        return data.get("ai_analysis") if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _document_not_found_response():
    return Response(
        {"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        status=status.HTTP_404_NOT_FOUND,
    )


def _document_permission_denied_response():
    return Response(
        {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _get_authorized_document(request, view, document_id):
    """Load a document and enforce ownership through its parent application."""
    try:
        document = ApplicationDocument.objects.select_related("application").get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        return None, _document_not_found_response()

    application = getattr(document, "application", None)
    if application is None:
        return None, _document_not_found_response()

    role = getattr(request.user, "role", "student")
    if role == "admin":
        scoped = AccessScopeService().filter_documents(
            ApplicationDocument.objects.filter(id=document.id),
            request.user,
        )
        if not scoped.exists():
            # Out-of-scope reads must be indistinguishable from a true
            # not-found so existence cannot be inferred (R4.4).
            return None, _document_not_found_response()
    elif not IsOwnerOrAdmin().has_object_permission(request, view, application):
        # A non-owning student (or any non-admin without ownership) is masked
        # as a genuine not-found so document existence cannot be inferred
        # (R3.6, R4.3, Property 13). Out-of-scope reads across every document
        # surface return the byte-identical 404 envelope.
        return None, _document_not_found_response()

    return document, None


def _audit_official_document_deleted(request, document):
    """Write a privileged official-document deletion Audit_Event (R4.4, R4.6).

    Routes through the existing ``TenantAuditService`` / ``audit_logs``
    mechanism. The payload carries only non-PII identifiers — actor id,
    document id, application id, document type, the ``system_generated`` flag,
    and the institution id. It NEVER includes the document body, extracted
    text, file URL/storage key, or applicant PII (NRC, full name, phone,
    email). Audit-writer failures never propagate.
    """
    application = getattr(document, "application", None)
    institution_id = getattr(application, "institution_ref_id", None) if application else None
    actor_id = getattr(request.user, "id", None)
    actor_role = getattr(request.user, "role", None)

    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_event(
            action="official_document.deleted",
            entity_type="application_document",
            entity_id=document.id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata={
                "document_id": str(document.id),
                "application_id": str(application.id) if application is not None else None,
                "document_type": document.document_type,
                "system_generated": bool(document.system_generated),
                "institution_id": str(institution_id) if institution_id else None,
            },
            retention_category="security",
            request=request,
        )
    except Exception:  # pragma: no cover - audit writes must never block deletes
        logger.warning(
            "Failed to emit official-document deletion audit for document %s",
            getattr(document, "id", None),
            exc_info=True,
        )


def _audit_official_document_downloaded(request, document):
    """Write an official-document download Audit_Event (R16.3, R16.4).

    Routes through the existing ``TenantAuditService`` / ``audit_logs``
    mechanism. Records the actor role (admin or student) so an operator can see
    who pulled the document, but NEVER the applicant's PII (name, NRC/passport,
    phone, email, address), the file bytes, or the signed URL/storage key —
    only the document id, application id, document type, and institution id.
    Audit-writer failures never propagate.
    """
    application = getattr(document, "application", None)
    institution_id = getattr(application, "institution_ref_id", None) if application else None
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_official_document_downloaded(
            document_id=getattr(document, "id", None),
            application_id=getattr(application, "id", None) if application else None,
            institution_id=institution_id,
            document_type=getattr(document, "document_type", None),
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit writes must never block a download
        logger.warning(
            "Failed to emit official-document download audit for document %s",
            getattr(document, "id", None),
            exc_info=True,
        )


def _get_document_storage_key(document):
    """Compatibility shim - delegates to ``apps.common.storage.get_document_storage_key``.

    Kept so legacy imports (e.g. ``from apps.documents.views import
    _get_document_storage_key``) and existing test patches keep working
    while we migrate callers to the shared helper.
    """
    from apps.common.storage import get_document_storage_key

    return get_document_storage_key(document)


DocumentResponseSerializer = envelope_serializer(
    "DocumentResponse",
    DocumentSerializer(),
)
TaskQueuedResponseSerializer = envelope_serializer(
    "DocumentTaskQueuedResponse",
    TaskQueuedSerializer(),
)
PaymentReceiptResponseSerializer = envelope_serializer(
    "PaymentReceiptResponse",
    PaymentReceiptSerializer(),
)
PaymentResponseSerializer = envelope_serializer(
    "PaymentResponse",
    PaymentSerializer(),
)




@extend_schema_view(
    post=extend_schema(
        operation_id="documents_upload",
        tags=["documents"],
        request=DocumentUploadSerializer,
        responses={
            201: OpenApiResponse(response=DocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            500: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DocumentUploadView(APIView):
    """POST /api/v1/documents/upload/ - upload a document.

    Validates magic bytes, stores in S3/R2, creates ApplicationDocument record.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentUploadSerializer

    def post(self, request):
        # Enforce 10MB file size limit
        uploaded_file = request.FILES.get('file')
        if uploaded_file and uploaded_file.size > 10 * 1024 * 1024:
            return Response(
                {"success": False, "error": "File size exceeds 10MB limit", "code": "FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_obj = serializer.validated_data["file"]
        document_type = serializer.validated_data["document_type"]
        application_id = serializer.validated_data["application_id"]

        # Verify ownership: student can only upload to their own application.
        from apps.applications.models import Application

        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        role = getattr(user, "role", "student")
        if role not in ("admin", "super_admin") and str(application.user_id) != str(user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if role == "admin":
            scoped = AccessScopeService().filter_applications(
                Application.objects.filter(id=application.id),
                user,
            )
            if not scoped.exists():
                return Response(
                    {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if role not in ("admin", "super_admin") and document_type == "application_slip":
            return Response(
                {"success": False, "error": "Application slips are system-generated", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if role not in ("admin", "super_admin") and application.status != "draft":
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Magic byte validation.
        declared_mime = file_obj.content_type or ""
        try:
            validate_file_magic_bytes(file_obj, declared_mime)
        except Exception:
            logger.exception("File magic-byte validation failed for upload to application %s", application_id)
            return Response(
                {"success": False, "error": "Invalid file format", "code": "INVALID_FILE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store file in S3/R2.
        import os as _os
        import re as _re
        safe_name = _os.path.basename(file_obj.name or "unnamed")
        safe_name = _re.sub(r'[^\w\s\-.]', '_', safe_name)[:255] or "unnamed"
        file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{safe_name}"
        try:
            from apps.common.storage import MediaStorage

            storage = MediaStorage()
            saved_name = storage.save(file_key, file_obj)
            file_url = storage.url(saved_name)
        except Exception:
            logger.exception("Failed to upload file to storage")
            return Response(
                {"success": False, "error": "File storage error", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create ApplicationDocument record.
        doc = ApplicationDocument.objects.create(
            application_id=application_id,
            document_type=document_type,
            document_name=safe_name,
            file_url=file_url,
            file_size=getattr(file_obj, "size", None),
            mime_type=declared_mime or None,
            verification_status="pending",
            system_generated=False,
            uploaded_at=timezone.now(),
        )

        application_url_field = None
        if document_type == "result_slip":
            application_url_field = "result_slip_url"
        elif document_type in ("extra_kyc", "nrc", "passport"):
            application_url_field = "extra_kyc_url"

        if application_url_field:
            setattr(application, application_url_field, file_url)
            application.updated_at = timezone.now()
            application.save(update_fields=[application_url_field, "updated_at"])

        return Response(
            {"success": True, "data": DocumentSerializer(doc).data},
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    post=extend_schema(
        operation_id="documents_extract",
        tags=["documents"],
        parameters=[
            OpenApiParameter("document_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Document UUID."),
        ],
        request=None,
        responses={
            202: OpenApiResponse(response=TaskQueuedResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DocumentExtractView(APIView):
    """POST /api/v1/documents/{id}/extract/ - enqueue OCR Celery task."""

    permission_classes = [IsAuthenticated]
    serializer_class = TaskQueuedSerializer
    # AI hardening: cap per-user OCR retries (5/hour) when flag is on.
    # Guards against budget-burn attacks via repeated ``force=True`` calls.
    throttle_classes = [AIUserScopedRateThrottle]
    throttle_scope = "ai_document_extract"

    def post(self, request, document_id):
        # Authorize through the shared scope path BEFORE any side effect. The
        # loader masks out-of-scope reads as a byte-identical 404 not-found
        # (R3.2, R3.3, R3.6) and never authorizes on ``role == "admin"`` alone
        # — scope comes only from ``AccessScopeService`` (R3.8).
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            # Return the loader error unchanged; no OCR task is enqueued and no
            # document state is mutated (R3.1, R3.2).
            return error_response

        # Enqueue OCR task only after authorization succeeds (R3.4, R3.5, R3.7).
        from apps.documents.tasks import extract_document_text_task

        force = request.data.get("force", False) is True
        task = extract_document_text_task.delay(str(document.id), force=force)

        return Response(
            {
                "success": True,
                "data": {
                    "task_id": task.id,
                    "document_id": str(document.id),
                    "status": "queued",
                },
            },
            status=status.HTTP_202_ACCEPTED,
        )


# ---------------------------------------------------------------------------
# Bug 3 fix: Missing document endpoints (signed-url, download, info, delete)
# ---------------------------------------------------------------------------


class DocumentSignedUrlView(APIView):
    """GET /api/v1/documents/{id}/signed-url/ - generate a time-limited signed URL.

    Returns {"url": "https://..."} for the document's file in R2/S3.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        file_key = _get_document_storage_key(document)
        if not file_key:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from apps.common.storage import generate_signed_url

            signed_url = generate_signed_url(file_key)
        except Exception:
            logger.exception("Failed to generate signed URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate signed URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"success": True, "data": {"url": signed_url}})


class DocumentDownloadView(APIView):
    """GET /api/v1/documents/{id}/download/ - redirect to signed download URL.

    Generates a signed URL and returns HTTP 302 redirect.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={302: None})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        file_key = _get_document_storage_key(document)
        if not file_key:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from apps.common.storage import generate_signed_url

            signed_url = generate_signed_url(file_key)
        except Exception:
            logger.exception("Failed to generate download URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate download URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # R16.3: a download of an official (system-generated) document is an
        # auditable lifecycle event. Record the actor role (admin/student) but
        # never the applicant PII, file bytes, or signed URL. Best-effort.
        if getattr(document, "system_generated", False):
            _audit_official_document_downloaded(request, document)

        return HttpResponseRedirect(signed_url)


class DocumentInfoView(APIView):
    """GET /api/v1/documents/{id}/info/ - return document metadata.

    Returns document_name, document_type, verification_status,
    uploaded_at, file_size, and mime_type.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        ai_analysis = _parse_ai_analysis(document.verification_notes) if document.extracted_text else None
        ocr_state = document.verification_status if document.verification_status in {
            "ocr_processing",
            "ocr_complete",
            "ocr_no_text",
            "ocr_no_grades",
            "ocr_failed",
            "ocr_skipped",
        } else None
        data = {
            "id": str(document.id),
            "document_name": document.document_name,
            "document_type": document.document_type,
            "verification_status": document.verification_status,
            "ocr_state": ocr_state,
            "uploaded_at": document.uploaded_at.isoformat() if document.uploaded_at else None,
            "file_size": document.file_size,
            "mime_type": document.mime_type,
            "extracted_text": bool(document.extracted_text),
            "ai_analysis": ai_analysis,
            "ai_analysis_available": bool(ai_analysis),
        }

        return Response({"success": True, "data": data})


class DocumentDeleteView(APIView):
    """DELETE /api/v1/documents/{id}/delete/ - soft-delete a document record.

    Sets verification_status to 'deleted' as a soft-delete marker.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def delete(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        role = getattr(request.user, "role", "student")

        # R4.1: official (system-generated) documents are immutable to anyone
        # who is not a super-admin — students and ordinary school staff alike.
        if document.system_generated and role != "super_admin":
            return Response(
                {
                    "success": False,
                    "error": "Official generated documents cannot be deleted",
                    "code": "OFFICIAL_DOCUMENT_IMMUTABLE",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # R4.2: a student may soft-delete their own non-system document only
        # while the application is still editable (draft) per the existing
        # editability policy.
        if role not in ("admin", "super_admin"):
            if document.application.status != "draft":
                return Response(
                    {
                        "success": False,
                        "error": "Application is not editable",
                        "code": "APPLICATION_NOT_EDITABLE",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        document.verification_status = "deleted"
        document.updated_at = timezone.now()
        document.save(update_fields=["verification_status", "updated_at"])

        application = document.application
        if document.document_type == "result_slip":
            remaining_result_slip = ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type="result_slip",
            ).exclude(
                id=document.id,
            ).exclude(
                verification_status="deleted",
            ).exists()
            if not remaining_result_slip and application.result_slip_url:
                application.result_slip_url = None
                application.updated_at = timezone.now()
                application.save(update_fields=["result_slip_url", "updated_at"])
        elif document.document_type in ("extra_kyc", "nrc", "passport"):
            remaining_identity_document = ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type__in=("extra_kyc", "nrc", "passport"),
            ).exclude(
                id=document.id,
            ).exclude(
                verification_status="deleted",
            ).exists()
            if not remaining_identity_document and application.extra_kyc_url:
                application.extra_kyc_url = None
                application.updated_at = timezone.now()
                application.save(update_fields=["extra_kyc_url", "updated_at"])

        # R4.4/R4.6: a super-admin's privileged deletion of an official
        # (system-generated) document is audited — IDs + doc type + flag +
        # institution only, never the document body, PII, or secrets.
        if role == "super_admin" and document.system_generated:
            _audit_official_document_deleted(request, document)

        return Response(
            {"success": True, "message": "Document deleted"},
            status=status.HTTP_200_OK,
        )

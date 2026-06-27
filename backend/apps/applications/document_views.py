"""Document-related application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for document verification, acceptance letter generation,
and finance receipt generation.
"""

import logging

from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.applications.models import Application
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_constants import COMPLETED_PAYMENT_STATUSES
from apps.documents.serializers import DocumentSerializer
from apps.catalog.services import AccessScopeService
from apps.applications.official_document_views import (
    OfficialDocumentDetailView,
    OfficialDocumentResponseSerializer,
    OfficialDocumentStatusSerializer,
)

from ._view_helpers import (
    ApplicationDocumentMutationResponseSerializer,
    DocumentVerifySerializer,
)

logger = logging.getLogger(__name__)


def _get_scoped_application(request, application_id):
    queryset = Application.objects.select_related("user", "institution_ref", "canonical_program", "program_offering", "intake_ref")
    queryset = AccessScopeService().filter_applications(queryset, request.user)
    return queryset.get(id=application_id)


def _with_deprecation_headers(response: Response, *, canonical_document_type: str) -> Response:
    """Mark legacy document-generation endpoints as deprecated in-band."""
    response["Deprecation"] = "true"
    response["Link"] = (
        f'</api/v1/applications/{{application_id}}/official-documents/'
        f'{canonical_document_type}/>; rel="successor-version"'
    )
    response["Warning"] = (
        '299 - "Deprecated endpoint; use /api/v1/applications/{id}/'
        f'official-documents/{canonical_document_type}/"'
    )
    return response


def _delegate_to_official_document(request, application_id, document_type: str) -> Response:
    """Delegate a legacy admin generation route to the canonical official route."""
    legacy_slug = document_type.replace("_", "-")
    idem_key = f"{legacy_slug}:{application_id}"
    actor_id = getattr(request.user, "id", None)
    method = "POST"
    path = f"/api/v1/applications/{application_id}/{legacy_slug}/"
    try:
        from apps.common.models import IdempotencyKey

        cached = IdempotencyKey.objects.filter(
            idempotency_key=idem_key,
            actor_id=actor_id,
            method=method,
            path=path,
        ).first()
    except Exception:
        cached = None
    if cached is not None:
        return _with_deprecation_headers(
            Response(
                {"success": True, "data": cached.response_body},
                status=status.HTTP_202_ACCEPTED,
            ),
            canonical_document_type=document_type,
        )

    request._suppress_official_document_queue_audit = True
    if hasattr(request, "_request"):
        request._request._suppress_official_document_queue_audit = True
    response = OfficialDocumentDetailView().post(
        request,
        application_id=application_id,
        document_type=document_type,
    )
    if response.status_code in (status.HTTP_200_OK, status.HTTP_202_ACCEPTED):
        try:
            from apps.common.models import AuditLog

            legacy_action = {
                "acceptance_letter": "generate_acceptance_letter",
                "finance_receipt": "generate_finance_receipt",
                "payment_receipt": "generate_payment_receipt",
                "application_slip": "generate_application_slip",
                "conditional_offer": "generate_conditional_offer",
            }.get(document_type, f"generate_{document_type}")
            AuditLog.objects.create(
                entity_type="applications",
                entity_id=application_id,
                action=legacy_action,
                actor_id=getattr(request.user, "id", None),
                changes={"canonical_document_type": document_type},
            )
        except Exception:
            logger.warning(
                "Unable to record legacy document-generation audit for %s",
                application_id,
                exc_info=True,
            )
        if document_type in {"acceptance_letter", "finance_receipt"}:
            data = response.data.get("data", {}) if isinstance(response.data, dict) else {}
            response.data = {
                "success": True,
                "data": {
                    "task_id": data.get("task_id"),
                    "application_id": str(application_id),
                    "status": data.get("status", "queued"),
                },
            }
    return _with_deprecation_headers(response, canonical_document_type=document_type)


# ---------------------------------------------------------------------------
# Document Verification
# ---------------------------------------------------------------------------


class ApplicationVerifyDocumentView(APIView):
    """POST /api/v1/applications/{id}/verify-document/"""

    permission_classes = [IsAdmin]
    serializer_class = DocumentVerifySerializer

    @extend_schema(
        operation_id="applications_verify_document",
        tags=["applications"],
        request=DocumentVerifySerializer,
        responses={
            200: OpenApiResponse(response=ApplicationDocumentMutationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        from apps.common.audit_network import build_audit_network_fields

        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DocumentVerifySerializer(data=request.data)
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

        document_id = serializer.validated_data["documentId"]
        verification_status = serializer.validated_data["status"]
        notes = serializer.validated_data.get("notes", "")

        try:
            document = ApplicationDocument.objects.select_related(
                'application', 'verified_by'
            ).get(
                id=document_id, application_id=application.id
            )
        except ApplicationDocument.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Document not found for this application",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        old_status = document.verification_status
        document.verification_status = verification_status
        document.verified_by_id = str(request.user.id)
        document.verified_at = timezone.now()
        document.verification_notes = notes
        document.save(
            update_fields=[
                "verification_status",
                "verified_by",
                "verified_at",
                "verification_notes",
                "updated_at",
            ]
        )

        from apps.common.models import AuditLog

        network_fields = build_audit_network_fields(request)

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action=f"document_{verification_status}",
            entity_type="application_documents",
            entity_id=document.id,
            changes={
                "old_status": old_status,
                "new_status": verification_status,
                "notes": notes,
            },
            ip_address=network_fields["ip_address"],
            user_agent=network_fields["user_agent"],
            ip_address_encrypted=network_fields["ip_address_encrypted"],
            user_agent_encrypted=network_fields["user_agent_encrypted"],
            retention_category="standard",
        )

        # R10.5/R10.8: emit an institution-scoped tenant Audit_Event so a
        # tenant admin can read document-verification activity for their own
        # school (filtered on ``changes.institution_id``). Never blocks the
        # decision — TenantAuditService swallows writer failures.
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_document_verification(
                document_id=document.id,
                application_id=application.id,
                institution_id=getattr(application, "institution_ref_id", None),
                old_status=old_status,
                new_status=verification_status,
                document_type=document.document_type,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                reason=notes,
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a write
            pass

        try:
            from apps.common.communication_service import CommunicationService
            app = Application.objects.filter(id=document.application_id).first()
            if app:
                template = 'document_verified' if verification_status == 'verified' else 'document_rejected'
                CommunicationService.send(template, app, {'document_name': document.document_type or 'Document'})
        except Exception:
            logger.warning("Failed to send document verification notification for document=%s", document.id, exc_info=True)

        return Response({"success": True, "data": DocumentSerializer(document).data})


# ---------------------------------------------------------------------------
# Acceptance Letter
# ---------------------------------------------------------------------------


class AcceptanceLetterView(APIView):
    """POST /api/v1/applications/{id}/acceptance-letter/

    Deprecated wrapper over
    /api/v1/applications/{id}/official-documents/acceptance_letter/.
    """

    permission_classes = [IsAdmin]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_generate_acceptance_letter",
        tags=["applications"],
        deprecated=True,
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.status != "approved":
            return Response(
                {
                    "success": False,
                    "error": "Application must be in accepted status to generate an acceptance letter",
                    "code": "INVALID_STATUS",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _delegate_to_official_document(request, application_id, "acceptance_letter")


class ApplicationSlipView(APIView):
    """POST /api/v1/applications/{id}/application-slip/"""

    permission_classes = [IsAdmin]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_generate_application_slip",
        tags=["applications"],
        deprecated=True,
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return _delegate_to_official_document(request, application_id, "application_slip")


class ConditionalOfferView(APIView):
    """POST /api/v1/applications/{id}/conditional-offer/"""

    permission_classes = [IsAdmin]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_generate_conditional_offer",
        tags=["applications"],
        deprecated=True,
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if application.status not in {"conditional", "conditionally_approved", "approved"}:
            return Response(
                {"success": False, "error": "Application is not in a conditional-offer status", "code": "INVALID_STATUS"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _delegate_to_official_document(request, application_id, "conditional_offer")


# ---------------------------------------------------------------------------
# Finance Receipt
# ---------------------------------------------------------------------------


class FinanceReceiptView(APIView):
    """POST /api/v1/applications/{id}/finance-receipt/

    Deprecated wrapper over
    /api/v1/applications/{id}/official-documents/finance_receipt/.
    """

    permission_classes = [IsAdmin]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_generate_finance_receipt",
        tags=["applications"],
        deprecated=True,
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        has_verified_payment = Payment.objects.filter(
            application_id=application.id, status__in=COMPLETED_PAYMENT_STATUSES
        ).exists()
        if not has_verified_payment:
            return Response(
                {
                    "success": False,
                    "error": "Application must have a completed payment to generate a finance receipt",
                    "code": "PAYMENT_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _delegate_to_official_document(request, application_id, "finance_receipt")


class PaymentReceiptView(APIView):
    """POST /api/v1/applications/{id}/payment-receipt/"""

    permission_classes = [IsAdmin]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_generate_payment_receipt",
        tags=["applications"],
        deprecated=True,
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = _get_scoped_application(request, application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        has_verified_payment = Payment.objects.filter(
            application_id=application.id, status__in=COMPLETED_PAYMENT_STATUSES
        ).exists()
        if not has_verified_payment:
            return Response(
                {"success": False, "error": "Application must have a completed payment to generate a payment receipt", "code": "PAYMENT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _delegate_to_official_document(request, application_id, "payment_receipt")

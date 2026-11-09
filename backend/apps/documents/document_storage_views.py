"""Document and payment views.

Implements tasks 16.2, 16.3, 5.1, 5.2, 5.3, 5.4, 5.5.
Requirements: 2.1, 2.2, 2.3, 3.1–3.5, 4.1, 4.2, 4.7, 6.1–6.3, 10.1, 13.1–13.6
"""

import hashlib
import ipaddress
import json
import logging
import re
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
from apps.common.throttling import (
    DocumentExtractUserScopedRateThrottle,
    DocumentUserRateThrottle,
    PaymentUserScopedRateThrottle,
)
from apps.documents import payment_metrics

from django.http import HttpResponseRedirect

logger = logging.getLogger(__name__)

_IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{8,128}")


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


def _get_authorized_document(request, view, document_id, *, allow_assigned_reviewer=True):
    """Load a document through owner-or-scoped capability authority (R5-g).

    Delegates to ``resolve_owner_or_scoped_document`` (scope before lookup,
    ``tenant.document.read``), so a non-owner student, an out-of-scope staff
    actor and an unknown id all receive the byte-identical 404. An
    assignment-scoped reviewer reaches only assigned applications, the same rule
    as applications. Commands that mutate or re-run extraction pass
    ``allow_assigned_reviewer=False`` so a reviewer keeps the masked 404 there.
    """
    from rest_framework.exceptions import NotFound, PermissionDenied

    from apps.common.tenant_authorization import (
        _is_assignment_scoped_reviewer,
        require_reviewer_assignment,
        resolve_owner_or_scoped_document,
    )

    try:
        document = resolve_owner_or_scoped_document(
            request,
            document_id,
            capability="tenant.document.read",
            queryset=ApplicationDocument.objects.select_related("application"),
        )
        application = getattr(document, "application", None)
        if application is None:
            return None, _document_not_found_response()
        actor_id = str(getattr(request.user, "id", "") or getattr(request.user, "pk", "") or "")
        is_owner = actor_id and str(getattr(application, "user_id", "") or "") == actor_id
        if not is_owner:
            if not allow_assigned_reviewer and _is_assignment_scoped_reviewer(request.user):
                return None, _document_not_found_response()
            require_reviewer_assignment(request, application)
    except NotFound:
        # Out-of-scope reads must be indistinguishable from a true not-found so
        # existence cannot be inferred (R4.4, R3.6, Property 13).
        return None, _document_not_found_response()
    except PermissionDenied:
        return None, _document_permission_denied_response()
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
    """Compatibility shim - delegates to ``apps.common.storage.resolve_document_object_key``.

    Kept so legacy imports (e.g. ``from apps.documents.views import
    _get_document_storage_key``) and existing test patches keep working
    while we migrate callers to the shared helper.
    """
    from apps.common.storage import resolve_document_object_key

    return resolve_document_object_key(document)


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
            # admissions-v2 task 7.3 (R17.1): a competing attempt already holds
            # this command's declared identity (``DOCUMENT_UPLOAD_IN_PROGRESS``),
            # or a concurrent upload won the one-current slot first
            # (``DOCUMENT_VERSION_CONFLICT``). Both are retryable and neither
            # wrote anything.
            409: OpenApiResponse(response=ErrorResponseSerializer),
            500: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DocumentUploadView(APIView):
    """POST /api/v1/documents/upload/ - upload a document.

    Validates magic bytes, stores in S3/R2, creates ApplicationDocument record.
    """

    throttle_classes = [DocumentUserRateThrottle]
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentUploadSerializer

    def post(self, request):
        from apps.applications.required_documents import PLATFORM_MAX_UPLOAD_BYTES

        # Platform ceiling, enforced before anything is read or resolved.
        uploaded_file = request.FILES.get('file')
        if uploaded_file and uploaded_file.size > PLATFORM_MAX_UPLOAD_BYTES:
            return Response(
                {"success": False, "error": "File size exceeds 10MB limit", "code": "FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # An empty selection gets the shared stable code (task 7.2), not the
        # serializer's generic VALIDATION_ERROR: the client refuses the same case
        # locally under ``EMPTY_FILE``, and "your document is invalid" is the
        # wrong thing to tell a student whose file simply did not attach.
        if uploaded_file is not None and uploaded_file.size == 0:
            return Response(
                {
                    "success": False,
                    "error": "That file is empty. Please choose the file again.",
                    "code": "EMPTY_FILE",
                },
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

        # admissions-v2 task 7.2 (R11.6-R11.7, STU-13): resolve this upload
        # against the application's *own* versioned requirement contract — the
        # same contract the student's upload controls were rendered from. A
        # tenant-configured custom type is accepted; a type nobody asked for is
        # refused with a stable code; and an unevaluable configuration fails
        # closed with a retryable 503 instead of accepting unverified evidence.
        # R2-b (clause 2.8): validate the optional replay key's shape. The value
        # is never echoed back.
        raw_idempotency_key = request.headers.get("Idempotency-Key")
        if raw_idempotency_key is not None and not _IDEMPOTENCY_KEY_PATTERN.fullmatch(
            raw_idempotency_key
        ):
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": {
                        "Idempotency-Key": [
                            "Use 8 to 128 letters, digits, dots, colons, underscores or hyphens."
                        ]
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # R2-c (clause 2.9): the effective type. A specific declared type takes
        # today's path unchanged; an aliased spelling is normalised; a generic or
        # empty declaration is replaced by what the bytes are. Magic bytes below
        # still decide acceptance.
        from apps.documents.validators import (
            DECLARED_MIME_ALIASES,
            GENERIC_DECLARED_MIME_TYPES,
            detect_file_mime,
        )

        declared_mime = str(file_obj.content_type or "").strip().lower()
        declared_mime = DECLARED_MIME_ALIASES.get(declared_mime, declared_mime)
        if declared_mime in GENERIC_DECLARED_MIME_TYPES:
            declared_class = "empty" if not declared_mime else "octet"
            detected = detect_file_mime(file_obj)
            emit_metric(
                "document.upload.detected_mime",
                declared_class=declared_class,
                detected={
                    "application/pdf": "pdf",
                    "image/jpeg": "jpeg",
                    "image/png": "png",
                }.get(detected, "none"),
            )
            if detected is None:
                logger.info("Upload refused: unrecognisable bytes (declared class=%s)", declared_class)
                return Response(
                    {"success": False, "error": "Invalid file format", "code": "INVALID_FILE"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            declared_mime = detected
        from apps.applications.assignment_resolution import AssignmentConfigurationError
        from apps.applications.required_documents import (
            UploadRejected,
            resolve_upload_target,
            validate_upload,
        )

        try:
            requirement = resolve_upload_target(application, document_type)
            validate_upload(
                requirement,
                size=getattr(file_obj, "size", None),
                mime_type=declared_mime,
            )
        except UploadRejected as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )
        except AssignmentConfigurationError as exc:
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "retryable": True,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Magic byte validation — the authority on what the bytes actually are.
        try:
            validate_file_magic_bytes(file_obj, declared_mime)
        except Exception:
            logger.exception("File magic-byte validation failed for upload to application %s", application_id)
            return Response(
                {"success": False, "error": "Invalid file format", "code": "INVALID_FILE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Active-content screen (task 7.2, R11.7; design §9.2 "malware/type/size
        # check"). The format is now known to be a PDF/JPEG/PNG; this refuses one
        # that carries an executable action or a script polyglot before anything
        # is written to object storage. Signature-based scanning and the
        # ``uploaded -> scanning -> ready_for_review`` lifecycle are task 7.3.
        from apps.documents.validators import scan_document_for_active_content

        try:
            scan_document_for_active_content(file_obj)
        except Exception as exc:
            logger.warning(
                "Active-content screen refused an upload to application %s", application_id
            )
            detail = getattr(exc, "detail", None)
            message = (
                str(detail[0]) if isinstance(detail, list) and detail else str(detail or exc)
            )
            return Response(
                {"success": False, "error": message, "code": "UNSAFE_FILE_CONTENT"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # admissions-v2 task 7.3 (R11.7-R11.8, R17.1, STU-19): the object write and
        # the metadata write become one recoverable command instead of two
        # unrelated ones. Order matters and is asserted by
        # tests/integration/test_document_evidence_compensation_7_3.py:
        #
        #   hash -> idempotency short-circuit -> COMMIT stage row
        #        -> object write -> VERIFY the stored object
        #        -> COMMIT metadata (supersede + new version)
        #        -> on metadata failure: compensating delete, else sweeper
        #
        # The verify step is what closes the *other* direction of the gap: an
        # object write that reports success without being durable would otherwise
        # be recorded as evidence whose bytes cannot be produced. Compensation can
        # delete an orphan object; it cannot recover missing bytes, so the commit
        # is ordered after the proof instead of before it.
        from apps.documents import document_evidence as evidence

        safe_name = evidence.safe_object_name(file_obj.name)
        try:
            content_hash, hashed_size = evidence.compute_checksum(file_obj)
        except Exception:
            logger.exception("Failed to checksum upload for application %s", application_id)
            return Response(
                {"success": False, "error": "File could not be read", "code": "INVALID_FILE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accepts = list(requirement.get("accepts_document_types") or [document_type])
        idempotency_key = raw_idempotency_key or None

        # Idempotent replay (R17.1), strongest identity first.
        #
        # 1. The caller-declared one. A client that resends the same
        #    ``Idempotency-Key`` is asserting "this is the command I already sent",
        #    and the stage ledger knows whether that command produced evidence.
        #    This lookup is also what keeps
        #    ``uq_document_upload_stages_idempotency`` from turning a legitimate
        #    retry into an unactionable integrity error.
        # 2. Failing that, the implicit one: the same bytes *under the same name*
        #    already current for this requirement. Bytes alone are deliberately
        #    not enough — a student who uploads a second, byte-identical file
        #    under a different name is replacing their evidence, and answering
        #    that with the old version is the server-side shape of STU-19's
        #    "'Replace' may clear only local UI state".
        replay = evidence.find_replay_by_idempotency_key(
            application_id, document_type, idempotency_key
        ) or evidence.find_identical_current_version(
            application_id, accepts, content_hash, document_name=safe_name
        )
        if replay is not None:
            evidence.heal_snapshot_on_replay(application_id, replay)
            return Response(
                {"success": True, "data": DocumentSerializer(replay).data},
                status=status.HTTP_201_CREATED,
            )

        object_key = evidence.build_object_key(application_id, document_type, mime_type=declared_mime)
        actor_id = getattr(request.user, "id", None)
        # Durable BEFORE the object write (design §17): once this row is committed
        # the object is discoverable, so a crash mid-command leaves a reconcilable
        # stage rather than an invisible orphan.
        try:
            stage = evidence.open_stage(
                application_id=application_id,
                document_type=document_type,
                object_key=object_key,
                content_hash=content_hash,
                file_size=hashed_size or getattr(file_obj, "size", None),
                mime_type=declared_mime or None,
                actor_id=actor_id,
                idempotency_key=idempotency_key,
            )
        except evidence.DocumentCommandError as exc:
            # A concurrent attempt with the same declared identity holds the
            # ledger slot. Nothing has been written, so there is nothing to
            # compensate; the client retries once the first attempt resolves.
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "retryable": True,
                },
                status=exc.status_code,
            )

        try:
            from apps.common.storage import MediaStorage

            storage = MediaStorage()
            saved_name = storage.save(object_key, file_obj)
        except Exception as exc:
            logger.exception("Failed to upload file to storage")
            # No object is known to exist, but the provider may have written a
            # partial object before failing, so compensation still runs: it either
            # deletes it or leaves the row for the sweeper. Never a silent orphan.
            evidence.compensate_stage(stage, reason=f"object write failed: {exc}")
            return Response(
                {"success": False, "error": "File storage error", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # The provider said yes; confirm it before the database agrees. A missing
        # or short object here leaves the *previous* version authoritative and the
        # student with a retryable failure, which is the honest outcome — the
        # alternative is a committed version, a published checksum, and a passed
        # submission gate for evidence nobody can open.
        try:
            evidence.verify_stored_object(
                storage,
                saved_name or object_key,
                expected_size=hashed_size or None,
            )
        except evidence.DocumentCommandError as exc:
            logger.error(
                "Stored document object failed verification for application %s "
                "(document_type=%s); refusing to record it as evidence",
                application_id,
                document_type,
            )
            emit_metric(
                evidence.EVENT_STAGE_UNVERIFIED,
                stage_id=str(stage.id),
                document_type=document_type,
            )
            evidence.compensate_stage(
                stage, reason=f"storage verification failed: {exc.code}"
            )
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "retryable": True,
                },
                status=exc.status_code,
            )

        try:
            doc = evidence.commit_version(
                stage=stage,
                application_id=application_id,
                document_type=document_type,
                document_name=safe_name,
                # The key, never a link: links expire and are signed on read (R4-a).
                file_url=saved_name or object_key,
                storage_key=saved_name or object_key,
                file_size=hashed_size or getattr(file_obj, "size", None),
                mime_type=declared_mime or None,
                content_hash=content_hash,
                uploaded_by_id=actor_id,
                actor_role=role,
                provenance=(
                    evidence.PROVENANCE_ADMIN
                    if role in ("admin", "super_admin")
                    else evidence.PROVENANCE_STUDENT
                ),
                # The active-content screen above already ran synchronously on
                # these exact bytes, so the version is genuinely ready for a
                # human. The asynchronous `scanning` state stays available for
                # deeper signature scanning without backdating a state here.
                lifecycle_state=evidence.READY_FOR_REVIEW,
                supersede_document_types=accepts,
                snapshot_field=evidence.SNAPSHOT_FIELD_BY_DOCUMENT_TYPE.get(document_type),
            )
        except evidence.DocumentCommandError as exc:
            evidence.compensate_stage(stage, reason=f"metadata commit rejected: {exc.code}")
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )
        except Exception as exc:
            logger.exception(
                "Document metadata commit failed for application %s", application_id
            )
            evidence.compensate_stage(stage, reason=f"metadata commit failed: {exc}")
            return Response(
                {
                    "success": False,
                    "error": "The upload could not be saved. Please try again.",
                    "code": "DOCUMENT_COMMIT_FAILED",
                    "retryable": True,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
    # Cap per-user OCR retries (5/hour) when the flag is on: repeated
    # ``force=True`` re-extract calls are CPU-expensive. Task 7.4 renamed the
    # throttle and scope off the retired AI vocabulary; extraction is local.
    throttle_classes = [DocumentExtractUserScopedRateThrottle, DocumentUserRateThrottle]
    throttle_scope = "document_extract"

    def post(self, request, document_id):
        # Authorize through the shared scope path BEFORE any side effect. The
        # loader masks out-of-scope reads as a byte-identical 404 not-found
        # (R3.2, R3.3, R3.6) and never authorizes on ``role == "admin"`` alone
        # — scope comes only from ``AccessScopeService`` (R3.8).
        document, error_response = _get_authorized_document(request, self, document_id, allow_assigned_reviewer=False)
        if error_response is not None:
            # Return the loader error unchanged; no OCR task is enqueued and no
            # document state is mutated (R3.1, R3.2).
            return error_response

        # Enqueue OCR task only after authorization succeeds (R3.4, R3.5, R3.7).
        from apps.documents.tasks import extract_document_text_task

        force = request.data.get("force", False) is True
        # Record that a job exists before enqueueing, so /info/ can tell "queued"
        # from "never started" (SJR R3-c). A document the task would skip (text
        # already extracted, no force) is left alone: nothing would clear
        # ``pending``.
        previous_state = document.extraction_state
        marked_pending = False
        if (force or previous_state is None) and not (document.extracted_text and not force):
            ApplicationDocument.objects.filter(id=document.id).update(extraction_state="pending")
            marked_pending = True
        try:
            task = extract_document_text_task.delay(str(document.id), force=force)
        except Exception:
            if marked_pending:
                ApplicationDocument.objects.filter(id=document.id).update(
                    extraction_state=previous_state
                )
            logger.error("OCR enqueue failed for document %s", document.id, exc_info=True)
            emit_metric("ocr.extract.enqueue_failed")
            return Response(
                {
                    "success": False,
                    "error": "Text extraction is temporarily unavailable. Enter your grades manually or try again shortly.",
                    "code": "OCR_QUEUE_UNAVAILABLE",
                    "retryable": True,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

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

    throttle_classes = [DocumentUserRateThrottle]
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        try:
            from apps.common.storage import resolve_document_open_url
            signed_url = resolve_document_open_url(document)
        except Exception:
            logger.exception("Failed to generate signed URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate signed URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if not signed_url:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({"success": True, "data": {"url": signed_url}})


class DocumentDownloadView(APIView):
    """GET /api/v1/documents/{id}/download/ - redirect to signed download URL.

    Generates a signed URL and returns HTTP 302 redirect.
    Requires authentication.
    """

    throttle_classes = [DocumentUserRateThrottle]
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={302: None})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        try:
            from apps.common.storage import resolve_document_open_url
            signed_url = resolve_document_open_url(document)
        except Exception:
            logger.exception("Failed to generate download URL for document %s", document_id)
            return Response(
                {"success": False, "error": "Failed to generate download URL", "code": "STORAGE_ERROR"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if not signed_url:
            return Response(
                {"success": False, "error": "Document has no file", "code": "NO_FILE"},
                status=status.HTTP_404_NOT_FOUND,
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

    throttle_classes = [DocumentUserRateThrottle]
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def get(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id)
        if error_response is not None:
            return error_response

        from apps.documents import document_evidence as evidence
        from apps.documents import extraction_provenance, grade_extraction

        # admissions-v2 task 7.4: generative extraction is gone, so any blob
        # still in ``verification_notes`` is historical. It is surfaced as
        # labeled read-only provenance and never as current authority.
        historical_extraction = extraction_provenance.provenance_payload(document)
        _OCR_STATES = {
            "ocr_pending",
            "ocr_processing",
            "ocr_complete",
            "ocr_no_text",
            "ocr_no_grades",
            "ocr_failed",
            "ocr_skipped",
        }
        # ``extraction_state`` is the canonical home for OCR progress (task 7.3);
        # ``verification_status`` is only consulted for rows written before the
        # column existed, so an existing client keeps seeing the same `ocr_state`.
        if document.extraction_state == "pending":
            ocr_state = "ocr_pending"
        else:
            ocr_state = document.extraction_state if document.extraction_state in _OCR_STATES else None
        if ocr_state is None and document.verification_status in (_OCR_STATES - {"ocr_pending"}):
            ocr_state = document.verification_status
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
            # Labeled read-only provenance for pre-7.4 rows (R11.9 + the design
            # §18 "preserve historical extraction as labeled provenance" rule).
            "extraction_provenance": historical_extraction,
            # admissions-v2 task 7.5 (R11.4): deterministic OCR *suggestions*.
            # Every candidate carries its subject identity, grade, confidence,
            # match tier, and the source line it came from; the block states
            # ``requires_confirmation`` and ``authoritative: false`` explicitly so
            # no client can treat it as application data. ``None`` when the
            # document has no stored candidate set (never OCR'd, not a result
            # slip, or nothing resolved).
            #
            # The pre-7.5 ``ai_analysis`` / ``ai_analysis_available`` aliases that
            # stood in for this block are GONE: they published a historical blob
            # under a name that implied current AI authority, and the wizard hook
            # that consumed them auto-applied it. Historical values are still
            # readable above, labelled for what they are.
            "extraction": grade_extraction.latest_candidates(document),
            # Immutable-version identity (task 7.3, R11.7).
            "version": document.version,
            "is_current": document.is_current,
            "lifecycle_state": evidence.lifecycle_of(document),
            "extraction_state": document.extraction_state,
            "checksum": document.content_hash,
        }

        return Response({"success": True, "data": data})


class DocumentDeleteView(APIView):
    """DELETE /api/v1/documents/{id}/delete/ - remove a document as current evidence.

    admissions-v2 task 7.3 (R11.8, STU-19): this is the *delete command* over the
    immutable version model, not a status poke. One atomic metadata write marks the
    version non-current with lifecycle ``deleted``, and the removal is appended to
    the append-only verification history with the actor and reason. The stored
    object is deliberately retained so prior evidence survives (R11.8) — there is
    therefore no object write to compensate, which is why this command is atomic by
    construction rather than by a compensating action that could itself fail.

    Requires authentication.
    """

    throttle_classes = [DocumentUserRateThrottle]
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.ANY})
    def delete(self, request, document_id):
        document, error_response = _get_authorized_document(request, self, document_id, allow_assigned_reviewer=False)
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

        from apps.documents import document_evidence as evidence

        try:
            evidence.delete_document(
                document=document,
                actor_id=getattr(request.user, "id", None),
                actor_role=role,
                reason=(request.data or {}).get("reason") if hasattr(request, "data") else None,
            )
        except evidence.DocumentCommandError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )

        # The legacy ``applications.*_url`` snapshots are cleared only when no
        # *current* evidence of that type survives. ``is_current=True`` matters here
        # (task 7.3): a superseded version is history, so counting it would keep a
        # dead URL alive after the live evidence was removed.
        application = document.application
        if document.document_type == "result_slip":
            remaining_result_slip = ApplicationDocument.objects.filter(
                application_id=application.id,
                document_type="result_slip",
                is_current=True,
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
                is_current=True,
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

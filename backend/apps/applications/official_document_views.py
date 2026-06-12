"""Student-safe official-document endpoints (task 8.2).

Spec: ``multi-tenant-beanola-remediation`` — Phase 3 (Official-document
consolidation), Requirement 5.

Exposes three resource-style routes under the existing application namespace
(the admin-only generation endpoints in ``document_views.py`` stay untouched):

    POST /api/v1/applications/{id}/official-documents/{document_type}/   generate/ensure current
    GET  /api/v1/applications/{id}/official-documents/                   list latest per type
    GET  /api/v1/applications/{id}/official-documents/{document_type}/   status + download_url

Authorization goes through the shared scope path (mirrors
``document_storage_views._get_authorized_document``): a student is authorized
only for their own application (owner check); School_Staff (admin/reviewer) are
authorized only for in-scope applications via
``AccessScopeService().filter_applications(...)`` with **404 not-found masking**
out of scope (R5.6, R5.8); a Super_Admin is authorized globally (R5.7). Scope
for staff comes only from ``AccessScopeService`` — never from ``role == "admin"``
alone.

On top of authorization, student requests carry a per-type status/payment gate
(R5.2–R5.5). When the gate does not hold (or the requester is not authorized),
the response is the 404 not-found envelope byte-identical to the genuine
not-found baseline for the same actor, so the application's existence is never
leaked.

The success envelope (R5.1, R5.9) is::

    {"success": true, "data": {
        "document_id": "…|null", "document_type": "application_slip",
        "status": "ready|queued|failed", "download_url": "…optional…",
        "generated_at": "…|null", "template_version": 3|null,
        "institution_id": "…|null"}}

The async generate path returns ``status="queued"`` with a ``task_id`` poll
reference when a broker is reachable. This environment may have no Celery broker
(no Redis), so when enqueue fails the permitted path still returns a 2xx
``queued`` status (a derived "pending generation" marker) rather than a 5xx —
the security gates and 404 masking are never weakened to achieve this.
"""

from __future__ import annotations

import json
import logging

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
)
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOwnerOrAdmin, is_super_admin
from apps.applications.models import Application
from apps.applications.tasks.pdf_generation import _current_official_version
from apps.catalog.services import AccessScopeService
from apps.common.openapi_helpers import ErrorResponseSerializer, envelope_serializer
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

logger = logging.getLogger(__name__)


# Document types this surface serves and the Celery task that renders each one.
# The task is resolved lazily inside the view (an ImportError degrades to the
# brokerless "queued" fallback rather than a hard failure).
_DOCUMENT_TASK_NAMES = {
    "application_slip": "generate_application_slip_task",
    "acceptance_letter": "generate_acceptance_letter_task",
    "conditional_offer": "generate_conditional_offer_task",
    "payment_receipt": "generate_payment_receipt_task",
    "finance_receipt": "generate_finance_receipt_task",
}

# A non-draft submitted state means the application has left the editable draft
# stage (R5.2). Mirrors the gate enumerated in the Property 18 test.
_NON_DRAFT_SUBMITTED_STATUSES = {
    "submitted",
    "under_review",
    "waitlisted",
    "conditionally_approved",
    "approved",
}


# ---------------------------------------------------------------------------
# 404 not-found masking — byte-identical to document_storage_views baseline
# ---------------------------------------------------------------------------


def _not_found_response() -> Response:
    """The canonical not-found envelope shared with ``document_storage_views``.

    Out-of-scope reads, non-owner reads, and gate-closed student reads all
    return this identical envelope so the application's existence cannot be
    inferred (R5.6, R5.8, Property 13/18).
    """
    return Response(
        {"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        status=status.HTTP_404_NOT_FOUND,
    )


def _get_authorized_application(request, view, application_id):
    """Load an application and enforce the shared scope path.

    Returns ``(application, None)`` when the requester is authorized, or
    ``(None, error_response)`` masked as a genuine not-found otherwise. Scope
    for School_Staff comes only from ``AccessScopeService`` — never from
    ``role == "admin"`` alone (R5.6).
    """
    try:
        application = Application.objects.select_related("institution_ref").get(id=application_id)
    except Application.DoesNotExist:
        return None, _not_found_response()

    # Super_Admin is authorized globally (R5.7).
    if is_super_admin(request.user):
        return application, None

    role = getattr(request.user, "role", "student")
    if role in ("admin", "reviewer"):
        # School_Staff: scope comes solely from AccessScopeService. Out of
        # scope is masked as a genuine not-found (R5.6).
        scoped = AccessScopeService().filter_applications(
            Application.objects.filter(id=application.id),
            request.user,
        )
        if not scoped.exists():
            return None, _not_found_response()
        return application, None

    # Student (or any non-staff): owner check only. A non-owner is masked as a
    # genuine not-found so existence cannot be inferred (R5.8).
    if not IsOwnerOrAdmin().has_object_permission(request, view, application):
        return None, _not_found_response()
    return application, None


# ---------------------------------------------------------------------------
# Status / payment gate (R5.2–R5.5)
# ---------------------------------------------------------------------------


def _has_completed_payment(application) -> bool:
    """A completed payment is exactly one in ``RECEIPT_ELIGIBLE_STATUSES`` (R5.5)."""
    return Payment.objects.filter(
        application_id=application.id,
        status__in=RECEIPT_ELIGIBLE_STATUSES,
    ).exists()


def _student_gate_open(document_type: str, application) -> bool:
    """Whether the student per-type status/payment gate holds (R5.2–R5.5).

    Mirrors the single source of truth in the Property 18 test:
      application_slip   → a non-draft submitted status   (R5.2)
      acceptance_letter  → ``approved``                    (R5.3)
      conditional_offer  → ``conditionally_approved``      (R5.4)
      payment_receipt    → a completed payment exists      (R5.5)
    """
    app_status = getattr(application, "status", None)
    if document_type == "application_slip":
        return app_status in _NON_DRAFT_SUBMITTED_STATUSES
    if document_type == "acceptance_letter":
        return app_status == "approved"
    if document_type == "conditional_offer":
        return app_status == "conditionally_approved"
    if document_type in ("payment_receipt", "finance_receipt"):
        return _has_completed_payment(application)
    return False


# ---------------------------------------------------------------------------
# Envelope construction
# ---------------------------------------------------------------------------


def _official_document_metadata(document) -> dict:
    """Parse ``verification_notes.official_document`` provenance (best-effort)."""
    raw = getattr(document, "verification_notes", None)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    official = parsed.get("official_document")
    return official if isinstance(official, dict) else {}


def _institution_id(application) -> str | None:
    institution_id = getattr(application, "institution_ref_id", None)
    return str(institution_id) if institution_id else None


def _signed_download_url(document) -> str | None:
    """Return a time-limited signed download URL for a document's stored file.

    The persisted ``file_url`` is a permanent, **unsigned** R2/S3 object URL and
    the bucket is private (``AWS_DEFAULT_ACL = None``), so handing the raw URL to
    the browser yields ``403 AccessDenied``. Mirror the working pattern in
    ``DocumentDownloadView``/``DocumentSignedUrlView``: derive the storage key
    from the stored ``file_url`` and presign it (default 15-minute expiry).

    Returns ``None`` when the document has no file or signing is unavailable so
    the caller can omit ``download_url`` (the UI then keeps surfacing a
    non-ready state rather than offering a link that 403s).
    """
    if document is None or not getattr(document, "file_url", None):
        return None
    try:
        from apps.common.storage import generate_signed_url, get_document_storage_key

        file_key = get_document_storage_key(document)
        if not file_key:
            return None
        return generate_signed_url(file_key)
    except Exception:  # pragma: no cover - signing must never 500 the status read
        logger.warning(
            "Unable to sign official-document download URL for document %s; "
            "omitting download_url",
            getattr(document, "id", None),
            exc_info=True,
        )
        return None


def _build_envelope(application, document_type: str, *, document=None, status_value: str, task_id=None) -> dict:
    """Build the official-document data envelope (R5.1, R5.9)."""
    data: dict = {
        "document_id": str(document.id) if document is not None else None,
        "document_type": document_type,
        "status": status_value,
        "generated_at": (
            document.uploaded_at.isoformat()
            if document is not None and getattr(document, "uploaded_at", None)
            else None
        ),
        "template_version": None,
        "institution_id": _institution_id(application),
    }

    if document is not None:
        metadata = _official_document_metadata(document)
        data["template_version"] = metadata.get("template_version")
        # ``download_url`` must be a **signed** URL — the bucket is private, so
        # the raw stored ``file_url`` 403s in the browser. Sign on read; omit
        # the field when the document carries no file or signing is unavailable.
        signed_url = _signed_download_url(document)
        if signed_url:
            data["download_url"] = signed_url

    if task_id is not None:
        data["task_id"] = task_id

    return data


def _audit_official_document_queued(request, application, document_type: str, task_id) -> None:
    """Record an official-document queued Audit_Event (R16.3). Never raises.

    Emitted on the POST path when no Current_Official_Version exists and a
    render is enqueued (or the brokerless derived-pending fallback fires), so
    the queued lifecycle stage is observable. Carries only the application +
    institution ids, the document type, and the opaque Celery ``task_id`` — no
    applicant PII, credentials, or document bytes (R16.4).
    """
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_official_document_queued(
            application_id=getattr(application, "id", None),
            institution_id=getattr(application, "institution_ref_id", None),
            document_type=document_type,
            task_id=task_id,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block the response
        logger.info(
            "Unable to record official-document queued audit for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )


def _enqueue_generation(application, document_type: str):
    """Best-effort async enqueue of the renderer task.

    Returns the Celery ``task_id`` when a broker is reachable, otherwise
    ``None``. A missing/unreachable broker (this environment has no Redis) is
    swallowed so the permitted path still returns a 2xx ``queued`` status — the
    security gates are never weakened to compensate.
    """
    task_name = _DOCUMENT_TASK_NAMES.get(document_type)
    if not task_name:
        return None
    try:
        from apps.applications import tasks as application_tasks

        task_func = getattr(application_tasks, task_name, None)
        if task_func is None:
            return None
        result = task_func.delay(str(application.id))
        return getattr(result, "id", None)
    except Exception:
        # No reachable broker (brokerless env) or transient dispatch failure.
        # The Current_Official_Version lifecycle makes generation idempotent,
        # so a later request safely re-attempts; surface "queued" without a
        # task_id rather than a 5xx.
        logger.info(
            "Official-document generation could not be enqueued for application %s "
            "(%s); returning derived queued status",
            getattr(application, "id", None),
            document_type,
            exc_info=True,
        )
        return None


# ---------------------------------------------------------------------------
# Serializers (OpenAPI only)
# ---------------------------------------------------------------------------


class OfficialDocumentStatusSerializer(serializers.Serializer):
    document_id = serializers.CharField(allow_null=True)
    document_type = serializers.CharField()
    status = serializers.ChoiceField(choices=["ready", "queued", "failed"])
    download_url = serializers.CharField(required=False)
    generated_at = serializers.CharField(allow_null=True)
    template_version = serializers.IntegerField(allow_null=True)
    institution_id = serializers.CharField(allow_null=True)
    task_id = serializers.CharField(required=False)


OfficialDocumentResponseSerializer = envelope_serializer(
    "OfficialDocumentResponse",
    OfficialDocumentStatusSerializer(),
)
OfficialDocumentListResponseSerializer = envelope_serializer(
    "OfficialDocumentListResponse",
    OfficialDocumentStatusSerializer(many=True),
)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class OfficialDocumentDetailView(APIView):
    """Generate (POST) or read the status of (GET) a single Official_Document.

    POST /api/v1/applications/{id}/official-documents/{document_type}/
    GET  /api/v1/applications/{id}/official-documents/{document_type}/
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OfficialDocumentStatusSerializer

    def _authorize_and_gate(self, request, application_id, document_type):
        """Shared authorize + gate. Returns ``(application, error_response)``.

        ``error_response`` is the masked 404 when the requester is not
        authorized or — for a student — the per-type gate does not hold.
        """
        if document_type not in _DOCUMENT_TASK_NAMES:
            # Unknown document type: mask as not-found, never a distinct error
            # that could leak the application's existence.
            return None, _not_found_response()

        application, error_response = _get_authorized_application(request, self, application_id)
        if error_response is not None:
            return None, error_response

        # Student per-type status/payment gate (R5.2–R5.5). Staff/super-admin
        # are gated by scope only (R5.6, R5.7).
        if not is_super_admin(request.user) and getattr(request.user, "role", "student") not in (
            "admin",
            "reviewer",
        ):
            if not _student_gate_open(document_type, application):
                return None, _not_found_response()

        return application, None

    @extend_schema(
        operation_id="applications_official_document_generate",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("document_type", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            202: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id, document_type):
        application, error_response = self._authorize_and_gate(request, application_id, document_type)
        if error_response is not None:
            return error_response

        # Reuse the Current_Official_Version when one already exists — input
        # driven idempotency lives in the generator, so the endpoint never
        # forces a duplicate render.
        current = _current_official_version(ApplicationDocument, application, document_type)
        if current is not None:
            return Response(
                {
                    "success": True,
                    "data": _build_envelope(
                        application, document_type, document=current, status_value="ready"
                    ),
                },
                status=status.HTTP_200_OK,
            )

        # Not yet generated: enqueue the renderer (best-effort) and report a
        # queued status the client can poll. Brokerless env → no task_id.
        task_id = _enqueue_generation(application, document_type)
        _audit_official_document_queued(request, application, document_type, task_id)
        return Response(
            {
                "success": True,
                "data": _build_envelope(
                    application, document_type, document=None, status_value="queued", task_id=task_id
                ),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @extend_schema(
        operation_id="applications_official_document_status",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("document_type", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def get(self, request, application_id, document_type):
        application, error_response = self._authorize_and_gate(request, application_id, document_type)
        if error_response is not None:
            return error_response

        current = _current_official_version(ApplicationDocument, application, document_type)
        if current is not None:
            data = _build_envelope(application, document_type, document=current, status_value="ready")
        else:
            # Permitted but not yet generated → a pending/queued status the
            # client can poll until the renderer produces the document.
            data = _build_envelope(application, document_type, document=None, status_value="queued")

        return Response({"success": True, "data": data}, status=status.HTTP_200_OK)


class OfficialDocumentListView(APIView):
    """GET /api/v1/applications/{id}/official-documents/ — latest per type."""

    permission_classes = [IsAuthenticated]
    serializer_class = OfficialDocumentStatusSerializer

    @extend_schema(
        operation_id="applications_official_document_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=OfficialDocumentListResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def get(self, request, application_id):
        application, error_response = _get_authorized_application(request, self, application_id)
        if error_response is not None:
            return error_response

        results = []
        for document_type in _DOCUMENT_TASK_NAMES:
            current = _current_official_version(ApplicationDocument, application, document_type)
            if current is not None:
                results.append(
                    _build_envelope(
                        application, document_type, document=current, status_value="ready"
                    )
                )

        return Response({"success": True, "data": results}, status=status.HTTP_200_OK)

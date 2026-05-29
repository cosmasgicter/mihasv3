"""Shared helpers for application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
"""

import hashlib
import logging
import uuid

from django.db.models import CharField, DateTimeField, DecimalField, OuterRef, QuerySet, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response

from apps.applications.models import Application
from apps.applications.serializers import (
    ApplicationDraftSerializer,
    ApplicationGradeSerializer,
    ApplicationInterviewSerializer,
    ApplicationListSerializer,
    ApplicationSerializer,
    ApplicationTrackingSerializer,
)
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    StatusTransitionSerializer,
    UpdatedCountSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.documents.models import Payment
from apps.documents.serializers import DocumentSerializer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# QuerySet helpers
# ---------------------------------------------------------------------------


def _with_payment_summary(queryset):
    """Annotate application querysets with payment summary fields."""

    if not isinstance(queryset, QuerySet):
        return queryset

    latest_payment = (
        Payment.objects
        .filter(application_id=OuterRef("pk"))
        .order_by("-updated_at", "-created_at")
    )
    latest_successful_payment = (
        Payment.objects
        .filter(application_id=OuterRef("pk"), status="successful")
        .annotate(summary_paid_at=Coalesce("verified_at", "updated_at", "created_at"))
        .order_by("-summary_paid_at")
    )

    return queryset.annotate(
        payment_summary_method=Subquery(
            latest_payment.values("payment_method")[:1],
            output_field=CharField(),
        ),
        payment_summary_reference=Subquery(
            latest_payment.values("transaction_reference")[:1],
            output_field=CharField(),
        ),
        payment_summary_receipt_number=Subquery(
            latest_successful_payment.values("receipt_number")[:1],
            output_field=CharField(),
        ),
        payment_summary_paid_amount=Subquery(
            latest_successful_payment.values("amount")[:1],
            output_field=DecimalField(max_digits=10, decimal_places=2),
        ),
        payment_summary_paid_at=Subquery(
            latest_successful_payment.values("summary_paid_at")[:1],
            output_field=DateTimeField(),
        ),
    )


# ---------------------------------------------------------------------------
# Identifier generation
# ---------------------------------------------------------------------------


def _resolve_institution_code(institution_name: str) -> str:
    """Resolve institution name to its short code (e.g., MIHAS, KATC)."""
    from apps.catalog.models import Institution
    inst = Institution.objects.filter(name__iexact=institution_name, is_active=True).first()
    if inst:
        return inst.code.upper()
    inst = Institution.objects.filter(name__icontains=institution_name, is_active=True).first()
    if inst:
        return inst.code.upper()
    return 'MIHAS'  # Default fallback


def _generate_application_number(institution_name: str = '') -> str:
    """Generate application number: {CODE}{YEAR}{SEQUENCE}.

    Format: MIHAS202500001, KATC202500002, etc.

    Uses a per-(institution_code, year) Postgres sequence via the SQL helper
    function ``next_application_number(p_code, p_year)`` defined in
    ``backend/scripts/application_number_sequences.sql``. Sequences are
    atomic - the previous count+attempt loop with random-hex fallback is
    eliminated.

    Falls back to the legacy count+attempt path only if the SQL function is
    not available (for example in unit tests against SQLite where the helper
    function does not exist). The fallback preserves the public API.
    """
    code = _resolve_institution_code(institution_name)
    year = timezone.now().year
    prefix = f"{code}{year}"

    # Preferred path: per-sequence atomic generation.
    try:
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT next_application_number(%s, %s)", [code, year]
            )
            result = cursor.fetchone()
            if result and result[0]:
                return result[0]
    except Exception:
        # If the SQL function is missing (older schema, SQLite tests, etc.)
        # fall through to the legacy implementation. The legacy path is racy
        # under burst load but preserves the format in steady state.
        logger.warning(
            "next_application_number SQL helper unavailable, "
            "falling back to count+attempt for code=%s year=%s",
            code,
            year,
        )

    # Legacy fallback (kept for back-compat and SQLite test environments).
    for attempt in range(5):
        count = Application.objects.filter(
            application_number__startswith=prefix
        ).count()
        seq = str(count + 1 + attempt).zfill(5)
        candidate = f"{prefix}{seq}"
        if not Application.objects.filter(application_number=candidate).exists():
            return candidate

    # Ultimate fallback: append random hex
    return f"{prefix}{uuid.uuid4().hex[:5].upper()}"


def _generate_tracking_code(institution_name: str = '') -> str:
    """Generate tracking code: TRK-{CODE}{YEAR}{RANDOM}."""
    code = _resolve_institution_code(institution_name)
    year = timezone.now().year
    random_part = uuid.uuid4().hex[:6].upper()
    return f"TRK-{code}{year}{random_part}"


# ---------------------------------------------------------------------------
# Document task helper
# ---------------------------------------------------------------------------


def _enqueue_document_task(application, task_type, task_func, request):
    """Shared helper for document generation endpoints.

    Handles idempotency check, Celery task dispatch, audit logging,
    and response construction. Used by AcceptanceLetterView and
    FinanceReceiptView to eliminate duplicated logic.
    """
    from datetime import timedelta

    from apps.common.audit_network import build_audit_network_fields
    from apps.common.models import AuditLog, IdempotencyKey

    application_id = str(application.id)

    # Idempotency check - 1-hour TTL (server-generated key for task dedup)
    idem_key = f"{task_type}:{application_id}"
    actor_id = request.user.id
    method = "POST"
    path = f"/api/v1/applications/{application_id}/{task_type}/"
    ttl_threshold = timezone.now() - timedelta(hours=1)

    existing = IdempotencyKey.objects.filter(
        idempotency_key=idem_key, actor_id=actor_id, method=method, path=path,
        created_at__gt=ttl_threshold,
    ).first()
    if existing and existing.response_body:
        return Response(
            {"success": True, "data": existing.response_body},
            status=status.HTTP_202_ACCEPTED,
        )

    # Dispatch Celery task
    if task_func is None:
        logger.warning("%s task handler not yet available", task_type)
        return Response(
            {
                "success": False,
                "error": "Task handler not available",
                "code": "SERVICE_UNAVAILABLE",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    task = task_func.delay(application_id)

    response_data = {
        "task_id": task.id,
        "application_id": application_id,
        "status": "queued",
    }

    # Store idempotency key
    IdempotencyKey.objects.create(
        idempotency_key=idem_key,
        actor_id=actor_id,
        method=method,
        path=path,
        request_hash=hashlib.sha256(b"").hexdigest(),
        status=IdempotencyKey.COMPLETED,
        response_status=202,
        response_body=response_data,
        completed_at=timezone.now(),
    )

    # Audit log
    network_fields = build_audit_network_fields(request)
    action_name = f"generate_{task_type.replace('-', '_')}"

    AuditLog.objects.create(
        actor_id=str(request.user.id),
        action=action_name,
        entity_type="applications",
        entity_id=application.id,
        changes={"task_id": task.id, "status": "queued"},
        ip_address=network_fields["ip_address"],
        user_agent=network_fields["user_agent"],
        ip_address_encrypted=network_fields["ip_address_encrypted"],
        user_agent_encrypted=network_fields["user_agent_encrypted"],
        retention_category="standard",
    )

    return Response(
        {"success": True, "data": response_data},
        status=status.HTTP_202_ACCEPTED,
    )


# ---------------------------------------------------------------------------
# Shared serializers used across multiple view files
# ---------------------------------------------------------------------------


class ApplicationGradeReadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject_id = serializers.UUIDField()
    grade = serializers.IntegerField()
    created_at = serializers.DateTimeField(required=False, allow_null=True)


class ApplicationGradeMutationSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    subject_id = serializers.UUIDField(required=False)
    grade = serializers.IntegerField(required=False)
    grades = ApplicationGradeReadSerializer(many=True, required=False)


class ApplicationGradeRequestSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False)
    grade = serializers.IntegerField(required=False)
    grades = ApplicationGradeSerializer(many=True, required=False)


class ApplicationStatusHistorySerializer(serializers.Serializer):
    old_status = serializers.CharField()
    new_status = serializers.CharField()
    notes = serializers.CharField()
    created_at = serializers.DateTimeField()


class ApplicationSummarySerializer(serializers.Serializer):
    application = ApplicationSerializer()
    documents_count = serializers.IntegerField()
    grades_count = serializers.IntegerField()
    status_history = ApplicationStatusHistorySerializer(many=True)
    grades_summary = serializers.CharField(required=False, allow_blank=True)
    grades = serializers.JSONField(required=False)
    ai_summary = serializers.JSONField(allow_null=True, required=False)


class ApplicationDraftWriteSerializer(serializers.Serializer):
    application_id = serializers.UUIDField(required=False, allow_null=True)
    draft_data = serializers.JSONField(required=False, default=dict)


class ApplicationInterviewWriteSerializer(serializers.Serializer):
    scheduled_at = serializers.DateTimeField(required=False)
    mode = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ApplicationAsyncTaskSerializer(serializers.Serializer):
    task_id = serializers.CharField()
    application_id = serializers.UUIDField()
    status = serializers.CharField()


class WithdrawalReasonSerializer(serializers.Serializer):
    withdrawal_reason = serializers.CharField(required=True)


class ApplicationConditionSerializer(serializers.Serializer):
    """Read serializer for ApplicationCondition."""
    id = serializers.UUIDField()
    application_id = serializers.UUIDField()
    description = serializers.CharField()
    condition_type = serializers.CharField()
    deadline = serializers.DateField()
    status = serializers.CharField()
    met_at = serializers.DateTimeField(allow_null=True)
    verified_by = serializers.UUIDField(allow_null=True, source="verified_by_id")
    notes = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class ConditionVerifyRequestSerializer(serializers.Serializer):
    """Request body for verifying a condition."""
    status = serializers.ChoiceField(choices=["met", "waived"])


class DocumentVerifySerializer(serializers.Serializer):
    """Validates document verification requests."""
    documentId = serializers.UUIDField()
    documentType = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=["verified", "rejected"])
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class EmailSlipSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EmailSlipQueuedSerializer(serializers.Serializer):
    queued_id = serializers.UUIDField()


# ---------------------------------------------------------------------------
# Envelope response serializers (used by OpenAPI schema decorators)
# ---------------------------------------------------------------------------

ApplicationListResponseSerializer = envelope_serializer(
    "ApplicationListResponse",
    paginated_serializer("ApplicationListPage", ApplicationListSerializer),
)
ApplicationResponseSerializer = envelope_serializer(
    "ApplicationResponse",
    ApplicationSerializer(),
)
ApplicationDocumentsResponseSerializer = envelope_serializer(
    "ApplicationDocumentsResponse",
    DocumentSerializer(many=True),
)
ApplicationGradesResponseSerializer = envelope_serializer(
    "ApplicationGradesResponse",
    ApplicationGradeReadSerializer(many=True),
)
ApplicationGradeMutationResponseSerializer = envelope_serializer(
    "ApplicationGradeMutationResponse",
    ApplicationGradeMutationSerializer(),
)
ApplicationDocumentMutationResponseSerializer = envelope_serializer(
    "ApplicationDocumentMutationResponse",
    DocumentSerializer(),
)
ApplicationAsyncTaskResponseSerializer = envelope_serializer(
    "ApplicationAsyncTaskResponse",
    ApplicationAsyncTaskSerializer(),
)
ApplicationSummaryResponseSerializer = envelope_serializer(
    "ApplicationSummaryResponse",
    ApplicationSummarySerializer(),
)
ApplicationReviewResponseSerializer = envelope_serializer(
    "ApplicationReviewResponse",
    StatusTransitionSerializer(),
)
ApplicationTrackingResponseSerializer = envelope_serializer(
    "ApplicationTrackingResponse",
    ApplicationTrackingSerializer(),
)
ApplicationBulkStatusResponseSerializer = envelope_serializer(
    "ApplicationBulkStatusResponse",
    UpdatedCountSerializer(),
)
ApplicationDraftResponseSerializer = envelope_serializer(
    "ApplicationDraftResponse",
    ApplicationDraftSerializer(),
)
ApplicationInterviewListResponseSerializer = envelope_serializer(
    "ApplicationInterviewListResponse",
    ApplicationInterviewSerializer(many=True),
)
ApplicationInterviewResponseSerializer = envelope_serializer(
    "ApplicationInterviewResponse",
    ApplicationInterviewSerializer(),
)
ApplicationMessageResponseSerializer = envelope_serializer(
    "ApplicationMessageResponse",
    MessageSerializer(),
)
WithdrawalResponseSerializer = envelope_serializer(
    "WithdrawalResponse",
    ApplicationSerializer(),
)
EmailSlipEnvelopeResponseSerializer = envelope_serializer(
    "EmailSlipEnvelopeResponse",
    EmailSlipQueuedSerializer(),
)

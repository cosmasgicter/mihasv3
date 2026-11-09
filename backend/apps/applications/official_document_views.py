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

admissions-v2 task 10.4 (R13.11, R13.2, STU-18) changed two things here, and
both are corrections rather than features:

**"Queued" now means a committed durable record exists** (design §17). The POST
path commits an :mod:`~apps.applications.official_document_jobs` row **before**
answering 202, dispatches after commit, and answers
``503 GENERATION_UNAVAILABLE`` when the record cannot be committed. Pre-10.4 this
module swallowed every dispatch failure and reported ``queued`` anyway, so with
the broker down a student polled work nothing had recorded; and the GET path
reported ``queued`` for a document that had never been requested at all. A
generation status is now derived from the job, and the absence of a job is
published as ``not_requested`` rather than as a queue.

**Issuance eligibility and read-existing eligibility are different policies**
(design §11.3). The per-type status/payment gate decides whether a *new*
artifact may be created. It no longer decides whether an artifact the platform
*already issued* can be read: a terminal application (withdrawn, rejected,
expired — and ``enrolled``, which is terminal too) previously lost access to its
own slip and offer letter, because the same gate answered both questions.

The success envelope (R5.1, R5.9) is::

    {"success": true, "data": {
        "document_id": "…|null", "document_type": "application_slip",
        "status": "ready|queued|failed|setup_required|not_requested",
        "download_url": "…optional…", "generated_at": "…|null",
        "template_version": 3|null, "institution_id": "…|null",
        "historical": false, "can_retry": false,
        "job": {"state": "…", "attempts": 0, "terminal": false, …}}}
"""

from __future__ import annotations

import json
import logging
from typing import Any

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
from apps.applications import official_document_jobs as jobs
from apps.common.metrics import emit_metric
from apps.applications.models import Application
from apps.applications.tasks.pdf.render_context import (
    DOCUMENT_PROFILE_NOT_CONFIGURED,
    PROFILE_REQUIRED_DOCUMENT_TYPES,
    has_active_document_profile,
)
from apps.applications.tasks.pdf_generation import (
    DOCUMENT_CONFIG as _RENDERER_DOCUMENT_CONFIG,
    _current_official_version,
    official_document_matches_current_inputs,
)
from apps.catalog.services import AccessScopeService
from apps.common.openapi_helpers import ErrorResponseSerializer, envelope_serializer
from apps.common.models import AuditLog
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Published generation statuses
# ---------------------------------------------------------------------------

#: A current, downloadable artifact exists.
STATUS_READY = "ready"
#: Committed work is outstanding. True **only** while a job row is open.
STATUS_QUEUED = "queued"
#: Terminal render failure the requester may retry.
STATUS_FAILED = "failed"
#: Terminal failure that needs tenant document configuration first.
STATUS_SETUP_REQUIRED = "setup_required"
#: Nothing has been requested. Pre-10.4 this was reported as ``queued`` — a
#: phantom queue with nobody working it and no poll that could ever end
#: (R13.11, STU-18).
STATUS_NOT_REQUESTED = "not_requested"

GENERATION_STATUSES: tuple[str, ...] = (
    STATUS_READY,
    STATUS_QUEUED,
    STATUS_FAILED,
    STATUS_SETUP_REQUIRED,
    STATUS_NOT_REQUESTED,
)


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

#: Human labels for the five official document types, read from the renderer's own
#: ``DOCUMENT_CONFIG`` so the email subject and the PDF title cannot drift apart.
_DOCUMENT_LABELS: dict[str, str] = {
    document_type: config.get("name", document_type)
    for document_type, config in _RENDERER_DOCUMENT_CONFIG.items()
}

_SETUP_REQUIRED_FAILURE_CODES = {
    "DOCUMENT_PROFILE_NOT_CONFIGURED",
    "DOCUMENT_TEMPLATE_NOT_CONFIGURED",
    "DOCUMENT_ASSET_NOT_CONFIGURED",
    "TENANT_DOCUMENT_PROFILE_NOT_CONFIGURED",
    "TENANT_DOCUMENT_TEMPLATE_NOT_CONFIGURED",
    "TENANT_ASSET_NOT_CONFIGURED",
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
    preauthorized = getattr(request, "_authorized_official_document_application", None)
    if preauthorized is not None and str(getattr(preauthorized, "id", "")) == str(application_id):
        return preauthorized, None

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
    """Whether the student may **issue** this document type (R5.2–R5.5).

    Mirrors the single source of truth in the Property 18 test:
      application_slip   → a non-draft submitted status   (R5.2)
      acceptance_letter  → ``approved``                    (R5.3)
      conditional_offer  → ``conditionally_approved``      (R5.4)
      payment_receipt    → a completed payment exists      (R5.5)

    This is the **issuance** policy, and since task 10.4 it is only that. It
    answers "may a new artifact be created from today's application state?" —
    which is exactly why a terminal application fails it, and exactly why it must
    not also decide whether an artifact already issued can be read
    (:func:`_may_read_issued`, design §11.3).
    """
    app_status = getattr(application, "status", None)
    if document_type == "application_slip":
        return app_status in _NON_DRAFT_SUBMITTED_STATUSES
    if document_type == "acceptance_letter":
        return app_status == "approved"
    if document_type == "conditional_offer":
        return app_status == "conditionally_approved"
    if document_type == "payment_receipt":
        return _has_completed_payment(application)
    if document_type == "finance_receipt":
        return False
    return False


def _may_read_issued(document_type: str, application, document) -> bool:
    """Whether an **already issued** artifact stays readable (R13.11, design §11.3).

    > "A terminal application may not create a new artifact, but the owner can
    > continue to read a previously issued lawful document according to
    > retention policy."

    The policy is deliberately narrow, and every clause is load-bearing:

    * **a stored artifact must exist.** This never conjures a document, and it
      never widens which *types* exist — an application that was never approved
      has no acceptance letter to read, because none was ever issued;
    * **it must be a platform-issued official document.** ``document`` comes from
      ``_current_official_version``, which selects ``system_generated``,
      non-deleted rows only — so a student upload of the same type is not
      reachable through this path;
    * **retention is the deletion state.** The platform's retention decision for
      an official document is recorded by deleting/soft-deleting the row (task
      7.5's deletion lifecycle), which ``_current_official_version`` already
      honours. A retained row is a lawful read; a retired one is simply absent.

    Two facts about the pre-10.4 behaviour are worth keeping written down,
    because they are the finding:

    * ``enrolled`` is a **terminal** status. A student who accepted their place —
      the successful outcome — lost the ability to re-read the offer letter that
      got them there;
    * even without a terminal status, application ``status`` and ``updated_at``
      are ``Document_Fingerprint`` inputs, so *any* later change made the stored
      artifact "not current". With the issue gate closed there was nothing to
      regenerate it with, so the read reported ``queued`` forever.
    """
    return document is not None


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


# Returned by ``_signed_download_url`` when the document exists but the signer
# failed, so the envelope can say so (``DOCUMENT_LINK_UNAVAILABLE``) instead of
# omitting the URL and reading as "not ready" (R5-d).
_SIGNING_FAILED = object()

DOCUMENT_LINK_UNAVAILABLE = "DOCUMENT_LINK_UNAVAILABLE"


def _signed_download_url(document):
    """Return a time-limited signed download URL for a document's stored file.

    The persisted ``file_url`` / ``storage_key`` is an object key (older rows
    may hold a URL) and the bucket is private (``AWS_DEFAULT_ACL = None``), so the
    raw value is never a usable link. Resolve the key and presign it at read time
    (default 15-minute expiry), as ``DocumentDownloadView`` does.

    Returns ``None`` when the document has no file, and the ``_SIGNING_FAILED``
    sentinel when signing raised: that is logged at ERROR (ids only) so an
    operator sees it, and the caller publishes ``DOCUMENT_LINK_UNAVAILABLE``.
    """
    if document is None or not (
        getattr(document, "file_url", None) or getattr(document, "storage_key", None)
    ):
        return None
    try:
        from apps.common.storage import resolve_document_open_url
        return resolve_document_open_url(document)
    except Exception:  # signing must never 500 the status read
        logger.error(
            "official_document.sign_failed",
            extra={
                "document_id": str(getattr(document, "id", "") or ""),
                "document_type": str(getattr(document, "document_type", "") or ""),
            },
            exc_info=True,
        )
        return _SIGNING_FAILED


def _build_envelope(
    application,
    document_type: str,
    *,
    document=None,
    status_value: str,
    task_id=None,
    error_code: str | None = None,
    job=None,
    historical: bool = False,
    is_staff: bool = False,
) -> dict:
    """Build the official-document data envelope (R5.1, R5.9, R13.11).

    ``job`` is the committed durable record (or ``None``). It is published so the
    client can tell *nothing was requested* from *work is outstanding* from *the
    work finished badly* — three states the pre-10.4 envelope collapsed into one
    ``queued``. ``historical`` marks an artifact served under the read-existing
    policy: it is the document the platform issued, not a claim that it reflects
    today's application state.
    """
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
        "historical": bool(historical),
        "job": job.to_payload(is_staff=is_staff) if job is not None else dict(jobs.NO_JOB_PAYLOAD),
    }
    data["can_retry"] = bool(data["job"].get("can_retry"))

    if document is not None:
        metadata = _official_document_metadata(document)
        data["template_version"] = metadata.get("template_version")
        # ``download_url`` must be a **signed** URL — the bucket is private, so
        # the raw stored ``file_url`` 403s in the browser. Sign on read; omit
        # the field when the document carries no file or signing is unavailable.
        signed_url = _signed_download_url(document)
        if signed_url is _SIGNING_FAILED:
            # The document exists; the link could not be made. Keep ``ready`` and
            # say why, so the client shows "can't be opened right now" with Retry
            # rather than "not ready" (R5-d, clause 2.24).
            error_code = error_code or DOCUMENT_LINK_UNAVAILABLE
        elif signed_url:
            data["download_url"] = signed_url

    if task_id is not None:
        data["task_id"] = task_id

    if error_code:
        data["error_code"] = error_code
        if error_code in _SETUP_REQUIRED_FAILURE_CODES:
            data["setup_required"] = True

    return data


def _is_staff_requester(user) -> bool:
    """Whether this requester is a school operator rather than the applicant.

    Used only to decide whether a **tenant setup** failure is offered as a retry
    (:meth:`OfficialDocumentJob.can_retry`). Scope itself is decided by
    ``AccessScopeService`` in :func:`_get_authorized_application` — this reads the
    profile's role solely to pick the copy and the affordance, never to grant
    access to anything.
    """
    return is_super_admin(user) or getattr(user, "role", "student") in ("admin", "reviewer")


def _generation_status(
    application,
    document_type: str,
    *,
    may_issue: bool,
    is_staff: bool,
    job=None,
) -> dict:
    """The one place a generation status is derived (R13.11).

    Precedence, and the reason for each step:

    1. **a current artifact** — the request is already satisfied;
    2. **an open job** — committed, unfinished work: the only honest ``queued``;
    3. **a terminal failure** — from the job, or (for a render that predates this
       task, or one dispatched outside a job) from the renderer's own audit row;
    1b. **a previously issued artifact, for a student** — the read-existing
       policy (:func:`_may_read_issued`) comes before the job and failure steps
       for the applicant (R5-e), so a status change never hides the slip they
       hold;
    4. **a previously issued artifact, when issuance is refused** — the
       read-existing policy for staff (§:func:`_may_read_issued`);
    5. **nothing** — ``not_requested``. Not a queue.

    Step 4 sits *below* the failure step on purpose: if the platform tried and
    failed to refresh a document, the requester should be told that, not handed a
    silently older file as though nothing had happened.
    """
    current = _current_official_version(ApplicationDocument, application, document_type)
    if current is not None and official_document_matches_current_inputs(
        application, document_type, current
    ):
        return _build_envelope(
            application,
            document_type,
            document=current,
            status_value=STATUS_READY,
            job=job,
            is_staff=is_staff,
        )

    # A student keeps reading the copy the platform issued even after the
    # application moved on (R5-e, clause 2.26): the slip prints the status, so any
    # later change retires its fingerprint, and the document in hand is still the
    # lawful one. Staff keep the precedence below, so an operator is still told
    # that a refresh failed or is queued (D-A13).
    if not is_staff and current is not None and _may_read_issued(document_type, application, current):
        emit_metric("official_document.student_served_historical", document_type=document_type)
        return _build_envelope(
            application,
            document_type,
            document=current,
            status_value=STATUS_READY,
            job=job,
            historical=True,
            is_staff=is_staff,
        )

    if job is not None and job.is_open:
        return _build_envelope(
            application,
            document_type,
            document=None,
            status_value=STATUS_QUEUED,
            job=job,
            is_staff=is_staff,
        )

    error_code = job.error_code if (job is not None and job.is_failed) else None
    if error_code is None:
        failure = _latest_render_failure(
            application, document_type, current_document=current
        )
        if failure is not None:
            _, error_code = failure
            error_code = error_code or jobs.RENDER_FAILED
    if error_code is not None:
        status_value = (
            STATUS_SETUP_REQUIRED
            if error_code in _SETUP_REQUIRED_FAILURE_CODES
            else STATUS_FAILED
        )
        return _build_envelope(
            application,
            document_type,
            document=None,
            status_value=status_value,
            error_code=error_code,
            job=job,
            is_staff=is_staff,
        )

    if not may_issue and _may_read_issued(document_type, application, current):
        return _build_envelope(
            application,
            document_type,
            document=current,
            status_value=STATUS_READY,
            job=job,
            historical=True,
            is_staff=is_staff,
        )

    # SJR R7-d (D9 confirmed 2026-11-08, option C): a profile-required letter the
    # school has not set up is not "not requested" - that offered the student a
    # Prepare action that can only fail. Ask the renderer's own resolution, and only
    # for a letter the application is in a state to receive, so the list does not
    # report a missing letter for every application of a tenant with no profile.
    if (
        document_type in PROFILE_REQUIRED_DOCUMENT_TYPES
        and _student_gate_open(document_type, application)
        and not has_active_document_profile(application, document_type)
    ):
        emit_metric("official_document.setup_required_read", document_type=document_type)
        return _build_envelope(
            application,
            document_type,
            document=None,
            status_value=STATUS_SETUP_REQUIRED,
            error_code=DOCUMENT_PROFILE_NOT_CONFIGURED,
            job=job,
            is_staff=is_staff,
        )
    return _build_envelope(
        application,
        document_type,
        document=None,
        status_value=STATUS_NOT_REQUESTED,
        job=job,
        is_staff=is_staff,
    )


def _latest_render_failure(application, document_type: str, *, current_document=None) -> tuple[str, str | None] | None:
    """Return the latest backend render-failure status for this document type.

    The renderer records permanent failures as non-PII AuditLog rows keyed on
    the application id. When no current matching Official_Document exists, the
    status endpoint should surface that terminal failure instead of reporting
    ``queued`` forever. A stale current document can still exist; only a failure
    newer than that stored document is allowed to override the pending status.
    """
    failure = (
        AuditLog.objects.filter(
            action="official_document_render_failed",
            entity_id=getattr(application, "id", None),
            changes__document_type=document_type,
        )
        .order_by("-created_at")
        .first()
    )
    if failure is None:
        return None

    current_uploaded_at = getattr(current_document, "uploaded_at", None)
    if current_uploaded_at is not None and failure.created_at < current_uploaded_at:
        return None

    changes = failure.changes if isinstance(failure.changes, dict) else {}
    code = changes.get("error_code")
    code = code if isinstance(code, str) else None
    if code in _SETUP_REQUIRED_FAILURE_CODES:
        return "setup_required", code
    return "failed", code


def _audit_official_document_queued(request, application, document_type: str, task_id) -> None:
    """Record an official-document queued Audit_Event (R16.3). Never raises.

    Emitted on the POST path when no Current_Official_Version exists and a
    render is enqueued (or the brokerless derived-pending fallback fires), so
    the queued lifecycle stage is observable. Carries only the application +
    institution ids, the document type, and the opaque Celery ``task_id`` — no
    applicant PII, credentials, or document bytes (R16.4).
    """
    request_path = getattr(request, "path", "") or ""
    if getattr(request, "_suppress_official_document_queue_audit", False) or (
        "/official-documents/" not in request_path
    ):
        return
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
    """Hand an **already committed** job to the broker. Best-effort, by design.

    Since task 10.4 this is dispatch only: the durable record is committed first
    by :func:`_request_generation`, so a broker outage here costs a delay (the
    ``sweep_pending_official_document_jobs_task`` re-dispatches from the row)
    rather than a lost request. Returns the Celery ``task_id`` or ``None``.

    Pre-10.4 this function *was* the whole "queue": it swallowed dispatch
    failures and the caller answered ``202 queued`` regardless, so with no broker
    the platform reported queued work that no record anywhere asked for.
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
        logger.info(
            "Official-document dispatch failed for application %s (%s); the "
            "committed job stays pending for the sweep",
            getattr(application, "id", None),
            document_type,
            exc_info=True,
        )
        return None


def _request_generation(application, document_type: str, request=None):
    """Commit a durable generation job, then dispatch it (R13.11).

    Returns ``(job, task_id)``. Raises
    :class:`~apps.applications.official_document_jobs.GenerationUnavailable` when
    the record could not be committed — which the caller turns into
    ``503 GENERATION_UNAVAILABLE`` rather than a 202 for work nothing recorded.

    The dispatch runs through :func:`_enqueue_generation` on this module so the
    "no task is dispatched for a refused request" assertions keep patching one
    symbol, and so a dispatch failure is visibly separate from a commit failure.
    """
    actor_id = getattr(getattr(request, "user", None), "id", None)
    job = jobs.request_generation(
        application, document_type, actor_id=actor_id, dispatch=False
    )
    if job.state != jobs.JOB_PENDING:
        # ``dispatched`` — a worker already holds this job, so a second request
        # must not queue the render twice; ``succeeded``/``failed`` — a worker
        # settled it between the commit and here, which the job's idempotency
        # makes a legitimate race rather than an error.
        return job, job.task_id
    task_id = _enqueue_generation(application, document_type)
    if task_id is not None:
        jobs.mark_dispatched(job.id, task_id)
    return job, task_id


# ---------------------------------------------------------------------------
# Serializers (OpenAPI only)
# ---------------------------------------------------------------------------


class OfficialDocumentJobSerializer(serializers.Serializer):
    """The committed durable job, as published (R13.11)."""

    state = serializers.ChoiceField(choices=list(jobs.JOB_STATES) + [jobs.JOB_STATE_NONE])
    attempts = serializers.IntegerField()
    requested_at = serializers.CharField(allow_null=True)
    settled_at = serializers.CharField(allow_null=True)
    error_code = serializers.CharField(allow_null=True)
    terminal = serializers.BooleanField()
    can_retry = serializers.BooleanField()


class OfficialDocumentStatusSerializer(serializers.Serializer):
    document_id = serializers.CharField(allow_null=True)
    document_type = serializers.CharField()
    status = serializers.ChoiceField(choices=list(GENERATION_STATUSES))
    download_url = serializers.CharField(required=False)
    generated_at = serializers.CharField(allow_null=True)
    template_version = serializers.IntegerField(allow_null=True)
    institution_id = serializers.CharField(allow_null=True)
    historical = serializers.BooleanField()
    can_retry = serializers.BooleanField()
    job = OfficialDocumentJobSerializer()
    task_id = serializers.CharField(required=False)
    error_code = serializers.CharField(required=False)
    setup_required = serializers.BooleanField(required=False)


class OfficialDocumentEmailRequestSerializer(serializers.Serializer):
    """Optional recipient override for the official-document email (R13.5)."""

    email = serializers.EmailField(required=False, allow_blank=True)


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

    def _authorize_and_gate(self, request, application_id, document_type, *, for_issue: bool):
        """Shared authorize + gate. Returns ``(application, may_issue, error)``.

        ``error`` is the masked 404 when the requester is not authorized or — for
        a student — no policy admits the request. ``may_issue`` reports which
        policy admitted it, so the read can tell a *current* artifact from one it
        is serving historically.

        Two policies, which task 10.4 separated (design §11.3, R13.11):

        * **issuance** (``for_issue=True``, i.e. POST) — :func:`_student_gate_open`,
          byte-for-byte the pre-10.4 gate. A terminal application still cannot mint
          a new artifact, and a masked 404 is still the refusal;
        * **read-existing** (``for_issue=False``, i.e. GET) — when issuance is
          refused but the platform already issued a lawful artifact, the owner (and
          in-scope staff) may still read it. Nothing else is relaxed: an artifact
          that was never issued is still the same masked 404.
        """
        if document_type not in _DOCUMENT_TASK_NAMES:
            # Unknown document type: mask as not-found, never a distinct error
            # that could leak the application's existence.
            return None, False, _not_found_response()

        application, error_response = _get_authorized_application(request, self, application_id)
        if error_response is not None:
            return None, False, error_response

        # Staff/super-admin are gated by scope only (R5.6, R5.7).
        if _is_staff_requester(request.user):
            return application, True, None

        if _student_gate_open(document_type, application):
            return application, True, None

        if for_issue:
            return None, False, _not_found_response()

        current = _current_official_version(ApplicationDocument, application, document_type)
        if _may_read_issued(document_type, application, current):
            return application, False, None

        return None, False, _not_found_response()

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
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id, document_type):
        application, _may_issue, error_response = self._authorize_and_gate(
            request, application_id, document_type, for_issue=True
        )
        if error_response is not None:
            return error_response

        is_staff = _is_staff_requester(request.user)

        # Reuse Current_Official_Version only when its stored fingerprint still
        # matches today's application/tenant/template/asset inputs. Otherwise
        # enqueue regeneration so stale branding/content is never served.
        current = _current_official_version(ApplicationDocument, application, document_type)
        if current is not None and official_document_matches_current_inputs(
            application, document_type, current
        ):
            return Response(
                {
                    "success": True,
                    "data": _build_envelope(
                        application,
                        document_type,
                        document=current,
                        status_value=STATUS_READY,
                        job=jobs.read_job(application.id, document_type),
                        is_staff=is_staff,
                    ),
                },
                status=status.HTTP_200_OK,
            )

        # Not yet generated (or stale): commit the durable job **first**, then
        # dispatch. A 202 is only ever answered on the far side of that commit
        # (R13.11, design §11.3); a commit failure is a 503 that says plainly
        # that nothing was queued.
        #
        # This is also the retry command: ``request_generation`` returns a failed
        # job to ``pending`` with its attempt history intact, so "retry" is the
        # same request rather than a second endpoint with its own authority.
        try:
            job, task_id = _request_generation(application, document_type, request)
        except jobs.GenerationUnavailable as exc:
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    "retryable": True,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        _audit_official_document_queued(request, application, document_type, task_id)
        return Response(
            {
                "success": True,
                "data": _build_envelope(
                    application,
                    document_type,
                    document=None,
                    status_value=STATUS_QUEUED,
                    task_id=task_id,
                    job=job,
                    is_staff=is_staff,
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
        application, may_issue, error_response = self._authorize_and_gate(
            request, application_id, document_type, for_issue=False
        )
        if error_response is not None:
            return error_response

        data = _generation_status(
            application,
            document_type,
            may_issue=may_issue,
            is_staff=_is_staff_requester(request.user),
            job=jobs.read_job(application.id, document_type),
        )
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

        is_staff = _is_staff_requester(request.user)
        # One query for every document type's job (task 10.4): the list must not
        # cost one lookup per entry in the catalogue.
        job_map = jobs.read_jobs(application.id, _DOCUMENT_TASK_NAMES)

        results = []
        for document_type in _DOCUMENT_TASK_NAMES:
            may_issue = is_staff or _student_gate_open(document_type, application)
            entry = _generation_status(
                application,
                document_type,
                may_issue=may_issue,
                is_staff=is_staff,
                job=job_map.get(document_type),
            )
            # The list stays a list of things there is something to say about: a
            # type with no artifact, no committed job and no failure has nothing
            # to report, and publishing a row of ``not_requested`` for every
            # unavailable type would tell a student their application has five
            # missing documents.
            if entry["status"] == STATUS_NOT_REQUESTED:
                continue
            results.append(entry)

        return Response({"success": True, "data": results}, status=status.HTTP_200_OK)


class OfficialDocumentEmailView(APIView):
    """POST /api/v1/applications/{id}/official-documents/{document_type}/email/

    The one official-document email, for **every** document type (R13.5, STU-18).

    Three things make it canonical rather than a second copy of ``EmailSlipView``:

    * **the same eligibility the read uses.** It reuses
      :meth:`OfficialDocumentDetailView._authorize_and_gate` with
      ``for_issue=False``, so a document the platform already issued can be
      emailed even once the application is terminal — the read-existing policy
      applies to *reading a document out to yourself*, which is what an email is.
      A document that is not ready is refused with a stable code and nothing is
      sent, rather than an email arriving that points at a document that is not
      there;
    * **it goes through the one delivery gate.** Task 10.1's
      :func:`~apps.common.notification_preferences.deliver_message` writes the
      inbox record, decides the email channel, and attaches the delivery record —
      so the communications history shows this message's class and channel state
      instead of reporting ``unknown``. ``EmailSlipView`` called
      ``queue_email`` directly and therefore appeared in no history at all;
    * **the body is the platform's.** ``render_message("official_document", …)``,
      not an inline HTML table built in a view.

    The recipient is the **application owner's** account address. A caller may
    pass ``email`` to be explicit, but a value that is not the owner's is refused
    (``RECIPIENT_NOT_PERMITTED``): pre-10.4 any in-scope staff member could have a
    student's official document mailed to an address of their choosing, and an
    official record is exactly the thing that should not be redirectable.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OfficialDocumentEmailRequestSerializer

    @extend_schema(
        operation_id="applications_official_document_email",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("document_type", OpenApiTypes.STR, OpenApiParameter.PATH),
        ],
        request=OfficialDocumentEmailRequestSerializer,
        responses={
            200: OpenApiResponse(response=OfficialDocumentResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id, document_type):
        application, may_issue, error_response = OfficialDocumentDetailView._authorize_and_gate(
            self, request, application_id, document_type, for_issue=False
        )
        if error_response is not None:
            return error_response

        is_staff = _is_staff_requester(request.user)
        data = _generation_status(
            application,
            document_type,
            may_issue=may_issue,
            is_staff=is_staff,
            job=jobs.read_job(application.id, document_type),
        )
        if data["status"] != STATUS_READY:
            # Nothing is sent for a document that is not there. The caller gets
            # the same status payload the read publishes, so the UI can keep
            # polling / offer the retry rather than guess.
            return Response(
                {
                    "success": False,
                    "error": (
                        "This document is not ready to send yet. Nothing was "
                        "emailed."
                    ),
                    "code": "DOCUMENT_NOT_READY",
                    "data": data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = OfficialDocumentEmailRequestSerializer(data=request.data or {})
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

        owner_email, owner_id = _application_owner_contact(application)
        requested = (serializer.validated_data.get("email") or "").strip()
        if requested and owner_email and requested.lower() != owner_email.lower():
            return Response(
                {
                    "success": False,
                    "error": (
                        "An official document can only be sent to the applicant's "
                        "own account email address."
                    ),
                    "code": "RECIPIENT_NOT_PERMITTED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not owner_email:
            return Response(
                {
                    "success": False,
                    "error": (
                        "This application has no account email address to send to."
                    ),
                    "code": "NO_RECIPIENT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        delivered = _deliver_official_document_email(
            application,
            document_type,
            data,
            recipient_email=owner_email,
            recipient_user_id=owner_id,
        )

        _audit_official_document_emailed(request, application, document_type)

        payload = dict(data)
        payload["delivery"] = delivered
        return Response({"success": True, "data": payload}, status=status.HTTP_200_OK)


def _application_owner_contact(application) -> tuple[str | None, Any]:
    """The applicant's account email and user id — the only permitted recipient.

    Reads the ``Profile`` behind ``application.user_id`` rather than the
    application's own ``email`` snapshot: the account address is the one the
    student authenticates with and can change through settings, and a snapshot
    can be stale by exactly the amount of time that makes a misdelivery possible.
    Falls back to the application's stored address when no profile row resolves
    (a legacy row), because the alternative is refusing to send at all.
    """
    user_id = getattr(application, "user_id", None)
    try:
        from apps.accounts.models import Profile

        profile = Profile.objects.filter(id=user_id).only("id", "email").first()
        if profile is not None and getattr(profile, "email", None):
            return str(profile.email), profile.id
    except Exception:  # pragma: no cover - fall through to the snapshot
        logger.info(
            "Could not resolve the account email for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )
    snapshot = getattr(application, "email", None)
    return (str(snapshot) if snapshot else None), user_id


def _deliver_official_document_email(
    application,
    document_type: str,
    status_payload: dict,
    *,
    recipient_email: str,
    recipient_user_id,
) -> dict:
    """Send one official-document email through the one delivery gate (R13.4).

    Returns the published delivery record (category + per-channel state), so the
    caller answers with what actually happened rather than a bare ``queued_id``.
    Never raises: a delivery problem must not turn a successful read into a 500.
    """
    from apps.common.email.render import render_message
    from apps.common.notification_preferences import (
        CATEGORY_APPLICATION_UPDATES,
        deliver_message,
    )

    label = _DOCUMENT_LABELS.get(document_type, document_type.replace("_", " ").title())
    generated_at = status_payload.get("generated_at") or ""
    institution_name = getattr(
        getattr(application, "institution_ref", None), "name", None
    )

    subject = html = text = None
    try:
        subject, html, text = render_message(
            "official_document",
            {
                "student_name": getattr(application, "full_name", None),
                "document_label": label,
                "application_number": getattr(application, "application_number", None),
                "program_name": getattr(application, "program", None),
                "institution_name": institution_name,
                "issued_at": generated_at[:10] if generated_at else "—",
                "historical": bool(status_payload.get("historical")),
            },
        )
    except Exception:  # pragma: no cover - a render failure must not 500 the read
        logger.warning(
            "Could not render the official-document email for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )

    delivered = deliver_message(
        user_id=recipient_user_id,
        category=CATEGORY_APPLICATION_UPDATES,
        title=f"{label} available",
        message=(
            f"Your {label.lower()} is available to download from your application."
        ),
        email_subject=subject,
        email_body=html,
        recipient_email=recipient_email if subject and html else None,
        recipient_name=getattr(application, "full_name", None),
        action_url="/student/status",
        template_key="official_document",
        application_id=getattr(application, "id", None),
        institution_id=getattr(application, "institution_ref_id", None),
        # One send per issued artifact per recipient: a double-tapped "Email it
        # to me" converges instead of arriving twice. A **regenerated** document
        # is a different artifact and gets its own delivery.
        idempotency_key=(
            f"official_document_email:{status_payload.get('document_id')}"
            f":{recipient_user_id}"
        ),
    )
    return delivered.decision.as_payload()


def _audit_official_document_emailed(request, application, document_type: str) -> None:
    """Record the email as a tenant Audit_Event (R17.2). Never raises.

    Ids and the document type only — never the recipient address (which is the
    applicant's), the document body, or the rendered subject.
    """
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_official_document_emailed(
            application_id=getattr(application, "id", None),
            institution_id=getattr(application, "institution_ref_id", None),
            document_type=document_type,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block the email
        logger.info(
            "Unable to record official-document emailed audit for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )

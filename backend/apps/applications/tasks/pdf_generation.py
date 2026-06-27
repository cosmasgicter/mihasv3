"""Tenant-aware official PDF generation tasks."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import textwrap
import uuid
from typing import Any

from celery import shared_task
from django.core.exceptions import ValidationError
from django.utils import timezone

logger = logging.getLogger(__name__)


# Document types for which the payment id + receipt number participate in the
# Document_Fingerprint (R6.1 "payment/receipt identifiers for receipts"). Every
# other document type ignores the payment inputs entirely.
_RECEIPT_DOCUMENT_TYPES = {"payment_receipt", "finance_receipt"}


DOCUMENT_CONFIG = {
    "application_slip": {
        "title": "APPLICATION SLIP",
        "folder": "application-slips",
        "name": "Application Slip",
        "status_required": None,
    },
    "acceptance_letter": {
        "title": "ACCEPTANCE LETTER",
        "folder": "acceptance-letters",
        "name": "Acceptance Letter",
        "status_required": "approved",
    },
    "conditional_offer": {
        "title": "CONDITIONAL OFFER",
        "folder": "conditional-offers",
        "name": "Conditional Offer",
        "status_required": None,
    },
    "finance_receipt": {
        "title": "FINANCE RECEIPT",
        "folder": "finance-receipts",
        "name": "Finance Receipt",
        "status_required": None,
    },
    "payment_receipt": {
        "title": "PAYMENT RECEIPT",
        "folder": "payment-receipts",
        "name": "Payment Receipt",
        "status_required": None,
    },
}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_application_slip_task(self, application_id):
    return _generate_official_document_task(self, application_id, "application_slip")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_acceptance_letter_task(self, application_id):
    return _generate_official_document_task(self, application_id, "acceptance_letter")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_conditional_offer_task(self, application_id):
    return _generate_official_document_task(self, application_id, "conditional_offer")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_finance_receipt_task(self, application_id):
    return _generate_official_document_task(self, application_id, "finance_receipt")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_payment_receipt_task(self, application_id):
    return _generate_official_document_task(self, application_id, "payment_receipt")


def _generate_official_document_task(task, application_id, document_type: str):
    from apps.applications.models import Application
    from apps.applications.tasks.pdf.render_context import DocumentProfileNotConfigured
    from apps.documents.models import ApplicationDocument

    config = DOCUMENT_CONFIG[document_type]
    try:
        application = Application.objects.get(id=application_id)
    except Application.DoesNotExist:
        logger.error("Application %s not found", application_id)
        return

    if config["status_required"] and application.status != config["status_required"]:
        logger.warning("Skipped %s for application %s in status %s", document_type, application_id, application.status)
        return

    try:
        from apps.common.storage import MediaStorage

        payment = None
        if document_type in {"finance_receipt", "payment_receipt"}:
            payment = _latest_receipt_payment(application)
            if not payment:
                logger.warning(
                    "Skipped %s for application %s without successful payment",
                    document_type,
                    application_id,
                )
                return

        # R6.1: gather the render inputs once and derive the Document_Fingerprint
        # from them *before* rendering, so reuse/supersede is decided by inputs
        # rather than a wall-clock window.
        tenant, template, logo_asset, signature_asset = _gather_render_inputs(
            application, document_type, payment
        )
        fingerprint = _compute_document_fingerprint(
            application,
            document_type,
            tenant,
            template,
            logo_asset,
            signature_asset,
            payment,
        )

        # R6.2 / R6.7: the Current_Official_Version is the latest non-deleted
        # ``system_generated`` document for ``(application, document_type)`` by
        # ``uploaded_at`` desc. An unchanged fingerprint reuses it and creates
        # no new row.
        current = _current_official_version(ApplicationDocument, application, document_type)
        if current is not None and _stored_fingerprint(current) == fingerprint:
            logger.info(
                "%s reuse current version for application %s (fingerprint unchanged)",
                document_type,
                application_id,
            )
            return

        # R6.3 / R6.4: no current version or a changed fingerprint → render a new
        # Official_Document, store the fingerprint in
        # ``verification_notes.official_document``, and supersede by virtue of the
        # latest-non-deleted ordering. Prior documents are never mutated.
        pdf_buffer, metadata = _render_official_pdf(
            application,
            document_type,
            payment=payment,
            tenant=tenant,
            template=template,
            logo_asset=logo_asset,
            signature_asset=signature_asset,
        )
        metadata["fingerprint"] = fingerprint
        storage = MediaStorage()
        filename = f"{config['folder']}/{application_id}/{uuid.uuid4().hex}.pdf"
        stored_name = storage.save(filename, pdf_buffer)
        file_url = storage.url(stored_name)

        ApplicationDocument.objects.create(
            application=application,
            document_type=document_type,
            document_name=f"{config['name']} - {application.full_name}.pdf",
            file_url=file_url,
            file_size=pdf_buffer.getbuffer().nbytes,
            mime_type="application/pdf",
            system_generated=True,
            verification_status="verified",
            verification_notes=json.dumps({"official_document": metadata}),
            uploaded_at=timezone.now(),
        )
        logger.info("%s generated for application %s", document_type, application_id)
        _audit_document_generated(application, document_type, metadata)
    except DocumentProfileNotConfigured as exc:
        # R8.9: a profile-required document type (acceptance letter / conditional
        # offer) has no active Institution_Document_Profile. This is a tenant
        # *configuration* error, not a transient render failure: mark the
        # generation failed, record a non-PII audit row, produce NO document
        # from frontend/default content, and DO NOT retry (a missing profile
        # will not resolve itself on a retry — fail fast rather than burn all
        # three attempts).
        logger.warning(
            "%s generation failed for application %s: no document profile configured",
            document_type,
            application_id,
        )
        _audit_profile_not_configured(application, document_type, exc)
        return
    except Exception as exc:
        logger.warning(
            "%s generation failed for application %s (attempt %d/%d): %s",
            document_type,
            application_id,
            task.request.retries + 1,
            task.max_retries + 1,
            str(exc),
        )
        if task.request.retries >= task.max_retries:
            logger.error("%s generation permanently failed for application %s", document_type, application_id)
            # R6.8: a permanently failed Official_Document render is recorded in
            # an auditable form so operators can recover (re-trigger generation)
            # instead of the failure vanishing into worker logs. Best-effort:
            # auditing never masks or replaces the underlying failure.
            _audit_render_failure(application, document_type, exc, attempts=task.request.retries + 1)
            return
        raise task.retry(exc=exc, countdown=60 * (2 ** task.request.retries))


def _audit_document_generated(application, document_type: str, metadata: dict) -> None:
    """Record a successful official-document generation as an Audit_Event (R13.1).

    Routes through :class:`TenantAuditService` so the success counterpart of
    ``official_document_render_failed`` is observable alongside tenant config
    changes and routing failures. Best-effort: never blocks the task.
    """
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_official_document_generated(
            application_id=getattr(application, "id", None),
            institution_id=getattr(application, "institution_ref_id", None),
            document_type=document_type,
            template_id=metadata.get("template_id"),
            template_version=metadata.get("template_version"),
        )
    except Exception:  # pragma: no cover - audit must never block the task
        logger.warning(
            "Unable to record official-document generation audit for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )


def _audit_render_failure(application, document_type: str, exc: Exception, *, attempts: int) -> None:
    """Record a permanently failed official-document render as an Audit_Event (R6.8).

    Writes a non-PII ``AuditLog`` row (``action="official_document_render_failed"``)
    keyed on the application id so a Super_Admin can review and re-trigger
    generation. Only the exception *class name* is stored — never the exception
    message, template text, or document contents — to honour the platform rule
    against logging PII/secrets/document bodies. Best-effort: any failure to
    write the audit row is swallowed so it never shadows the render failure.
    """
    try:
        from apps.common.models import AuditLog

        institution_id = getattr(application, "institution_ref_id", None)
        AuditLog.objects.create(
            actor_id=None,  # system-generated background render, no human actor
            action="official_document_render_failed",
            entity_type="application_document",
            entity_id=getattr(application, "id", None),
            changes={
                "document_type": document_type,
                "institution_id": str(institution_id) if _is_valid_uuid(institution_id) else None,
                "error_type": type(exc).__name__,
                "attempts": attempts,
                "recoverable": True,
            },
            retention_category="standard",
        )
    except Exception:  # pragma: no cover - audit must never block the task
        logger.warning(
            "Unable to record official-document render-failure audit for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )


def _audit_profile_not_configured(application, document_type: str, exc: Exception) -> None:
    """Record a no-profile official-document failure as an Audit_Event (R8.9).

    Writes a non-PII ``AuditLog`` row (``action="official_document_render_failed"``,
    ``error_code="DOCUMENT_PROFILE_NOT_CONFIGURED"``) keyed on the application id
    so a Super_Admin can configure the missing profile and re-trigger generation.
    Mirrors :func:`_audit_render_failure` (no PII / secrets / document bodies):
    only the institution id, document type, and stable error code are stored —
    never the institution name carried by the exception message, applicant data,
    or any document content. ``recoverable`` is ``True`` (configure a profile and
    regenerate) but the render is NOT retried automatically. Best-effort: any
    failure to write the audit row is swallowed so it never shadows the failure.
    """
    try:
        from apps.common.models import AuditLog

        institution_id = getattr(application, "institution_ref_id", None)
        AuditLog.objects.create(
            actor_id=None,  # system-generated background render, no human actor
            action="official_document_render_failed",
            entity_type="application_document",
            entity_id=getattr(application, "id", None),
            changes={
                "document_type": document_type,
                "institution_id": str(institution_id) if _is_valid_uuid(institution_id) else None,
                "error_code": getattr(exc, "code", "DOCUMENT_PROFILE_NOT_CONFIGURED"),
                "status": "failed",
                "recoverable": True,
                "retried": False,
            },
            retention_category="standard",
        )
    except Exception:  # pragma: no cover - audit must never block the task
        logger.warning(
            "Unable to record official-document no-profile audit for application %s",
            getattr(application, "id", None),
            exc_info=True,
        )


def _gather_render_inputs(application, document_type: str, payment=None):
    """Resolve the tenant context, template, and active assets for a render.

    Centralises the four inputs that both the Document_Fingerprint (R6.1) and the
    PDF renderer consume, so the fingerprint is computed over *exactly* the
    inputs the render will use — no drift between "what we hashed" and "what we
    drew". Returns ``(tenant, template, logo_asset, signature_asset)``.
    """
    tenant = _tenant_context(application)
    template = _render_template(application, document_type, tenant, payment)
    # R6.1 / R6.5: the resolved tenant document profile's id + version are
    # fingerprint inputs ("template/profile id+version"), so a profile version
    # bump forces a new Current_Official_Version on the next request. Fold the
    # profile provenance into the ``template`` dict the fingerprint reads — this
    # keeps the pure ``_compute_document_fingerprint`` signature stable while
    # making "what we hashed" cover the profile that actually drives the render.
    _attach_profile_provenance(template, application, document_type)
    logo_asset = _active_asset(application, "logo")
    signature_asset = _active_asset(application, "signature")
    return tenant, template, logo_asset, signature_asset


def _attach_profile_provenance(template: dict[str, Any], application, document_type: str) -> None:
    """Fold the resolved Institution_Document_Profile id+version into ``template``.

    Best-effort and additive: when an active profile resolves for
    ``(application, document_type)`` its ``id`` + ``version`` are written under
    the ``profile_id`` / ``profile_version`` keys that
    ``_compute_document_fingerprint`` reads, so a profile version bump changes
    the fingerprint (R6.5) while the existing template inputs still participate
    independently. Never raises — a resolver failure simply leaves the profile
    inputs null (the template version alone still drives reuse/supersede).
    """
    try:
        from apps.catalog.services import InstitutionDocumentProfileService

        profile = InstitutionDocumentProfileService().resolve(application, document_type)
    except Exception:  # pragma: no cover - resolver must never break generation
        profile = None
    if profile is None:
        return
    profile_id = getattr(profile, "id", None)
    template["profile_id"] = str(profile_id) if profile_id is not None else None
    template["profile_version"] = getattr(profile, "version", None)


def _current_official_version(ApplicationDocument, application, document_type: str):
    """Return the Current_Official_Version for ``(application, document_type)``.

    The latest non-deleted ``system_generated`` ``ApplicationDocument`` by
    ``uploaded_at`` desc (R6.7 — documents with ``verification_status="deleted"``
    are never selected, even when their ``uploaded_at`` is the most recent).
    Returns ``None`` when no current version exists.
    """
    try:
        return (
            ApplicationDocument.objects.filter(
                application=application,
                document_type=document_type,
                system_generated=True,
            )
            .exclude(verification_status="deleted")
            .order_by("-uploaded_at")
            .first()
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        # Legacy mock-based endpoint tests patch Application.objects with plain
        # stand-ins. In that environment there is no safe current-version lookup;
        # treating it as a cache miss preserves the canonical enqueue behavior.
        return None


def _stored_fingerprint(document) -> str | None:
    """Extract the stored Document_Fingerprint from a document's provenance.

    Reads ``verification_notes.official_document.fingerprint`` from the existing
    ``ApplicationDocument.verification_notes`` text column (stored as JSON).
    Returns ``None`` when the notes are absent, not JSON, or carry no
    fingerprint — which forces a regenerate (treated as "changed").
    """
    raw = getattr(document, "verification_notes", None)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, dict):
        return None
    official = parsed.get("official_document")
    if not isinstance(official, dict):
        return None
    fingerprint = official.get("fingerprint")
    return fingerprint if isinstance(fingerprint, str) else None


def _latest_receipt_payment(application):
    """Return the payment row that participates in receipt fingerprints.

    The official-document endpoint and renderer must agree on exactly which
    payment input makes a receipt current. Keep the query in one place so status
    checks do not serve a stale receipt after a newer eligible payment arrives.
    """
    from apps.documents.models import Payment
    from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

    return (
        Payment.objects.filter(
            application_id=getattr(application, "id", None),
            status__in=RECEIPT_ELIGIBLE_STATUSES,
        )
        .order_by("-verified_at", "-created_at")
        .first()
    )


def official_document_matches_current_inputs(application, document_type: str, current=None) -> bool:
    """Whether ``current`` still matches today's render inputs.

    ``Current_Official_Version`` is a row-selection rule, not a freshness proof.
    Before an endpoint exposes a ready/downloadable official document, it must
    recompute the fingerprint over the current application, tenant, template,
    asset, and receipt inputs. Any mismatch returns ``False`` so the endpoint
    can enqueue regeneration instead of serving stale branding or content.
    """
    from apps.documents.models import ApplicationDocument

    if current is None:
        current = _current_official_version(ApplicationDocument, application, document_type)
    if current is None:
        return False

    payment = _latest_receipt_payment(application) if document_type in _RECEIPT_DOCUMENT_TYPES else None
    if document_type in _RECEIPT_DOCUMENT_TYPES and payment is None:
        return False

    try:
        tenant, template, logo_asset, signature_asset = _gather_render_inputs(
            application, document_type, payment
        )
        fingerprint = _compute_document_fingerprint(
            application,
            document_type,
            tenant,
            template,
            logo_asset,
            signature_asset,
            payment,
        )
    except Exception:
        logger.info(
            "Unable to compute official-document fingerprint for application %s (%s); "
            "treating current document as stale",
            getattr(application, "id", None),
            document_type,
            exc_info=True,
        )
        return False

    return _stored_fingerprint(current) == fingerprint


def _render_official_pdf(
    application,
    document_type: str,
    *,
    payment=None,
    tenant=None,
    template=None,
    logo_asset=None,
    signature_asset=None,
):
    """Render an Official_Document, routing through the tenant renderer package.

    Content is built from the resolved ``InstitutionDocumentProfile`` + tenant
    assets by the per-document-type renderers in ``pdf/renderers`` (R8.3); this
    replaces the former inline ``_default_body`` drawing path. The
    ``(buffer, metadata)`` return contract is unchanged, so the
    fingerprint/current-version lifecycle (R6) and the provenance snapshot in
    ``verification_notes.official_document`` are preserved. The pre-resolved
    ``tenant``/``template``/``logo_asset``/``signature_asset`` inputs (used by the
    fingerprint) are threaded into the render context so "what we hashed" and
    "what we drew" stay identical.
    """
    from apps.applications.tasks.pdf.render_context import RenderContext
    from apps.applications.tasks.pdf.renderers import render_official_document

    if tenant is None:
        tenant = _tenant_context(application)
    if template is None:
        template = _render_template(application, document_type, tenant, payment)
    if logo_asset is None:
        logo_asset = _active_asset(application, "logo")
    if signature_asset is None:
        signature_asset = _active_asset(application, "signature")

    # R16.1: the active seal asset participates in the provenance snapshot. It
    # is resolved here (not a fingerprint input) so the snapshot records its id
    # + checksum; institutions without a seal collapse to a null pair.
    seal_asset = _active_asset(application, "seal")

    profile = None
    try:
        from apps.catalog.services import InstitutionDocumentProfileService

        profile = InstitutionDocumentProfileService().resolve(application, document_type)
    except Exception:  # pragma: no cover - resolver must never break the render
        profile = None

    context = RenderContext(
        application=application,
        document_type=document_type,
        tenant=tenant,
        profile=profile,
        logo_asset=logo_asset,
        signature_asset=signature_asset,
        payment=payment,
        seal_asset=seal_asset,
    )
    return render_official_document(context, template=template)


def _beanola_brand() -> dict[str, Any]:
    """Neutral Beanola brand used as the document-generation fallback (R9.3).

    Sourced from :attr:`InstitutionContextService.BEANOLA_BRAND` so the neutral
    fallback for a tenant that has no configured branding is the single
    canonical neutral brand — never a hardcoded legacy-school default. The
    lookup is wrapped defensively (and lazily imported to avoid a circular
    import) so a resolver failure still yields neutral Beanola values rather
    than leaking a school brand or raising inside the render path.
    """
    try:
        from apps.catalog.services import InstitutionContextService

        return InstitutionContextService.BEANOLA_BRAND
    except Exception:  # pragma: no cover - defensive: never break the render
        return {
            "name": "Beanola Admissions",
            "owner": "Beanola Technologies",
            "primary_color": "#0F766E",
            "secondary_color": "#334155",
        }


def _tenant_context(application) -> dict[str, Any]:
    institution = getattr(application, "institution_ref", None)
    institution_id = getattr(institution, "id", "") if institution else ""
    if not _is_valid_uuid(institution_id):
        institution_id = getattr(application, "institution_ref_id", "")
    if not _is_valid_uuid(institution_id):
        institution_id = ""
    # R9.3: when the tenant has no configured brand name/colour the document
    # falls back to the neutral Beanola brand — never to a legacy-school default.
    brand = _beanola_brand()
    return {
        "institution_id": str(institution_id),
        "name": _plain_text(getattr(institution, "brand_name", None))
        or _plain_text(getattr(institution, "name", None))
        or _plain_text(getattr(application, "institution", None))
        or brand["name"],
        "primary_color": _plain_text(getattr(institution, "primary_color", None))
        or brand["primary_color"],
        "admissions_email": _plain_text(getattr(institution, "admissions_email", None))
        or _plain_text(getattr(institution, "email", None)),
        "phone": _plain_text(getattr(institution, "phone", None)),
        "website": _plain_text(getattr(institution, "website", None)),
    }


def _render_template(application, document_type: str, tenant: dict[str, Any], payment=None) -> dict[str, Any]:
    from apps.catalog.services import DocumentTemplateService

    institution_id = tenant.get("institution_id")
    if not institution_id:
        return {"template_id": None, "template_version": None, "sections": {}}
    return DocumentTemplateService().render(
        institution_id=institution_id,
        document_type=document_type,
        context={
            "student_name": application.full_name,
            "application_number": application.application_number,
            "program": application.program,
            "intake": application.intake,
            "institution": tenant.get("name"),
            "receipt_number": getattr(payment, "receipt_number", "") if payment else "",
            "amount": getattr(payment, "amount", "") if payment else "",
            "currency": getattr(payment, "currency", "") if payment else "",
            "date": timezone.now().strftime("%d %B %Y"),
        },
    )


def _active_asset(application, asset_type: str):
    """Return the active tenant branding asset for ``asset_type`` (R9.2/R9.3).

    Resolution is pinned to the application's own ``institution_ref_id``, so the
    returned ``InstitutionAsset`` always belongs to *this* tenant — a logo /
    signature / seal is never sourced from another institution. When the tenant
    has configured an active asset it is used (R9.2: the tenant's own branding);
    when none exists this returns ``None`` and the renderer simply omits the
    image (the neutral fallback) rather than substituting a legacy-school asset
    (R9.3). Brand identity (name/colour) for the missing-asset case falls back to
    the neutral Beanola brand via :func:`_tenant_context` / :func:`_beanola_brand`.
    """
    institution_id = getattr(application, "institution_ref_id", None)
    if not _is_valid_uuid(institution_id):
        return None
    from apps.catalog.models import InstitutionAsset

    return (
        InstitutionAsset.objects.filter(institution_id=institution_id, asset_type=asset_type, is_active=True)
        .order_by("-version", "-created_at")
        .first()
    )


def _asset_fingerprint_parts(asset) -> dict[str, Any]:
    """Canonical (id, checksum) pair for a logo/signature asset, or nulls.

    An asset version bump or swap changes either the id or the checksum, so both
    participate in the fingerprint (R6.6). ``None`` (no active asset configured)
    collapses to a stable null pair. Pure: only reads attributes already loaded
    on the passed object.
    """
    if asset is None:
        return {"id": None, "checksum_sha256": None}
    asset_id = getattr(asset, "id", None)
    return {
        "id": str(asset_id) if asset_id is not None else None,
        "checksum_sha256": getattr(asset, "checksum_sha256", None),
    }


def _canonical_fingerprint_value(value) -> Any:
    """Render a fingerprint input as a JSON-stable scalar.

    Datetimes serialise via ``isoformat`` (date *and* time precision), other
    non-primitive values via ``str``; ``None`` and JSON primitives pass through
    unchanged. Keeps the canonical JSON deterministic across Python sessions.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


def _compute_document_fingerprint(
    application,
    document_type: str,
    tenant: dict[str, Any],
    template: dict[str, Any],
    logo_asset,
    signature_asset,
    payment,
) -> str:
    """Deterministic, input-sensitive fingerprint for an Official_Document (R6.1).

    Returns a hex SHA-256 over the canonical JSON of every input that must
    influence whether a regeneration produces a new Current_Official_Version:

      * application id,
      * document type,
      * application ``status`` + ``updated_at``,
      * institution id (from the tenant context),
      * template/profile id + version,      * logo asset id + checksum, signature asset id + checksum,
      * and — **for receipt document types only** — payment id + receipt number.

    For non-receipt document types the payment inputs are ignored entirely, so a
    payment change never invalidates e.g. an acceptance letter. The function is
    pure (no DB / storage / network access): it reads only attributes already
    present on the passed-in objects, which keeps it cheaply unit-testable in
    isolation.
    """
    application_id = getattr(application, "id", None)
    payload: dict[str, Any] = {
        "application_id": str(application_id) if application_id is not None else None,
        "document_type": document_type,
        "status": _canonical_fingerprint_value(getattr(application, "status", None)),
        "updated_at": _canonical_fingerprint_value(getattr(application, "updated_at", None)),
        "institution_id": (tenant or {}).get("institution_id"),
        # Tenant branding participates in the fingerprint so a rebrand (colour,
        # brand name, admissions contact, website) regenerates the stored
        # Current_Official_Version on the next request rather than serving a
        # stale, unbranded document. These are exactly the tenant fields the
        # layouts draw (letterhead band, heading, contact line).
        "brand": {
            "name": (tenant or {}).get("name"),
            "primary_color": (tenant or {}).get("primary_color"),
            "admissions_email": (tenant or {}).get("admissions_email"),
            "phone": (tenant or {}).get("phone"),
            "website": (tenant or {}).get("website"),
        },
        "template_id": (template or {}).get("template_id"),
        "template_version": (template or {}).get("template_version"),
        # R6.1 / R6.5: the resolved tenant document profile's id + version are
        # fingerprint inputs alongside the template's. ``_gather_render_inputs``
        # folds them into the ``template`` dict via ``_attach_profile_provenance``;
        # absent (no profile resolved) they collapse to a stable null pair.
        "profile_id": (template or {}).get("profile_id"),
        "profile_version": (template or {}).get("profile_version"),
        "logo_asset": _asset_fingerprint_parts(logo_asset),
        "signature_asset": _asset_fingerprint_parts(signature_asset),
    }

    # R6.1: payment/receipt identifiers participate only for receipts; every
    # other document type ignores the payment inputs entirely.
    if document_type in _RECEIPT_DOCUMENT_TYPES:
        payment_id = getattr(payment, "id", None) if payment is not None else None
        payload["payment_id"] = str(payment_id) if payment_id is not None else None
        payload["receipt_number"] = (
            getattr(payment, "receipt_number", None) if payment is not None else None
        )

    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _is_valid_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return False
    return True


def _plain_text(value) -> str:
    if isinstance(value, str):
        return value
    return ""


def _draw_asset(c, asset, x, y, *, max_width, max_height) -> str:
    """Draw a tenant image asset, returning a provenance status string (R6.7).

    Returns one of:
      - ``"none"`` — no asset configured. The image is omitted entirely (the
        neutral fallback for a missing tenant branding asset, R9.3); a
        legacy-school asset is NEVER substituted in its place.
      - ``"unsupported"`` — the asset type cannot be safely rasterised into the
        PDF (e.g. SVG). Untrusted SVG is NEVER executed/parsed here; it is
        treated as unsupported and skipped, and the caller records that fact in
        the provenance snapshot so the omission is explicit, not silent.
      - ``"drawn"`` — the raster image was embedded successfully.
      - ``"error"`` — a configured raster asset failed to load/draw.
    """
    if not asset:
        return "none"
    # R6.7: SVG is vector markup that can carry active/script content. The
    # renderer does not execute or parse it — it marks the type unsupported and
    # skips drawing. (Upload-time validation also rejects active SVG, but the
    # renderer stays defensive and never feeds untrusted SVG to a rasteriser.)
    if asset.mime_type == "image/svg+xml":
        logger.info(
            "Official document: SVG asset %s treated as unsupported (not rendered)",
            getattr(asset, "id", None),
        )
        return "unsupported"
    try:
        from reportlab.lib.utils import ImageReader
        from apps.common.storage import MediaStorage

        storage = MediaStorage()
        with storage.open(asset.storage_key, "rb") as handle:
            image_data = io.BytesIO(handle.read())
        image = ImageReader(image_data)
        width, height = image.getSize()
        scale = min(max_width / width, max_height / height)
        c.drawImage(image, x, y, width=width * scale, height=height * scale, preserveAspectRatio=True, mask="auto")
        return "drawn"
    except Exception:
        logger.warning("Unable to draw tenant asset %s", getattr(asset, "id", None), exc_info=True)
        return "error"


def _safe_hex(value: str):
    from reportlab.lib.colors import HexColor

    # R9.3: the neutral colour fallback is the canonical Beanola brand colour,
    # not a hardcoded legacy school colour. ``_beanola_brand()`` returns
    # ``InstitutionContextService.BEANOLA_BRAND``.
    fallback = _beanola_brand().get("primary_color", "#0F766E")
    try:
        return HexColor(value or fallback)
    except Exception:
        return HexColor(fallback)


def _document_details(application, payment=None):
    details = [
        ("Application Number", application.application_number),
        ("Applicant", application.full_name),
        ("Program", application.program),
        ("Intake", application.intake),
        ("School", application.institution),
        ("Status", application.status.title()),
    ]
    if payment:
        details.extend([
            ("Amount", f"{payment.amount} {payment.currency}"),
            ("Payment Method", payment.payment_method or "N/A"),
            ("Transaction Reference", payment.transaction_reference or "N/A"),
            ("Receipt Number", payment.receipt_number or "N/A"),
            ("Payment Date", payment.verified_at.strftime("%d %B %Y") if payment.verified_at else "N/A"),
        ])
    return details


def _default_body(document_type: str, application, payment=None):
    if document_type == "application_slip":
        return (
            f"This slip confirms that {application.full_name}'s application has been received "
            f"for {application.program} in the {application.intake} intake."
        )
    if document_type == "acceptance_letter":
        return (
            f"Dear {application.full_name},\n\n"
            f"We are pleased to inform you that your application for {application.program} has been accepted. "
            "Please complete any remaining admission requirements before the commencement of the academic session."
        )
    if document_type == "conditional_offer":
        return (
            f"Dear {application.full_name},\n\n"
            f"You have received a conditional offer for {application.program}. "
            "This offer remains subject to the conditions recorded in your admissions portal."
        )
    if document_type in {"finance_receipt", "payment_receipt"}:
        amount = f"{payment.amount} {payment.currency}" if payment else "the recorded amount"
        return f"This is an official receipt confirming payment of {amount} for application {application.application_number}."
    return ""


def _draw_wrapped(c, text: str, x, y, width, *, line_height):
    for paragraph in text.splitlines() or [""]:
        if not paragraph:
            y -= line_height
            continue
        for line in textwrap.wrap(paragraph, width=92):
            c.drawString(x, y, line)
            y -= line_height
    return y


def _generate_acceptance_letter_pdf(application):
    return _render_official_pdf(application, "acceptance_letter")[0]


def _generate_finance_receipt_pdf(application, payment):
    return _render_official_pdf(application, "finance_receipt", payment=payment)[0]

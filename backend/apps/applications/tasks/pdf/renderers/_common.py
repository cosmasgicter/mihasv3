"""Shared renderer helpers: profile-content extraction + provenance metadata.

Every renderer pulls its prose/fee/bank/requirements content from the resolved
``InstitutionDocumentProfile`` on the ``RenderContext`` (R8.3), HTML-escaping all
profile-derived strings drawn into the PDF (defense in depth, R8.6), and builds
the provenance metadata dict in the exact shape the generator stored before
(``document_type``, institution id/name, template id/version, asset ids, per-
asset render status) so the fingerprint/provenance lifecycle is unchanged.
"""

from __future__ import annotations

import html
from typing import Any

from django.utils import timezone

from ..render_context import RenderContext

# Receipt document types additionally carry the payment id + receipt number in
# the provenance snapshot (R16.1).
_RECEIPT_DOCUMENT_TYPES = {"payment_receipt", "finance_receipt"}


def escape(value) -> str:
    """Sanitise a value for drawing onto the reportlab PDF canvas.

    The PDF layouts draw every string with the low-level ``canvas.drawString``
    family, which renders glyphs literally and does NOT interpret any HTML/XML
    markup. HTML-escaping here therefore corrupts the output (an apostrophe
    becomes a literal ``&#x27;``, ``&`` becomes ``&amp;``) with zero security
    benefit. We instead HTML-*unescape*: raw authored text is left untouched
    (unescape is a no-op when there are no entities), while any value that was
    already HTML-escaped upstream — e.g. profile/template sections that passed
    through ``DocumentTemplateService._render_value`` — is restored to its
    real glyphs for the canvas.

    The genuine injection defense (R6.4 token allowlist + escape-at-
    substitution) lives in ``DocumentTemplateService._render_value`` and is
    unaffected by this canvas-side normalisation.
    """
    if value is None:
        return ""
    return html.unescape(str(value))


def profile_section(context: RenderContext, key: str) -> str | None:
    """Return an escaped profile section value, or ``None`` when absent."""
    profile = context.profile
    if profile is None:
        return None
    sections = getattr(profile, "sections", None) or {}
    value = sections.get(key) if isinstance(sections, dict) else None
    if value is None or not str(value).strip():
        return None
    return escape(value)


def profile_signatory(context: RenderContext) -> str | None:
    """Return the escaped signatory line from the profile, or ``None``."""
    profile = context.profile
    if profile is None:
        return None
    signatory = getattr(profile, "signatory", None)
    if isinstance(signatory, dict):
        name = signatory.get("name") or signatory.get("title") or ""
        role = signatory.get("role") or ""
        line = " — ".join(p for p in [str(name), str(role)] if p)
        return escape(line) if line.strip() else None
    if isinstance(signatory, str) and signatory.strip():
        return escape(signatory)
    return None


def _escaped_rows(rows, string_keys) -> list:
    """Escape the string fields of each dict row; pass numbers through."""
    out = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        clean = dict(row)
        for k in string_keys:
            if k in clean:
                clean[k] = escape(clean[k])
        out.append(clean)
    return out


def profile_fee_chart(context: RenderContext) -> list:
    profile = context.profile
    rows = getattr(profile, "fee_chart", None) if profile is not None else None
    return _escaped_rows(rows, ("item", "cadence"))


def profile_bank_accounts(context: RenderContext) -> list:
    profile = context.profile
    rows = getattr(profile, "bank_accounts", None) if profile is not None else None
    return _escaped_rows(rows, ("bank_name", "account_name", "account_number", "branch"))


def profile_requirements(context: RenderContext) -> list:
    profile = context.profile
    rows = getattr(profile, "requirements", None) if profile is not None else None
    return [escape(item) for item in (rows or []) if str(item).strip()]


def _asset_provenance(asset) -> tuple[str | None, str | None]:
    """Return ``(asset_id, checksum_sha256)`` for an asset, or ``(None, None)``.

    A ``None`` asset (none configured / not resolved, e.g. an institution with
    no seal) collapses to a stable null pair so the snapshot key set is always
    complete (R16.1). Only attributes already loaded on the object are read.
    """
    if asset is None:
        return None, None
    asset_id = getattr(asset, "id", None)
    return (
        str(asset_id) if asset_id is not None else None,
        getattr(asset, "checksum_sha256", None),
    )


def build_metadata(
    context: RenderContext,
    template: dict[str, Any],
    logo_render: str,
    signature_render: str,
    *,
    generated_by_user_id: str | None = None,
    generated_by_role: str | None = None,
) -> dict:
    """Full R16.1 provenance snapshot for an Official_Document.

    The snapshot is an immutable, point-in-time record sourced entirely from
    IDs (so it survives institution renames — ``institution_name`` is captured
    as the value at generation time, which is exactly what a later dispute needs
    to see). It carries NO applicant PII and NO document bytes (R16.4): only
    identifiers, asset ids + checksums, render statuses, the generated-by
    actor (where human-triggered; ``None`` for system/background renders), the
    generated-at timestamp, and the Document_Fingerprint (folded in by the
    generator after this returns).
    """
    profile = context.profile
    tenant = context.tenant
    application = context.application

    logo_asset_id, logo_asset_checksum = _asset_provenance(context.logo_asset)
    signature_asset_id, signature_asset_checksum = _asset_provenance(context.signature_asset)
    seal_asset_id, seal_asset_checksum = _asset_provenance(getattr(context, "seal_asset", None))

    def _fk_id(name: str) -> str | None:
        value = getattr(application, name, None)
        return str(value) if value is not None else None

    snapshot: dict[str, Any] = {
        "document_type": context.document_type,
        "institution_id": tenant.get("institution_id"),
        "institution_name": tenant.get("name"),
        # Canonical IDs (R16.1) sourced from the application's FK columns. Null
        # when a legacy row carries no canonical reference.
        "canonical_program_id": _fk_id("canonical_program_id"),
        "program_offering_id": _fk_id("program_offering_id"),
        "intake_id": _fk_id("intake_ref_id"),
        "application_id": _fk_id("id"),
        # Student number is only assigned on full acceptance (enrolment); null
        # for every other application status ("where applicable").
        "student_number": getattr(application, "student_number", None) or None,
        # Profile provenance wins when a tenant profile resolved; the template id
        # is retained as a fallback so existing fingerprint inputs stay stable.
        "template_id": (template or {}).get("template_id"),
        "template_version": (
            getattr(profile, "version", None) if profile is not None else (template or {}).get("template_version")
        ),
        "profile_id": str(getattr(profile, "id", "")) if profile is not None else None,
        "profile_version": getattr(profile, "version", None) if profile is not None else None,
        "logo_asset_id": logo_asset_id,
        "logo_asset_checksum": logo_asset_checksum,
        "signature_asset_id": signature_asset_id,
        "signature_asset_checksum": signature_asset_checksum,
        "seal_asset_id": seal_asset_id,
        "seal_asset_checksum": seal_asset_checksum,
        "logo_render": logo_render,
        "signature_render": signature_render,
        # Human actor where the generation was human-triggered; ``None`` for
        # system/background renders ("where human-triggered").
        "generated_by_user_id": str(generated_by_user_id) if generated_by_user_id else None,
        "generated_by_role": generated_by_role or None,
        "generated_at": timezone.now().isoformat(),
    }

    # Receipts additionally carry the payment id + receipt number (R16.1).
    if context.document_type in _RECEIPT_DOCUMENT_TYPES:
        payment = context.payment
        payment_id = getattr(payment, "id", None) if payment is not None else None
        snapshot["payment_id"] = str(payment_id) if payment_id is not None else None
        snapshot["receipt_number"] = (
            getattr(payment, "receipt_number", None) if payment is not None else None
        )

    return snapshot


def template_body(template: dict[str, Any]) -> str | None:
    """The template's body section (a non-profile fallback), or ``None``."""
    sections = (template or {}).get("sections") or {}
    body = sections.get("body") if isinstance(sections, dict) else None
    if body is None or not str(body).strip():
        return None
    # Template body already passes the safe-token policy; escape for parity with
    # profile content so all drawn prose is uniformly escaped.
    return escape(body)

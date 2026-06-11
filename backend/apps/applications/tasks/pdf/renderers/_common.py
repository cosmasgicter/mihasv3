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

from ..render_context import RenderContext


def escape(value) -> str:
    """HTML-escape any profile-derived value for safe PDF drawing (R8.6)."""
    if value is None:
        return ""
    return html.escape(str(value))


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


def build_metadata(context: RenderContext, template: dict[str, Any], logo_render: str, signature_render: str) -> dict:
    """Provenance metadata in the generator's established shape."""
    profile = context.profile
    tenant = context.tenant
    logo_asset = context.logo_asset
    signature_asset = context.signature_asset
    return {
        "document_type": context.document_type,
        "institution_id": tenant.get("institution_id"),
        "institution_name": tenant.get("name"),
        # Profile provenance wins when a tenant profile resolved; the template id
        # is retained as a fallback so existing fingerprint inputs stay stable.
        "template_id": (template or {}).get("template_id"),
        "template_version": (
            getattr(profile, "version", None) if profile is not None else (template or {}).get("template_version")
        ),
        "profile_id": str(getattr(profile, "id", "")) if profile is not None else None,
        "profile_version": getattr(profile, "version", None) if profile is not None else None,
        "logo_asset_id": str(logo_asset.id) if logo_asset else None,
        "signature_asset_id": str(signature_asset.id) if signature_asset else None,
        "logo_render": logo_render,
        "signature_render": signature_render,
    }


def template_body(template: dict[str, Any]) -> str | None:
    """The template's body section (a non-profile fallback), or ``None``."""
    sections = (template or {}).get("sections") or {}
    body = sections.get("body") if isinstance(sections, dict) else None
    if body is None or not str(body).strip():
        return None
    # Template body already passes the safe-token policy; escape for parity with
    # profile content so all drawn prose is uniformly escaped.
    return escape(body)

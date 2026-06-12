"""Render context for tenant-aware official documents (R8.3).

Bundles, for one ``(application, document_type)`` render, the four inputs the
renderers + the Document_Fingerprint consume: the tenant context, the resolved
``InstitutionDocumentProfile`` (most-specific active match, or ``None``), the
active logo/signature assets, and (for receipts) the payment. The resolver and
tenant/asset helpers are reused from the existing generator — this module never
forks their behavior.

When ``profile`` is ``None`` no active tenant profile resolved for the
institution + document type. Task 15.2 turns that into a ``failed`` generation
status (``DOCUMENT_PROFILE_NOT_CONFIGURED``); 15.1 only surfaces the signal via
``RenderContext.has_profile`` so the no-profile path has a clean seam.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Stable error code for the no-profile failure (canonical catalogue lives in
# ``apps.common.error_codes`` — kept here as a module-level constant so the
# renderer + task can reference it without importing the whole catalogue).
DOCUMENT_PROFILE_NOT_CONFIGURED = "DOCUMENT_PROFILE_NOT_CONFIGURED"

# Document types whose content is built *solely* from a resolved
# Institution_Document_Profile and which must NEVER fall back to frontend /
# default content (design.md Component 4, R8.9). The acceptance letter and the
# conditional offer both render through the fee-chart letter layout from
# profile data (fee chart, banks, requirements, signatory); with no active
# profile the generation is a hard failure rather than a degraded default-body
# render. ``application_slip`` / ``payment_receipt`` / ``finance_receipt`` are
# intentionally NOT profile-required — they keep their existing default-body
# behaviour because the design names only the profile-driven letters here.
PROFILE_REQUIRED_DOCUMENT_TYPES = frozenset(
    {"acceptance_letter", "conditional_offer"}
)


class DocumentProfileNotConfigured(Exception):
    """No active Institution_Document_Profile resolved for a required type (R8.9).

    Raised by the renderer dispatch for a profile-required document type when
    ``RenderContext.has_profile`` is ``False``. The generation task translates
    this into a ``failed`` status + a non-PII ``DOCUMENT_PROFILE_NOT_CONFIGURED``
    audit row, produces no ``ApplicationDocument`` from frontend/default
    content, and does NOT retry — a missing tenant profile is a configuration
    error, not a transient one.
    """

    code = DOCUMENT_PROFILE_NOT_CONFIGURED

    def __init__(self, institution: str, document_type: str):
        self.institution = institution
        self.document_type = document_type
        super().__init__(
            f"no document profile configured for {institution} / {document_type}"
        )


@dataclass(frozen=True)
class RenderContext:
    """Immutable bundle of everything a renderer needs for one document."""

    application: Any
    document_type: str
    tenant: dict[str, Any]
    profile: Any  # InstitutionDocumentProfile | None
    logo_asset: Any
    signature_asset: Any
    payment: Any = None
    seal_asset: Any = None

    @property
    def has_profile(self) -> bool:
        """Whether an active tenant document profile resolved (R8.9 seam)."""
        return self.profile is not None

    @property
    def requires_profile(self) -> bool:
        """Whether this document type must have a resolved profile (R8.9).

        ``True`` for the profile-driven letters (acceptance letter / conditional
        offer); ``False`` for slips/receipts which retain default-body content.
        """
        return self.document_type in PROFILE_REQUIRED_DOCUMENT_TYPES

    @property
    def institution_id(self):
        return (self.tenant or {}).get("institution_id")

    @property
    def institution_name(self):
        return (self.tenant or {}).get("name")


def build_render_context(application, document_type: str, *, payment=None) -> RenderContext:
    """Resolve the tenant context, profile, and assets for a render.

    Reuses ``pdf_generation._tenant_context`` / ``_active_asset`` and
    ``InstitutionDocumentProfileService.resolve`` rather than duplicating any
    lookup logic.
    """
    # Imported lazily to avoid a circular import with the generator module.
    from apps.applications.tasks.pdf_generation import _active_asset, _tenant_context

    tenant = _tenant_context(application)

    profile = None
    try:
        from apps.catalog.services import InstitutionDocumentProfileService

        profile = InstitutionDocumentProfileService().resolve(application, document_type)
    except Exception:  # pragma: no cover - resolver must never break the render seam
        profile = None

    return RenderContext(
        application=application,
        document_type=document_type,
        tenant=tenant,
        profile=profile,
        logo_asset=_active_asset(application, "logo"),
        signature_asset=_active_asset(application, "signature"),
        payment=payment,
        seal_asset=_active_asset(application, "seal"),
    )

"""Per-document-type renderers for official documents (R8.3).

``render_official_document(context, *, template)`` dispatches to the renderer
for ``context.document_type`` and returns ``(buffer, metadata)`` — the same
shape ``pdf_generation._render_official_pdf`` returned, so the generator's
fingerprint/current-version/provenance lifecycle is unchanged. Each renderer
builds its content from the resolved ``InstitutionDocumentProfile`` on the
context (+ tenant assets), never from frontend constants.
"""

from __future__ import annotations

from typing import Any

from ..render_context import DocumentProfileNotConfigured, RenderContext
from . import acceptance_letter, application_slip, conditional_offer, payment_receipt

_RENDERERS = {
    "application_slip": application_slip.render,
    "acceptance_letter": acceptance_letter.render,
    "conditional_offer": conditional_offer.render,
    "payment_receipt": payment_receipt.render,
    "finance_receipt": payment_receipt.render,
}


def render_official_document(context: RenderContext, *, template: dict[str, Any]):
    """Dispatch to the document-type renderer. Returns ``(buffer, metadata)``.

    R8.9 seam: a profile-required document type (acceptance letter / conditional
    offer) with no resolved Institution_Document_Profile raises
    :class:`DocumentProfileNotConfigured` *before* any rendering, so no document
    is ever produced from frontend/default content. The generation task catches
    it, marks the generation ``failed``, records the
    ``DOCUMENT_PROFILE_NOT_CONFIGURED`` audit, and does not retry.
    """
    if context.requires_profile and not context.has_profile:
        raise DocumentProfileNotConfigured(
            institution=context.institution_name or context.institution_id or "unknown",
            document_type=context.document_type,
        )
    renderer = _RENDERERS.get(context.document_type)
    if renderer is None:
        # Unknown type: fall back to the simple-letter renderer so the generator
        # never crashes on an unconfigured document type.
        renderer = application_slip.render
    return renderer(context, template=template)


__all__ = ["render_official_document"]

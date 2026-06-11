"""Payment/finance-receipt renderer (R8.3).

A simple letter whose detail rows already include the payment summary (via the
shared ``_document_details`` helper). Body text comes from the resolved profile
section when present, else the template body, else the default receipt copy.
"""

from __future__ import annotations

from typing import Any

from ..layouts import render_simple_letter
from ..render_context import RenderContext
from . import _common


def render(context: RenderContext, *, template: dict[str, Any]):
    from apps.applications.tasks.pdf_generation import DOCUMENT_CONFIG, _default_body

    body = (
        _common.profile_section(context, "body")
        or _common.template_body(template)
        or _common.escape(_default_body(context.document_type, context.application, context.payment))
    )
    signatory = (
        _common.profile_signatory(context)
        or _common.escape((template.get("sections") or {}).get("signatory"))
        or "Finance Office"
    )

    buffer, logo_render, signature_render = render_simple_letter(
        document_title=DOCUMENT_CONFIG[context.document_type]["title"],
        tenant=context.tenant,
        application=context.application,
        payment=context.payment,
        body=body,
        signatory=signatory,
        logo_asset=context.logo_asset,
        signature_asset=context.signature_asset,
        template_version=getattr(context.profile, "version", None)
        if context.has_profile
        else (template or {}).get("template_version"),
    )
    metadata = _common.build_metadata(context, template, logo_render, signature_render)
    return buffer, metadata

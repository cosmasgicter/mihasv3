"""Conditional-offer renderer (R8.3).

Like the acceptance letter, content (body, fee chart, banks, requirements,
signatory) comes from the resolved profile + tenant assets.
"""

from __future__ import annotations

from typing import Any

from ..layouts import render_fee_chart_letter
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
        or "Admissions Office"
    )

    buffer, logo_render, signature_render = render_fee_chart_letter(
        document_title=DOCUMENT_CONFIG[context.document_type]["title"],
        tenant=context.tenant,
        application=context.application,
        payment=context.payment,
        body=body,
        signatory=signatory,
        logo_asset=context.logo_asset,
        signature_asset=context.signature_asset,
        fee_chart=_common.profile_fee_chart(context),
        bank_accounts=_common.profile_bank_accounts(context),
        requirements=_common.profile_requirements(context),
        template_version=getattr(context.profile, "version", None)
        if context.has_profile
        else (template or {}).get("template_version"),
    )
    metadata = _common.build_metadata(context, template, logo_render, signature_render)
    return buffer, metadata
